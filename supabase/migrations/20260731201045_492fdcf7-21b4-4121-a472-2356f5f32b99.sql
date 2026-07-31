-- Resolución canónica ÚNICA del registro activo del catálogo EAPB.
-- 1) equivalencia exacta normalizada; 2) allowlist de alias NUEVA EPS.
CREATE OR REPLACE FUNCTION private.eapb_catalogo_cfg(_txt text)
RETURNS TABLE(n int, correo text, plataforma boolean)
LANGUAGE plpgsql
STABLE
SET search_path TO ''
AS $function$
DECLARE
  v_n int := 0;
BEGIN
  IF _txt IS NULL OR btrim(_txt) = '' THEN
    n := 0; correo := NULL; plataforma := NULL; RETURN NEXT; RETURN;
  END IF;

  SELECT count(*) INTO v_n
    FROM public.catalogos c
   WHERE c.tipo = 'EAPB' AND coalesce(c.activo,false) = true
     AND private.norm_txt(c.valor) = private.norm_txt(_txt);

  IF v_n = 1 THEN
    SELECT 1, c.eapb_correo_radicacion, c.seguimientos_en_plataforma
      INTO n, correo, plataforma
      FROM public.catalogos c
     WHERE c.tipo = 'EAPB' AND coalesce(c.activo,false) = true
       AND private.norm_txt(c.valor) = private.norm_txt(_txt);
    RETURN NEXT; RETURN;
  ELSIF v_n > 1 THEN
    n := v_n; correo := NULL; plataforma := NULL; RETURN NEXT; RETURN;
  END IF;

  IF private.eapb_es_nueva_eps(_txt) THEN
    SELECT count(*) INTO v_n
      FROM public.catalogos c
     WHERE c.tipo = 'EAPB' AND coalesce(c.activo,false) = true
       AND private.eapb_es_nueva_eps(c.valor);
    IF v_n = 1 THEN
      SELECT 1, c.eapb_correo_radicacion, c.seguimientos_en_plataforma
        INTO n, correo, plataforma
        FROM public.catalogos c
       WHERE c.tipo = 'EAPB' AND coalesce(c.activo,false) = true
         AND private.eapb_es_nueva_eps(c.valor);
      RETURN NEXT; RETURN;
    END IF;
    n := v_n; correo := NULL; plataforma := NULL; RETURN NEXT; RETURN;
  END IF;

  n := 0; correo := NULL; plataforma := NULL; RETURN NEXT; RETURN;
END;
$function$;

REVOKE ALL ON FUNCTION private.eapb_catalogo_cfg(text) FROM PUBLIC;

-- Guard de canal de gestión: misma resolución canónica que la interfaz.
CREATE OR REPLACE FUNCTION private.seguimientos_canal_gestion_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $function$
DECLARE
  v_canales text[];
  v_permitidos text[] := ARRAY[
    'CONTACTO_TELEFONICO','FISICO_PRESENCIAL','CORREO_ELECTRONICO',
    'PLATAFORMA_WEB','MENSAJERIA_INSTANTANEA_WHATSAPP','OTRO'
  ];
  v_tipo text;
  v_eapb text;
  v_n int;
  v_correo text;
  v_plataforma boolean;
