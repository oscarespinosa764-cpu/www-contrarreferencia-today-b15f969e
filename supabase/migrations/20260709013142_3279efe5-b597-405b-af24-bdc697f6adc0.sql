-- ============================================================
-- Solicitudes y Ausentismo: cambios ADITIVOS (sin borrar nada)
-- ============================================================

-- 1) Ampliar shift_requests con columnas nuevas (nulas / con default)
ALTER TABLE public.shift_requests
  ADD COLUMN IF NOT EXISTS original_shift_name  text,
  ADD COLUMN IF NOT EXISTS original_start_time  time without time zone,
  ADD COLUMN IF NOT EXISTS original_end_time    time without time zone,
  ADD COLUMN IF NOT EXISTS requested_minutes    integer,
  ADD COLUMN IF NOT EXISTS returned_minutes     integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pending_minutes      integer,
  ADD COLUMN IF NOT EXISTS recovery_status      text,
  ADD COLUMN IF NOT EXISTS return_fractioned    boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS replacement_user_id  uuid,
  ADD COLUMN IF NOT EXISTS return_receiver_id   uuid,
  ADD COLUMN IF NOT EXISTS is_limit_exempt      boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS monthly_exception_id uuid,
  ADD COLUMN IF NOT EXISTS support_path         text,
  ADD COLUMN IF NOT EXISTS support_metadata     jsonb,
  ADD COLUMN IF NOT EXISTS cuadro_applied       boolean NOT NULL DEFAULT false;

-- 2) Fracciones de devolución + pendientes de verificación (tabla hija)
CREATE TABLE IF NOT EXISTS public.shift_return_fragments (
  id                  uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  request_id          uuid NOT NULL REFERENCES public.shift_requests(id) ON DELETE CASCADE,
  fragment_no         integer NOT NULL DEFAULT 1,
  return_date         date,
  receiver_id         uuid,
  receiver_name       text,
  receiver_role       text,
  shift_code          text,
  start_time          time without time zone,
  end_time            time without time zone,
  minutes             integer NOT NULL DEFAULT 0,
  notes               text,
  verification_result text NOT NULL DEFAULT 'PENDIENTE', -- PENDIENTE|CUMPLIDA|PARCIAL|NO_CUMPLIDA
  verified_minutes    integer NOT NULL DEFAULT 0,
  verified_by         uuid,
  verified_by_name    text,
  verified_at         timestamp with time zone,
  verification_notes  text,
  created_at          timestamp with time zone NOT NULL DEFAULT now(),
  updated_at          timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_return_fragments_request ON public.shift_return_fragments(request_id);
CREATE INDEX IF NOT EXISTS idx_return_fragments_pending ON public.shift_return_fragments(verification_result) WHERE verification_result = 'PENDIENTE';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.shift_return_fragments TO authenticated;
GRANT ALL ON public.shift_return_fragments TO service_role;
ALTER TABLE public.shift_return_fragments ENABLE ROW LEVEL SECURITY;

-- Ver: admin, o dueño de la solicitud, o el receptor de la fracción
CREATE POLICY "frag_select" ON public.shift_return_fragments FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin')
  OR receiver_id = auth.uid()
  OR EXISTS (SELECT 1 FROM public.shift_requests r WHERE r.id = request_id AND r.requester_id = auth.uid())
);
-- Insertar: admin, o dueño de la solicitud (al crearla)
CREATE POLICY "frag_insert" ON public.shift_return_fragments FOR INSERT TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'admin')
  OR EXISTS (SELECT 1 FROM public.shift_requests r WHERE r.id = request_id AND r.requester_id = auth.uid())
);
-- Actualizar (verificación): solo admin/coordinación
CREATE POLICY "frag_update_admin" ON public.shift_return_fragments FOR UPDATE TO authenticated
USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));
-- Borrar (mientras se edita la solicitud): admin o dueño
CREATE POLICY "frag_delete" ON public.shift_return_fragments FOR DELETE TO authenticated
USING (
  has_role(auth.uid(), 'admin')
  OR EXISTS (SELECT 1 FROM public.shift_requests r WHERE r.id = request_id AND r.requester_id = auth.uid())
);

CREATE TRIGGER trg_return_fragments_updated BEFORE UPDATE ON public.shift_return_fragments
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3) Autorizaciones excepcionales de límite mensual
CREATE TABLE IF NOT EXISTS public.shift_monthly_exceptions (
  id               uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id          uuid NOT NULL,
  user_name        text,
  user_role        text,
  year             integer NOT NULL,
  month            integer NOT NULL,
  request_type     text,
  reason           text NOT NULL,
  counts           jsonb,
  status           text NOT NULL DEFAULT 'PENDIENTE',   -- PENDIENTE|APROBADA|NEGADA
  usage_status     text NOT NULL DEFAULT 'DISPONIBLE',  -- DISPONIBLE|UTILIZADA|VENCIDA
  used_request_id  uuid,
  used_at          timestamp with time zone,
  reviewed_by      uuid,
  reviewed_by_name text,
  reviewed_at      timestamp with time zone,
  review_reason    text,
  created_at       timestamp with time zone NOT NULL DEFAULT now(),
  updated_at       timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_monthly_exc_user ON public.shift_monthly_exceptions(user_id, year, month);
-- Una sola excepción PENDIENTE por funcionario/mes
CREATE UNIQUE INDEX IF NOT EXISTS uq_monthly_exc_pending
  ON public.shift_monthly_exceptions(user_id, year, month)
  WHERE status = 'PENDIENTE';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.shift_monthly_exceptions TO authenticated;
GRANT ALL ON public.shift_monthly_exceptions TO service_role;
ALTER TABLE public.shift_monthly_exceptions ENABLE ROW LEVEL SECURITY;

-- Ver: admin, o el propio funcionario
CREATE POLICY "exc_select" ON public.shift_monthly_exceptions FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'admin') OR user_id = auth.uid());
-- Crear: el propio funcionario (solicita) o admin
CREATE POLICY "exc_insert" ON public.shift_monthly_exceptions FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid() OR has_role(auth.uid(), 'admin'));
-- Actualizar: admin (aprobar/negar) o el propio funcionario (marcar UTILIZADA)
CREATE POLICY "exc_update" ON public.shift_monthly_exceptions FOR UPDATE TO authenticated
USING (has_role(auth.uid(), 'admin') OR user_id = auth.uid())
WITH CHECK (has_role(auth.uid(), 'admin') OR user_id = auth.uid());

CREATE TRIGGER trg_monthly_exc_updated BEFORE UPDATE ON public.shift_monthly_exceptions
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();