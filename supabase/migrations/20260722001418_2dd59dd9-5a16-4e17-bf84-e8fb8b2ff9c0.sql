
DROP VIEW IF EXISTS public.profiles_directorio;

CREATE OR REPLACE FUNCTION public.get_directorio_activos()
RETURNS TABLE (user_id uuid, nombre text, cargo text, sede text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT user_id, nombre, cargo, sede
  FROM public.profiles
  WHERE activo = true
  ORDER BY nombre;
$$;

REVOKE ALL ON FUNCTION public.get_directorio_activos() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_directorio_activos() TO authenticated;