BEGIN
  IF NEW.detalles IS NULL OR jsonb_typeof(NEW.detalles->'canales_gestion') <> 'array' THEN
    RETURN NEW;
  END IF;

  SELECT array_agg(upper(btrim(x))) INTO v_canales
    FROM jsonb_array_elements_text(NEW.detalles->'canales_gestion') AS t(x);
  v_canales := coalesce(v_canales, '{}'::text[]);

  IF array_length(v_canales, 1) IS NULL THEN
    RETURN NEW;
  END IF;

  IF EXISTS (SELECT 1 FROM unnest(v_canales) c WHERE NOT (c = ANY(v_permitidos))) THEN
    RAISE EXCEPTION 'Canal de gestión no válido.' USING ERRCODE = 'check_violation';
  END IF;

  IF (SELECT count(DISTINCT c) FROM unnest(v_canales) c) <> array_length(v_canales, 1) THEN
    RAISE EXCEPTION 'Canal de gestión duplicado.' USING ERRCODE = 'check_violation';
  END IF;

  IF array_length(v_canales, 1) = 1 THEN
    RETURN NEW;
  END IF;

  IF array_length(v_canales, 1) > 2 THEN
    RAISE EXCEPTION 'Solo se permiten dos canales en la combinación autorizada.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NOT ('CORREO_ELECTRONICO' = ANY(v_canales) AND 'PLATAFORMA_WEB' = ANY(v_canales)) THEN
    RAISE EXCEPTION 'La selección simultánea solo está permitida para Correo Electrónico y Plataforma Web en Evolución Diaria cuando la EAPB/ERP tiene ambos canales habilitados.'
      USING ERRCODE = 'check_violation';
  END IF;

  v_tipo := private.norm_txt(NEW.tipo_seguimiento);
  IF v_tipo <> 'EVOLUCION DIARIA' THEN
    RAISE EXCEPTION 'La selección simultánea solo está permitida para Correo Electrónico y Plataforma Web en Evolución Diaria cuando la EAPB/ERP tiene ambos canales habilitados.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.tipo_caso = 'remision' THEN
    SELECT coalesce(nullif(btrim(asegurador), ''), eapb) INTO v_eapb
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

  IF coalesce(v_n,0) = 0 THEN
    RAISE EXCEPTION 'No fue posible validar la configuración de la EAPB/ERP. Seleccione un solo canal de gestión.'
      USING ERRCODE = 'check_violation';
  ELSIF v_n > 1 THEN
    RAISE EXCEPTION 'La configuración de la EAPB/ERP requiere revisión. Seleccione un solo canal de gestión.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF coalesce(btrim(v_correo), '') = ''
     OR lower(btrim(coalesce(v_correo, ''))) IN ('null', 'undefined')
     OR coalesce(v_plataforma, false) <> true THEN
    RAISE EXCEPTION 'La selección simultánea solo está permitida para Correo Electrónico y Plataforma Web en Evolución Diaria cuando la EAPB/ERP tiene ambos canales habilitados.'
      USING ERRCODE = 'check_violation';
  END IF;

  NEW.detalles := jsonb_set(
    NEW.detalles,
    '{canales_gestion}',
    '["CORREO_ELECTRONICO","PLATAFORMA_WEB"]'::jsonb,
    true
  );

  RETURN NEW;
END;
$function$;

-- Guard de evolución diaria: misma resolución canónica del catálogo.
CREATE OR REPLACE FUNCTION private.seguimientos_evolucion_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $function$
DECLARE
  v_tipo text;
  v_eapb text;
  v_remision_por text;
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
    v_correo_req := coalesce(btrim(v_correo),'') <> ''
                    AND lower(btrim(coalesce(v_correo,''))) NOT IN ('null','undefined');
    v_plat_req := coalesce(v_plataforma,false);
  END IF;

  v_requeridos := '{}';
  IF v_correo_req THEN v_requeridos := array_append(v_requeridos,'CORREO_ELECTRONICO'); END IF;
  IF v_plat_req THEN v_requeridos := array_append(v_requeridos,'PLATAFORMA_WEB'); END IF;
  IF array_length(v_requeridos,1) IS NULL THEN
    v_requeridos := ARRAY['CORREO_ELECTRONICO'];
    v_correo_req := true;
  END IF;

  IF jsonb_typeof(NEW.detalles->'canales_gestion') = 'array' THEN
    SELECT coalesce(array_agg(upper(btrim(x))), '{}')
      INTO v_canales
      FROM jsonb_array_elements_text(NEW.detalles->'canales_gestion') AS t(x);
  END IF;
  SELECT coalesce(array_agg(c), '{}') INTO v_realizados
    FROM unnest(v_requeridos) c WHERE c = ANY(v_canales);

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

  IF NEW.tipo_caso = 'remision'
     AND v_correo_req AND v_plat_req
     AND private.eapb_es_nueva_eps(v_eapb)
     AND private.norm_txt(coalesce(v_remision_por,'')) = 'RED NO CONTRATADA' THEN
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