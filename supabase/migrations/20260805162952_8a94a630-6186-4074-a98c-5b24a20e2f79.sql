CREATE OR REPLACE FUNCTION public.casos_entrantes_clasificacion_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_tipo text := upper(coalesce(NEW.tipo, ''));
  v_padre text;
BEGIN
  IF v_tipo = 'ACEP' THEN
    NEW.clasificacion_solicitud := 'ACEPTADO';
  ELSIF v_tipo = 'NEG' THEN
    NEW.clasificacion_solicitud := 'NEGADO';
  ELSIF v_tipo = 'SIN_GESTION' THEN
    NEW.clasificacion_solicitud := 'INGRESO_SIN_GESTION_PREVIA_REFERENCIA';
  ELSIF v_tipo LIKE 'CRUE%' THEN
    -- Precedencia acotada a la MISMA solicitud: solo cuenta una decisión
    -- explícita del propio caso (cod_ref). Nunca se heredan decisiones
    -- antiguas de otros casos del mismo documento.
    IF NEW.cod_ref IS NOT NULL THEN
      SELECT upper(c.tipo) INTO v_padre
        FROM public.casos_entrantes c
       WHERE c.codigo = NEW.cod_ref
         AND upper(c.tipo) IN ('ACEP','NEG')
       LIMIT 1;
    END IF;
    IF v_padre = 'ACEP' THEN
      NEW.clasificacion_solicitud := 'ACEPTADO';
    ELSIF v_padre = 'NEG' THEN
      NEW.clasificacion_solicitud := 'NEGADO';
    ELSE
      NEW.clasificacion_solicitud := 'DIRECCIONAMIENTO_CRUE';
    END IF;
  ELSE
    IF NEW.cod_ref IS NOT NULL THEN
      SELECT c.clasificacion_solicitud INTO NEW.clasificacion_solicitud
        FROM public.casos_entrantes c
       WHERE c.codigo = NEW.cod_ref
       LIMIT 1;
    ELSE
      NEW.clasificacion_solicitud := NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;