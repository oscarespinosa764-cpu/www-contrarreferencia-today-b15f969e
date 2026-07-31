-- Los guardias son funciones de trigger que invocan private.norm_txt /
-- private.eapb_catalogo_cfg. Al ser SECURITY INVOKER se ejecutaban como
-- `authenticated`, que no tiene EXECUTE sobre el esquema private
-- (permission denied for function norm_txt). Se convierten en SECURITY
-- DEFINER con propietario postgres y search_path fijo: no se amplía ningún
-- grant, no se elimina ningún trigger y toda la validación se conserva.

ALTER FUNCTION private.seguimientos_canal_gestion_guard() SECURITY DEFINER;
ALTER FUNCTION private.seguimientos_canal_gestion_guard() SET search_path = '';
ALTER FUNCTION private.seguimientos_canal_gestion_guard() OWNER TO postgres;

ALTER FUNCTION private.seguimientos_evolucion_guard() SECURITY DEFINER;
ALTER FUNCTION private.seguimientos_evolucion_guard() SET search_path = '';
ALTER FUNCTION private.seguimientos_evolucion_guard() OWNER TO postgres;

-- Salida temprana: el guardia de canal solo necesita lógica de EAPB cuando
-- hay combinación dual; se evalúa el tipo antes de cualquier consulta.
CREATE OR REPLACE FUNCTION private.seguimientos_canal_gestion_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
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
  v_msg_dual text := 'La selección simultánea solo está permitida para Correo Electrónico y Plataforma Web en Evolución Diaria cuando la EAPB/ERP tiene ambos canales habilitados.';
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

  -- Canal único: nada más que validar (cualquier tipo de seguimiento).
  IF array_length(v_canales, 1) = 1 THEN
    RETURN NEW;
  END IF;

  -- A partir de aquí solo hay combinaciones; fuera de EVOLUCIÓN DIARIA se
  -- rechaza de inmediato sin tocar catálogos ni tablas de casos.
  v_tipo := private.norm_txt(NEW.tipo_seguimiento);
  IF v_tipo <> 'EVOLUCION DIARIA' THEN
    RAISE EXCEPTION '%', v_msg_dual USING ERRCODE = 'check_violation';
  END IF;

  IF array_length(v_canales, 1) > 2 THEN
    RAISE EXCEPTION 'Solo se permiten dos canales en la combinación autorizada.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NOT ('CORREO_ELECTRONICO' = ANY(v_canales) AND 'PLATAFORMA_WEB' = ANY(v_canales)) THEN
    RAISE EXCEPTION '%', v_msg_dual USING ERRCODE = 'check_violation';
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
    RAISE EXCEPTION '%', v_msg_dual USING ERRCODE = 'check_violation';
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

ALTER FUNCTION private.seguimientos_canal_gestion_guard() OWNER TO postgres;

-- Permisos finales: el esquema private permanece cerrado.
REVOKE ALL ON FUNCTION private.norm_txt(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.eapb_es_nueva_eps(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.eapb_catalogo_cfg(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.seguimientos_canal_gestion_guard() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.seguimientos_evolucion_guard() FROM PUBLIC, anon, authenticated;