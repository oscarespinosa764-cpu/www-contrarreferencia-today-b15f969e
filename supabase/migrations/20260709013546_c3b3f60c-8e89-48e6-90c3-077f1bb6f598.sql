REVOKE EXECUTE ON FUNCTION public.shift_monthly_usage(uuid, int, int) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.shift_monthly_usage(uuid, int, int) FROM anon;
GRANT EXECUTE ON FUNCTION public.shift_monthly_usage(uuid, int, int) TO authenticated;