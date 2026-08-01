CREATE OR REPLACE FUNCTION private.seguimientos_ri_destino_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  d jsonb := COALESCE(NEW.detalles, '{}'::jsonb);
  tipo_dest text := upper(btrim(COALESCE(d->>'destino_examen_tipo','')));
  sede_cod  text := upper(btrim(COALESCE(d->>'sede_ips_codigo','')));
  ips_nom   text := btrim(COALESCE(d->>'ips_externa_nombre',''));
  sede_lbl  text;
BEGIN
  IF NEW.tipo_caso IS DISTINCT FROM 'referencia_interna'
     OR upper(btrim(COALESCE(NEW.tipo_seguimiento,''))) <> 'PENDIENTE COORDINACIÓN FECHA Y HORA EXAMEN' THEN
    RETURN NEW;
  END IF;

  IF tipo_dest NOT IN ('SEDE_IPS','IPS_EXTERNA') THEN
    RAISE EXCEPTION 'Debe indicar dónde se realizará el examen (SEDE IPS o IPS EXTERNA).'
      USING ERRCODE = 'check_violation';
  END IF;

  IF tipo_dest = 'SEDE_IPS' THEN
    IF ips_nom <> '' THEN
      RAISE EXCEPTION 'No puede registrar sede propia e IPS externa simultáneamente.'
        USING ERRCODE = 'check_violation';
    END IF;
    sede_lbl := CASE sede_cod
      WHEN 'SEDE_PRINCIPAL' THEN 'SEDE PRINCIPAL'
      WHEN 'SEDE_CONSULTA_ESPECIALIZADA' THEN 'SEDE CONSULTA ESPECIALIZADA'
      WHEN 'SEDE_SALA_ROSA' THEN 'SEDE SALA ROSA'
      WHEN 'SEDE_CLINICA_GLORIA_PATRICIA_PINZON' THEN 'SEDE CLÍNICA GLORIA PATRICIA PINZÓN'
      WHEN 'SEDE_SAN_VICENTE_DEL_CAGUAN' THEN 'SEDE SAN VICENTE DEL CAGUÁN'
      ELSE NULL
    END;
    IF sede_lbl IS NULL THEN
      RAISE EXCEPTION 'Sede no autorizada para la realización del examen.'
        USING ERRCODE = 'check_violation';
    END IF;
    NEW.detalles := d
      || jsonb_build_object(
           'destino_examen_tipo','SEDE_IPS',
           'sede_ips_codigo', sede_cod,
           'sede_ips_nombre', sede_lbl,
           'ips_externa_nombre', NULL,
           'ips_externa_origen', NULL);
  ELSE
    IF sede_cod <> '' THEN
      RAISE EXCEPTION 'No puede registrar sede propia e IPS externa simultáneamente.'
        USING ERRCODE = 'check_violation';
    END IF;
    IF length(ips_nom) < 3 OR length(ips_nom) > 160
       OR ips_nom ~ '[<>]'
       OR lower(ips_nom) IN ('null','undefined') THEN
      RAISE EXCEPTION 'Nombre de IPS externa no válido (3 a 160 caracteres, sin HTML).'
        USING ERRCODE = 'check_violation';
    END IF;
    NEW.detalles := d
      || jsonb_build_object(
           'destino_examen_tipo','IPS_EXTERNA',
           'sede_ips_codigo', NULL,
           'sede_ips_nombre', NULL,
           'ips_externa_nombre', ips_nom,
           'ips_externa_origen',
             CASE WHEN upper(COALESCE(d->>'ips_externa_origen','')) = 'CATALOGO'
                  THEN 'CATALOGO' ELSE 'MANUAL' END);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS seguimientos_ri_destino_guard ON public.seguimientos;
CREATE TRIGGER seguimientos_ri_destino_guard
BEFORE INSERT ON public.seguimientos
FOR EACH ROW EXECUTE FUNCTION private.seguimientos_ri_destino_guard();