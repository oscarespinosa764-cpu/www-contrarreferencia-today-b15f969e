REVOKE EXECUTE ON FUNCTION public.get_directorio_activos() FROM authenticated, anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_directorio_activos() TO service_role;