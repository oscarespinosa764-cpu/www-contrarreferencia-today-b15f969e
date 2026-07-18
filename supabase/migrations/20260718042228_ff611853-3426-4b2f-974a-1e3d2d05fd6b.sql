CREATE OR REPLACE FUNCTION public.seguimientos_ri_gating()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  ts text;
BEGIN
  IF NEW.tipo_caso IS DISTINCT FROM 'referencia_interna' THEN
    RETURN NEW;
  END IF;

  SELECT tipo_solicitud INTO ts
    FROM public.referencia_interna
   WHERE id = NEW.caso_id;

  IF ts IS NULL THEN
    RETURN NEW;
  END IF;

  IF NOT private.ri_paso_permitido(NEW.caso_id, ts, NEW.tipo_seguimiento) THEN
    RAISE EXCEPTION 'El seguimiento "%" no está permitido en este momento para la secuencia de Referencia Interna. Registre primero el paso previo.',
      NEW.tipo_seguimiento
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;