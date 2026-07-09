-- ─────────────────────────────────────────────────────────────────────────────
-- Fase 2 — HALLAZGO 1: req_update_own permitía cambiar columnas administrativas.
-- Defensa en profundidad: se CONSERVA la política de fila (dueño) y se agrega un
-- trigger BEFORE UPDATE que protege columnas administrativas para no-admins.
-- Reversible: DROP TRIGGER + DROP FUNCTION.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.guard_shift_request_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  -- Administrador/coordinador (rol real desde BD) puede modificar todo.
  IF public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;

  -- A partir de aquí el actor es operativo. La política req_update_own ya
  -- garantizó que requester_id = auth.uid() (solo edita solicitudes propias).

  -- Solo se puede editar mientras la solicitud admita edición.
  IF OLD.status NOT IN ('BORRADOR', 'PENDIENTE', 'DEVUELTA PARA AJUSTE') THEN
    RAISE EXCEPTION 'No puede modificar una solicitud en estado %', OLD.status
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- El operativo solo puede cambiar el estado para CANCELAR su solicitud.
  IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status <> 'CANCELADA' THEN
    RAISE EXCEPTION 'No puede cambiar el estado de la solicitud a %', NEW.status
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Campos administrativos: deben permanecer idénticos para un operativo.
  IF NEW.requester_id            IS DISTINCT FROM OLD.requester_id
     OR NEW.approved_by          IS DISTINCT FROM OLD.approved_by
     OR NEW.approved_at          IS DISTINCT FROM OLD.approved_at
     OR NEW.rejected_by          IS DISTINCT FROM OLD.rejected_by
     OR NEW.rejected_at          IS DISTINCT FROM OLD.rejected_at
     OR NEW.approval_observation IS DISTINCT FROM OLD.approval_observation
     OR NEW.rejection_reason     IS DISTINCT FROM OLD.rejection_reason
     OR NEW.response_observation IS DISTINCT FROM OLD.response_observation
     OR NEW.out_of_rule_justification IS DISTINCT FROM OLD.out_of_rule_justification
     OR NEW.cuadro_applied       IS DISTINCT FROM OLD.cuadro_applied
     OR NEW.monthly_exception_id IS DISTINCT FROM OLD.monthly_exception_id
     OR NEW.is_limit_exempt      IS DISTINCT FROM OLD.is_limit_exempt
     OR NEW.recovery_status      IS DISTINCT FROM OLD.recovery_status
     OR NEW.returned_minutes     IS DISTINCT FROM OLD.returned_minutes
     OR NEW.pending_minutes      IS DISTINCT FROM OLD.pending_minutes
     OR NEW.register_absenteeism IS DISTINCT FROM OLD.register_absenteeism
  THEN
    RAISE EXCEPTION 'No puede modificar campos administrativos de la solicitud'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN NEW;
END;
$$;

-- La función es auxiliar de RLS/negocio: no debe ser ejecutable como RPC.
REVOKE EXECUTE ON FUNCTION public.guard_shift_request_update() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_guard_shift_request_update ON public.shift_requests;
CREATE TRIGGER trg_guard_shift_request_update
  BEFORE UPDATE ON public.shift_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_shift_request_update();