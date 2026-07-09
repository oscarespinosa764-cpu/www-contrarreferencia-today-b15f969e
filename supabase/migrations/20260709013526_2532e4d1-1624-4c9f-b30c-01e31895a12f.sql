CREATE OR REPLACE FUNCTION public.shift_monthly_usage(_user_id uuid, _year int, _month int)
RETURNS TABLE(solicitudes int, coberturas int, pendientes int, aprobadas int, exentos int)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH base AS (
    SELECT
      r.requester_id,
      r.replacement_user_id,
      r.status,
      (r.is_limit_exempt OR r.reason_type IN ('Cita médica','Calamidad')) AS exento,
      (r.status IN ('PENDIENTE','DEVUELTA PARA AJUSTE')) AS es_pendiente,
      COALESCE(
        CASE WHEN r.request_type = 'cambio_turno' THEN r.original_shift_date ELSE r.start_date END,
        r.created_at::date
      ) AS base_date
    FROM public.shift_requests r
    WHERE r.status IN ('PENDIENTE','DEVUELTA PARA AJUSTE','APROBADA','EJECUTADA')
  ), scoped AS (
    SELECT * FROM base
    WHERE EXTRACT(YEAR FROM base_date) = _year
      AND EXTRACT(MONTH FROM base_date) = _month
  )
  SELECT
    -- solo el propio funcionario o un admin obtienen datos
    COALESCE(SUM(CASE WHEN s.requester_id = _user_id AND NOT s.exento THEN 1 ELSE 0 END), 0)::int,
    COALESCE(SUM(CASE WHEN s.replacement_user_id = _user_id THEN 1 ELSE 0 END), 0)::int,
    COALESCE(SUM(CASE WHEN ((s.requester_id = _user_id AND NOT s.exento) OR s.replacement_user_id = _user_id) AND s.es_pendiente THEN 1 ELSE 0 END), 0)::int,
    COALESCE(SUM(CASE WHEN ((s.requester_id = _user_id AND NOT s.exento) OR s.replacement_user_id = _user_id) AND NOT s.es_pendiente THEN 1 ELSE 0 END), 0)::int,
    COALESCE(SUM(CASE WHEN s.requester_id = _user_id AND s.exento THEN 1 ELSE 0 END), 0)::int
  FROM scoped s
  WHERE (_user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
$$;

GRANT EXECUTE ON FUNCTION public.shift_monthly_usage(uuid, int, int) TO authenticated;