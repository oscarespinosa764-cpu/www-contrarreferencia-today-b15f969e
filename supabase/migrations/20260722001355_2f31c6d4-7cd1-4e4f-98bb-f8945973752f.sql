
CREATE OR REPLACE VIEW public.profiles_directorio
WITH (security_invoker=off) AS
SELECT user_id, nombre, cargo, sede, activo
FROM public.profiles;

GRANT SELECT ON public.profiles_directorio TO authenticated;
