
CREATE OR REPLACE FUNCTION private.domi_tipos_solicitud_validate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  permitidos text[] := ARRAY['PHD','PAD','PAD_CRONICO','UNIDADES_ESPECIALES','OXIGENO_DOMICILIARIO','AMBULANCIA_EGRESO'];
  t text[];
  s text;
BEGIN
  IF NEW.tipos_solicitud IS NULL THEN
    RETURN NEW; -- registros históricos / migración
  END IF;
  t := NEW.tipos_solicitud;
  IF array_length(t,1) IS NULL OR array_length(t,1) < 1 OR array_length(t,1) > 4 THEN
    RAISE EXCEPTION 'Seleccione entre 1 y 4 tipos de solicitud.';
  END IF;
  IF (SELECT count(DISTINCT x) FROM unnest(t) x) <> array_length(t,1) THEN
    RAISE EXCEPTION 'No se permiten tipos de solicitud duplicados.';
  END IF;
  FOREACH s IN ARRAY t LOOP
    IF NOT (s = ANY(permitidos)) THEN
      RAISE EXCEPTION 'Tipo de solicitud no válido: %', s;
    END IF;
  END LOOP;

  IF 'UNIDADES_ESPECIALES' = ANY(t) THEN
    NEW.unidad_especial_solicitada := btrim(coalesce(NEW.unidad_especial_solicitada,''));
    IF length(NEW.unidad_especial_solicitada) < 3 OR length(NEW.unidad_especial_solicitada) > 120 THEN
      RAISE EXCEPTION 'Indique la unidad especial solicitada (3 a 120 caracteres).';
    END IF;
  ELSE
    NEW.unidad_especial_solicitada := NULL;
  END IF;

  IF 'AMBULANCIA_EGRESO' = ANY(t) THEN
    IF coalesce(NEW.tipo_ambulancia_codigo,'') NOT IN ('TAB','TAM','TAM_N') THEN
      RAISE EXCEPTION 'Seleccione el tipo de ambulancia (TAB, TAM o TAM-N).';
    END IF;
  ELSE
    NEW.tipo_ambulancia_codigo := NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_domi_tipos_solicitud_validate ON public.domiciliarios;
CREATE TRIGGER trg_domi_tipos_solicitud_validate
BEFORE INSERT OR UPDATE OF tipos_solicitud, unidad_especial_solicitada, tipo_ambulancia_codigo
ON public.domiciliarios
FOR EACH ROW EXECUTE FUNCTION private.domi_tipos_solicitud_validate();
