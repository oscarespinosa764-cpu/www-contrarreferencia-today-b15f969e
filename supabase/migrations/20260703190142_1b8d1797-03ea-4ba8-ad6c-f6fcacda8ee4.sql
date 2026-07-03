-- Fix 1: control_mando INSERT must be attributed to the inserting user
DROP POLICY IF EXISTS "ControlMando: miembros activos registran" ON public.control_mando;
CREATE POLICY "ControlMando: miembros activos registran"
ON public.control_mando
FOR INSERT
TO authenticated
WITH CHECK (
  is_active_member(auth.uid())
  AND usuario = auth.uid()
);

-- Fix 2: shift_request_audit INSERT must be attributed to the inserting user
-- and reference a shift request they own (admins may write for any request)
DROP POLICY IF EXISTS "ra_insert" ON public.shift_request_audit;
CREATE POLICY "ra_insert"
ON public.shift_request_audit
FOR INSERT
TO authenticated
WITH CHECK (
  is_active_member(auth.uid())
  AND user_id = auth.uid()
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.shift_requests r
      WHERE r.id = shift_request_audit.request_id
        AND r.requester_id = auth.uid()
    )
  )
);