
-- FASE 5E · Bloque C.2 — Defensa server-side global del doble canal de gestión.
-- Trigger fail-closed sobre public.seguimientos. SECURITY INVOKER (default):
-- solo lee catálogos y casos que el propio usuario ya puede leer vía RLS; si no
-- puede resolverlos, la regla cae en fail-closed (rechaza el doble canal).

CREATE OR REPLACE FUNCTION private.norm_txt(_v text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT upper(btrim(regexp_replace(
    translate(coalesce(_v, ''), 'áéíóúÁÉÍÓÚäëïöüÄËÏÖÜàèìòùÀÈÌÒÙñÑ', 'aeiouAEIOUaeiouAEIOUaeiouAEIOUnN'),
    '\s+', ' ', 'g')))
$$;

CREATE OR REPLACE FUNCTION private.seguimientos_canal_gestion_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
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
    RETURN NEW; -- históricos y registros sin canal estructurado: sin cambios.
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

  -- A partir de aquí: exactamente dos canales. Única combinación autorizada.
  IF NOT ('CORREO_ELECTRONICO' = ANY(v_canales) AND 'PLATAFORMA_WEB' = ANY(v_canales)) THEN
    RAISE EXCEPTION 'La selección simultánea solo está permitida para Correo Electrónico y Plataforma Web en Evolución Diaria cuando la EAPB/ERP tiene ambos canales habilitados.'
      USING ERRCODE = 'check_violation';
  END IF;

  v_tipo := private.norm_txt(NEW.tipo_seguimiento);
  IF v_tipo <> 'EVOLUCION DIARIA' THEN
    RAISE EXCEPTION 'La selección simultánea solo está permitida para Correo Electrónico y Plataforma Web en Evolución Diaria cuando la EAPB/ERP tiene ambos canales habilitados.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- EAPB/ERP real del caso, resuelta en servidor según el módulo real.
  IF NEW.tipo_caso = 'remision' THEN
    SELECT eapb INTO v_eapb FROM public.remisiones WHERE id = NEW.caso_id;
  ELSIF NEW.tipo_caso = 'entrante' THEN
    SELECT eapb INTO v_eapb FROM public.casos_entrantes WHERE id = NEW.caso_id;
  ELSIF NEW.tipo_caso = 'domiciliario' THEN
    SELECT eapb INTO v_eapb FROM public.domiciliarios WHERE id = NEW.caso_id;
  ELSIF NEW.tipo_caso = 'referencia_interna' THEN
    SELECT eapb INTO v_eapb FROM public.referencia_interna WHERE id = NEW.caso_id;
  ELSE
    v_eapb := NULL; -- pendientes y cualquier otro módulo: fail-closed.
  END IF;

  IF v_eapb IS NULL OR btrim(v_eapb) = '' THEN
    RAISE EXCEPTION 'No fue posible validar la configuración de la EAPB/ERP. Seleccione un solo canal de gestión.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Coincidencia exacta normalizada sobre el catálogo activo. Cero o múltiples
  -- coincidencias ⇒ fail-closed (nunca se elige la primera arbitrariamente).
  SELECT count(*) INTO v_n
    FROM public.catalogos c
   WHERE c.tipo = 'EAPB'
     AND coalesce(c.activo, false) = true
     AND private.norm_txt(c.valor) = private.norm_txt(v_eapb);

  IF v_n = 0 THEN
    RAISE EXCEPTION 'No fue posible validar la configuración de la EAPB/ERP. Seleccione un solo canal de gestión.'
      USING ERRCODE = 'check_violation';
  ELSIF v_n > 1 THEN
    RAISE EXCEPTION 'La configuración de la EAPB/ERP requiere revisión. Seleccione un solo canal de gestión.'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT c.eapb_correo_radicacion, c.seguimientos_en_plataforma
    INTO v_correo, v_plataforma
    FROM public.catalogos c
   WHERE c.tipo = 'EAPB'
     AND coalesce(c.activo, false) = true
     AND private.norm_txt(c.valor) = private.norm_txt(v_eapb);

  IF coalesce(btrim(v_correo), '') = ''
     OR lower(btrim(coalesce(v_correo, ''))) IN ('null', 'undefined')
     OR coalesce(v_plataforma, false) <> true THEN
    RAISE EXCEPTION 'La selección simultánea solo está permitida para Correo Electrónico y Plataforma Web en Evolución Diaria cuando la EAPB/ERP tiene ambos canales habilitados.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Normaliza el orden canónico antes de persistir.
  NEW.detalles := jsonb_set(
    NEW.detalles,
    '{canales_gestion}',
    '["CORREO_ELECTRONICO","PLATAFORMA_WEB"]'::jsonb,
    true
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_seguimientos_canal_gestion_guard ON public.seguimientos;
CREATE TRIGGER trg_seguimientos_canal_gestion_guard
  BEFORE INSERT OR UPDATE ON public.seguimientos
  FOR EACH ROW EXECUTE FUNCTION private.seguimientos_canal_gestion_guard();

REVOKE ALL ON FUNCTION private.norm_txt(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.seguimientos_canal_gestion_guard() FROM PUBLIC, anon, authenticated;
