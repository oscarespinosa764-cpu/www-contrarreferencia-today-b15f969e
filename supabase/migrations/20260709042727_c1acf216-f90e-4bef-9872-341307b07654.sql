-- ─────────────────────────────────────────────────────────────────────────────
-- Fase 6 — HALLAZGO 6: función SECURITY DEFINER ejecutable por autenticados.
-- shift_monthly_usage necesita omitir RLS para contar coberturas ajenas, así que
-- el cuerpo DEFINER se mueve al esquema private (NO expuesto por la API) y el
-- público pasa a ser un wrapper SECURITY INVOKER, igual que has_role/is_active_member.
-- Reversible: recrear la función public como SECURITY DEFINER y DROP de la private.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION private.shift_monthly_usage(_user_id uuid, _year integer, _month integer)
 RETURNS TABLE(solicitudes integer, coberturas integer, pendientes integer, aprobadas integer, exentos integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path = public
AS $function$
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
    COALESCE(SUM(CASE WHEN s.requester_id = _user_id AND NOT s.exento THEN 1 ELSE 0 END), 0)::int,
    COALESCE(SUM(CASE WHEN s.replacement_user_id = _user_id THEN 1 ELSE 0 END), 0)::int,
    COALESCE(SUM(CASE WHEN ((s.requester_id = _user_id AND NOT s.exento) OR s.replacement_user_id = _user_id) AND s.es_pendiente THEN 1 ELSE 0 END), 0)::int,
    COALESCE(SUM(CASE WHEN ((s.requester_id = _user_id AND NOT s.exento) OR s.replacement_user_id = _user_id) AND NOT s.es_pendiente THEN 1 ELSE 0 END), 0)::int,
    COALESCE(SUM(CASE WHEN s.requester_id = _user_id AND s.exento THEN 1 ELSE 0 END), 0)::int
  FROM scoped s
  WHERE (_user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
$function$;

REVOKE EXECUTE ON FUNCTION private.shift_monthly_usage(uuid, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.shift_monthly_usage(uuid, integer, integer) TO authenticated, service_role;

-- Wrapper público SIN privilegios elevados: delega en la función privada.
CREATE OR REPLACE FUNCTION public.shift_monthly_usage(_user_id uuid, _year integer, _month integer)
 RETURNS TABLE(solicitudes integer, coberturas integer, pendientes integer, aprobadas integer, exentos integer)
 LANGUAGE sql
 STABLE SECURITY INVOKER
 SET search_path = public
AS $function$
  SELECT * FROM private.shift_monthly_usage(_user_id, _year, _month);
$function$;

REVOKE EXECUTE ON FUNCTION public.shift_monthly_usage(uuid, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.shift_monthly_usage(uuid, integer, integer) TO authenticated, service_role;