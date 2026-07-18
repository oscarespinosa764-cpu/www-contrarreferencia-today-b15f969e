
REVOKE ALL ON FUNCTION public.calcular_indicadores_mes(integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.calcular_indicadores_mes(integer, integer) TO service_role;

REVOKE ALL ON FUNCTION public.set_eapb_snapshot() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_eapb_snapshot() TO service_role;
