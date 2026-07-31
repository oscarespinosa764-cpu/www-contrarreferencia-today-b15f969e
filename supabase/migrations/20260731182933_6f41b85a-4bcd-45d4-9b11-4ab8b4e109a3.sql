CREATE OR REPLACE FUNCTION private.seguimientos_evolucion_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $function$
DECLARE
  v_tipo text;
  v_eapb text;
  v_tramite text;
  v_esp_raw text;
  v_n int;
  v_correo text;
  v_plataforma boolean;
  v_correo_req boolean := false;
  v_plat_req boolean := false;
  v_canales text[] := '{}';
  v_realizados text[] := '{}';
  v_requeridos text[] := '{}';
  v_exentos text[] := '{}';
  v_exigibles text[] := '{}';
  v_pendientes text[] := '{}';
  v_pf_txt text;
  v_pf boolean := NULL;
  v_esp_req text[] := '{}';
  v_esp_evo text[] := '{}';
  v_esp_pend text[] := '{}';
  v_excepcion text := NULL;
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
  -- Solo registros nuevos con estructura canónica del resolver.
  IF NOT (NEW.detalles ? 'estado_cumplimiento') THEN
    RETURN NEW;
  END IF;

  -- 1) EAPB/ERP real del caso según el módulo.
  IF NEW.tipo_caso = 'remision' THEN
    SELECT eapb, tipo_tramite, especialidades_tratantes
      INTO v_eapb, v_tramite, v_esp_raw
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

  -- 2) Configuración del catálogo activo (coincidencia exacta normalizada).
  IF v_eapb IS NOT NULL AND btrim(v_eapb) <> '' THEN
    SELECT count(*) INTO v_n
      FROM public.catalogos c
     WHERE c.tipo = 'EAPB' AND coalesce(c.activo,false) = true
       AND private.norm_txt(c.valor) = private.norm_txt(v_eapb);
    IF v_n = 1 THEN
      SELECT c.eapb_correo_radicacion, c.seguimientos_en_plataforma
        INTO v_correo, v_plataforma
        FROM public.catalogos c
       WHERE c.tipo = 'EAPB' AND coalesce(c.activo,false) = true
         AND private.norm_txt(c.valor) = private.norm_txt(v_eapb);
      v_correo_req := coalesce(btrim(v_correo),'') <> ''
                      AND lower(btrim(coalesce(v_correo,''))) NOT IN ('null','undefined');
      v_plat_req := coalesce(v_plataforma,false);
    END IF;
  END IF;

  v_requeridos := '{}';
  IF v_correo_req THEN v_requeridos := array_append(v_requeridos,'CORREO_ELECTRONICO'); END IF;
  IF v_plat_req THEN v_requeridos := array_append(v_requeridos,'PLATAFORMA_WEB'); END IF;
  IF array_length(v_requeridos,1) IS NULL THEN
    v_requeridos := ARRAY['CORREO_ELECTRONICO'];
    v_correo_req := true;
  END IF;

  -- 3) Canales realizados: SOLO desde canales_gestion (fuente estructurada).
  IF jsonb_typeof(NEW.detalles->'canales_gestion') = 'array' THEN
    SELECT coalesce(array_agg(upper(btrim(x))), '{}')
      INTO v_canales
      FROM jsonb_array_elements_text(NEW.detalles->'canales_gestion') AS t(x);
  END IF;
  SELECT coalesce(array_agg(c), '{}') INTO v_realizados
    FROM unnest(v_requeridos) c WHERE c = ANY(v_canales);

  -- 4) Plataforma funcionando (acepta booleano o SI/NO).
  v_pf_txt := upper(btrim(coalesce(NEW.detalles->>'plataforma_funcionando','')));
  IF v_pf_txt IN ('TRUE','SI','SÍ') THEN v_pf := true;
  ELSIF v_pf_txt IN ('FALSE','NO') THEN v_pf := false;
  ELSE v_pf := NULL; END IF;

  IF v_plat_req AND v_pf IS FALSE AND 'PLATAFORMA_WEB' = ANY(v_canales) THEN
    RAISE EXCEPTION 'No puede registrar PLATAFORMA WEB como realizada cuando la plataforma de la EAPB no está funcionando.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- 5) Especialidades tratantes reales del caso.
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

  -- 6) Excepción canónica NUEVA EPS + RED NO CONTRATADA (solo remisiones).
  IF NEW.tipo_caso = 'remision'
     AND v_correo_req AND v_plat_req
     AND private.norm_txt(v_eapb) = 'NUEVA EPS'
     AND private.norm_txt(coalesce(v_tramite,'')) = 'RED NO CONTRATADA' THEN
    IF v_pf IS TRUE AND 'PLATAFORMA_WEB' = ANY(v_canales) THEN
      v_exentos := ARRAY['CORREO_ELECTRONICO'];
      v_excepcion := 'NUEVA_EPS_RED_NO_CONTRATADA';
    ELSIF v_pf IS FALSE AND 'CORREO_ELECTRONICO' = ANY(v_canales)
          AND NOT ('PLATAFORMA_WEB' = ANY(v_canales)) THEN
      v_exentos := ARRAY['PLATAFORMA_WEB'];
      v_excepcion := 'NUEVA_EPS_RED_NO_CONTRATADA';
    END IF;
  END IF;

  SELECT coalesce(array_agg(c), '{}') INTO v_exigibles
    FROM unnest(v_requeridos) c WHERE NOT (c = ANY(v_exentos));
  SELECT coalesce(array_agg(c), '{}') INTO v_pendientes
    FROM unnest(v_exigibles) c WHERE NOT (c = ANY(v_canales));

  v_falla := v_plat_req AND v_pf IS FALSE AND NOT ('PLATAFORMA_WEB' = ANY(v_canales));

  v_motivo := nullif(upper(btrim(coalesce(NEW.detalles->>'motivo_pendiente',''))), '');
  IF v_falla AND v_motivo IS NULL THEN
    v_motivo := 'PLATAFORMA EAPB NO FUNCIONAL';
  END IF;

  -- 7) Estado único, calculado SIEMPRE en servidor.
  IF coalesce(array_length(v_realizados,1),0) = 0
     AND coalesce(array_length(v_esp_evo,1),0) = 0 THEN
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
         'motivo_pendiente', CASE WHEN v_motivo IS NULL THEN 'null'::jsonb ELSE to_jsonb(v_motivo) END,
         'estado_cumplimiento', to_jsonb(v_estado)
       );

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_seguimientos_evolucion_guard ON public.seguimientos;
CREATE TRIGGER trg_seguimientos_evolucion_guard
BEFORE INSERT OR UPDATE ON public.seguimientos
FOR EACH ROW EXECUTE FUNCTION private.seguimientos_evolucion_guard();

REVOKE ALL ON FUNCTION private.seguimientos_evolucion_guard() FROM PUBLIC, anon, authenticated;