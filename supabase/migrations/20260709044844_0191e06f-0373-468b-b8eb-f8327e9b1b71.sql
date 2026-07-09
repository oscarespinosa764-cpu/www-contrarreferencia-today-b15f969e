-- Guard de columnas administrativas en shift_monthly_exceptions.
-- Reutiliza public.has_role (rol real desde BD). Reversible: DROP TRIGGER + DROP FUNCTION.
CREATE OR REPLACE FUNCTION public.guard_shift_monthly_exceptions_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- Administrador/coordinador (rol real): control total.
  IF public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;

  -- Operaciones server-side confiables (service_role sin sesión): exentas.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  -- A partir de aquí el actor es operativo. La política exc_update ya garantizó
  -- que user_id = auth.uid() (solo su propia fila).

  -- Nunca puede tocar columnas administrativas de revisión ni datos base.
  IF NEW.reviewed_by        IS DISTINCT FROM OLD.reviewed_by
     OR NEW.reviewed_by_name IS DISTINCT FROM OLD.reviewed_by_name
     OR NEW.reviewed_at      IS DISTINCT FROM OLD.reviewed_at
     OR NEW.review_reason    IS DISTINCT FROM OLD.review_reason
     OR NEW.user_id          IS DISTINCT FROM OLD.user_id
     OR NEW.user_name        IS DISTINCT FROM OLD.user_name
     OR NEW.user_role        IS DISTINCT FROM OLD.user_role
     OR NEW.year             IS DISTINCT FROM OLD.year
     OR NEW.month            IS DISTINCT FROM OLD.month
     OR NEW.counts           IS DISTINCT FROM OLD.counts
     OR NEW.created_at       IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'No puede modificar campos administrativos de la excepción'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Transiciones de estado permitidas al propietario: solo RETIRAR una pendiente.
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT (OLD.status = 'PENDIENTE' AND NEW.status = 'CANCELADA') THEN
      RAISE EXCEPTION 'No puede cambiar el estado de la excepción a %', NEW.status
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  -- Consumo de una excepción aprobada: DISPONIBLE -> UTILIZADA (único uso).
  IF NEW.usage_status IS DISTINCT FROM OLD.usage_status THEN
    IF NOT (OLD.status = 'APROBADA'
            AND OLD.usage_status = 'DISPONIBLE'
            AND NEW.usage_status = 'UTILIZADA') THEN
      RAISE EXCEPTION 'Transición de uso no permitida'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  -- used_request_id / used_at solo pueden fijarse durante el consumo (UTILIZADA).
  IF (NEW.used_request_id IS DISTINCT FROM OLD.used_request_id
      OR NEW.used_at IS DISTINCT FROM OLD.used_at)
     AND NEW.usage_status <> 'UTILIZADA' THEN
    RAISE EXCEPTION 'No puede modificar el consumo de la excepción'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- reason / request_type solo son editables mientras esté PENDIENTE.
  IF (NEW.reason IS DISTINCT FROM OLD.reason
      OR NEW.request_type IS DISTINCT FROM OLD.request_type)
     AND OLD.status <> 'PENDIENTE' THEN
    RAISE EXCEPTION 'Solo puede editar el motivo mientras la solicitud esté pendiente'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_shift_monthly_exceptions_update ON public.shift_monthly_exceptions;
CREATE TRIGGER trg_guard_shift_monthly_exceptions_update
BEFORE UPDATE ON public.shift_monthly_exceptions
FOR EACH ROW EXECUTE FUNCTION public.guard_shift_monthly_exceptions_update();