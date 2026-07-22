
-- Move directorio SECURITY DEFINER logic to private schema; expose a thin SECURITY INVOKER wrapper in public.
CREATE OR REPLACE FUNCTION private.get_directorio_activos()
RETURNS TABLE(user_id uuid, nombre text, cargo text, sede text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT user_id, nombre, cargo, sede
  FROM public.profiles
  WHERE activo = true
  ORDER BY nombre;
$$;

REVOKE ALL ON FUNCTION private.get_directorio_activos() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_directorio_activos()
RETURNS TABLE(user_id uuid, nombre text, cargo text, sede text)
LANGUAGE sql
STABLE SECURITY INVOKER
SET search_path = public
AS $$
  SELECT * FROM private.get_directorio_activos();
$$;

REVOKE ALL ON FUNCTION public.get_directorio_activos() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_directorio_activos() TO authenticated;
