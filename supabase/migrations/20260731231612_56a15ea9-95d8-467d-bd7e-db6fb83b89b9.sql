CREATE OR REPLACE FUNCTION private.seguimientos_evolucion_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_tipo text;
  v_eapb text;
  v_remision_por text;
  v_esp_raw text;
  v_n int;
  v_correo boolean;
  v_plataforma boolean;
  v_correo_req boolean := false;
  v_plat_req boolean := false;
  v_canales text[] := '{}';
  v_realizados text[] := '{}';
  v_requeridos text[] := '{}';
  v_exentos text[] := '{}';
  v_bloqueados text[] := '{}';
  v_exigibles text[] := '{}';
  v_pendientes text[] := '{}';
  v_pf_txt text;
  v_pf boolean := NULL;
  v_esp_req text[] := '{}';
  v_esp_evo text[] := '{}';
  v_esp_pend text[] := '{}';
  v_excepcion text := NULL;
  v_variante text := NULL;
  v_estado text;
  v_falla boolean := false;
  v_motivo text;
BEGIN
  v_tipo := private.norm_txt(NEW.tipo_seguimiento);
  IF v_tipo <> 'EVOLUCION DIARIA' THEN
    RETURN NEW;
  END IF;
  IF NEW.detalles IS NULL OR jsonb_typeof(NEW.detalles) <> 'object' THEN
    RETURN NEW;
  END IF;
  IF NOT (NEW.detalles ? 'estado_cumplimiento') THEN
    RETURN NEW;
  END IF;

  IF NEW.tipo_caso = 'remision' THEN
    SELECT coalesce(nullif(btrim(asegurador), ''), eapb), remision_por, especialidades_tratantes
      INTO v_eapb, v_remision_por, v_esp_raw
      FROM public.remisiones WHERE id = NEW.caso_id;
  ELSIF NEW.tipo_caso = 'entrante' THEN
    SELECT eapb INTO v_eapb FROM public.casos_entrantes WHERE id = NEW.caso_id;
  ELSIF NEW.tipo_caso = 'domiciliario' THEN
    SELECT eapb INTO v_eapb FROM public.domiciliarios WHERE id = NEW.caso_id;
  ELSIF NEW.tipo_caso = 'referencia_interna' THEN
    SELECT eapb INTO v_eapb FROM public.referencia_interna WHERE id = NEW.caso_id;
  ELSE
    v_eapb := NULL;
  END IF;

  SELECT r.n, r.correo, r.plataforma INTO v_n, v_correo, v_plataforma
    FROM private.eapb_catalogo_cfg(v_eapb) r;

  IF coalesce(v_n,0) = 1 THEN
    v_correo_req := coalesce(v_correo,false);
    v_plat_req := coalesce(v_plataforma,false);
  END IF;

  v_requeridos := '{}';
  IF v_correo_req THEN v_requeridos := array_append(v_requeridos,'CORREO_ELECTRONICO'); END IF;
  IF v_plat_req THEN v_requeridos := array_append(v_requeridos,'PLATAFORMA_WEB'); END IF;

  IF jsonb_typeof(NEW.detalles->'canales_gestion') = 'array' THEN
    SELECT coalesce(array_agg(upper(btrim(x))), '{}')
      INTO v_canales
      FROM jsonb_array_elements_text(NEW.detalles->'canales_gestion') AS t(x);
  END IF;

  v_pf_txt := upper(btrim(coalesce(NEW.detalles->>'plataforma_funcionando','')));
  IF v_pf_txt IN ('TRUE','SI','SÍ') THEN v_pf := true;
  ELSIF v_pf_txt IN ('FALSE','NO') THEN v_pf := false;
  ELSE v_pf := NULL; END IF;

  IF v_plat_req AND v_pf IS FALSE AND 'PLATAFORMA_WEB' = ANY(v_canales) THEN
    RAISE EXCEPTION 'No puede registrar PLATAFORMA WEB como realizada cuando la plataforma de la EAPB no está funcionando.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF coalesce(btrim(coalesce(v_esp_raw,'')),'') <> '' THEN
    SELECT coalesce(array_agg(upper(btrim(x))), '{}') INTO v_esp_req
      FROM unnest(regexp_split_to_array(v_esp_raw, '[,;]')) AS t(x)
     WHERE btrim(x) <> '';
  END IF;

  IF jsonb_typeof(NEW.detalles->'especialidades_evolucionadas') = 'array' THEN
    SELECT coalesce(array_agg(DISTINCT upper(btrim(x))), '{}') INTO v_esp_evo
      FROM jsonb_array_elements_text(NEW.detalles->'especialidades_evolucionadas') AS t(x)
     WHERE btrim(x) <> '';
  END IF;

  IF EXISTS (SELECT 1 FROM unnest(v_esp_evo) e WHERE NOT (e = ANY(v_esp_req))) THEN
    RAISE EXCEPTION 'Especialidad no válida para este caso.' USING ERRCODE = 'check_violation';
  END IF;

  SELECT coalesce(array_agg(e), '{}') INTO v_esp_pend
    FROM unnest(v_esp_req) e WHERE NOT (e = ANY(v_esp_evo));

  -- Excepción canónica NUEVA EPS + RED NO CONTRATADA (Fase 5E · C.6):
  -- depende solo del contexto y de ¿plataforma funcionando?, nunca de lo
  -- que el cliente haya seleccionado.
  IF NEW.tipo_caso = 'remision'
     AND v_correo_req AND v_plat_req
     AND private.eapb_es_nueva_eps(v_eapb)
     AND private.norm_txt(coalesce(v_remision_por,'')) = 'RED NO CONTRATADA' THEN
    IF v_pf IS TRUE THEN
      v_exentos := ARRAY['CORREO_ELECTRONICO'];
      v_bloqueados := ARRAY['CORREO_ELECTRONICO'];
      v_requeridos := ARRAY['PLATAFORMA_WEB'];
      v_excepcion := 'NUEVA_EPS_RED_NO_CONTRATADA';
      v_variante := 'PLATAFORMA_FUNCIONANDO';
    ELSIF v_pf IS FALSE THEN
      v_exentos := ARRAY['PLATAFORMA_WEB'];
      v_bloqueados := ARRAY['PLATAFORMA_WEB'];
      v_excepcion := 'NUEVA_EPS_RED_NO_CONTRATADA';
      v_variante := 'PLATAFORMA_CAIDA';
    END IF;
  END IF;

  IF v_excepcion IS NOT NULL
     AND EXISTS (SELECT 1 FROM unnest(v_bloqueados) b WHERE b = ANY(v_canales)) THEN
    RAISE EXCEPTION 'En este caso (NUEVA EPS · RED NO CONTRATADA) solo aplica un canal de evolución: %',
      CASE WHEN v_variante = 'PLATAFORMA_FUNCIONANDO' THEN 'PLATAFORMA WEB' ELSE 'CORREO ELECTRONICO' END
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT coalesce(array_agg(c), '{}') INTO v_exigibles
    FROM unnest(v_requeridos) c WHERE NOT (c = ANY(v_exentos));
  SELECT coalesce(array_agg(c), '{}') INTO v_realizados
    FROM unnest(v_exigibles) c WHERE c = ANY(v_canales);
  SELECT coalesce(array_agg(c), '{}') INTO v_pendientes
    FROM unnest(v_exigibles) c WHERE NOT (c = ANY(v_canales));

  v_falla := v_plat_req AND v_pf IS FALSE AND NOT ('PLATAFORMA_WEB' = ANY(v_canales));

  IF v_excepcion IS NOT NULL THEN
    v_motivo := NULL;
  ELSE
    v_motivo := nullif(upper(btrim(coalesce(NEW.detalles->>'motivo_pendiente',''))), '');
    IF v_falla AND v_motivo IS NULL THEN
      v_motivo := 'PLATAFORMA EAPB NO FUNCIONAL';
    END IF;
  END IF;

  IF coalesce(array_length(v_realizados,1),0) = 0
     AND coalesce(array_length(v_esp_evo,1),0) = 0
     AND coalesce(array_length(v_canales,1),0) = 0 THEN
    v_estado := 'SIN_EVOLUCIONAR';
  ELSIF coalesce(array_length(v_pendientes,1),0) = 0
        AND coalesce(array_length(v_esp_pend,1),0) = 0 THEN
    v_estado := 'EVOLUCIONADO';
  ELSE
    v_estado := 'EVOLUCION_PARCIAL';
  END IF;

  NEW.detalles := NEW.detalles
    || jsonb_build_object(
         'canales_requeridos', to_jsonb(v_requeridos),
         'canales_realizados', to_jsonb(v_realizados),
         'canales_pendientes', to_jsonb(v_pendientes),
         'canales_exentos', to_jsonb(v_exentos),
         'especialidades_requeridas', to_jsonb(v_esp_req),
         'especialidades_evolucionadas', to_jsonb(v_esp_evo),
         'especialidades_pendientes', to_jsonb(v_esp_pend),
         'plataforma_funcionando', CASE WHEN v_plat_req THEN to_jsonb(v_pf) ELSE 'null'::jsonb END,
         'plataforma_pendiente_por_falla', CASE WHEN v_falla THEN 'true'::jsonb ELSE 'null'::jsonb END,
         'excepcion_aplicada', CASE WHEN v_excepcion IS NULL THEN 'null'::jsonb ELSE to_jsonb(v_excepcion) END,
         'variante_excepcion', CASE WHEN v_variante IS NULL THEN 'null'::jsonb ELSE to_jsonb(v_variante) END,
         'motivo_pendiente', CASE WHEN v_motivo IS NULL THEN 'null'::jsonb ELSE to_jsonb(v_motivo) END,
         'estado_cumplimiento', to_jsonb(v_estado)
       );

  RETURN NEW;
END;
$function$;

ALTER FUNCTION private.seguimientos_evolucion_guard() OWNER TO postgres;
REVOKE ALL ON FUNCTION private.seguimientos_evolucion_guard() FROM PUBLIC;