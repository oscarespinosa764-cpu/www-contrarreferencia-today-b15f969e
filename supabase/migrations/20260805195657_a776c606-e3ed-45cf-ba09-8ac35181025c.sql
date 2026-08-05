DROP POLICY IF EXISTS "Casos: editores crean" ON public.casos_entrantes;
DROP POLICY IF EXISTS "Casos: editores actualizan" ON public.casos_entrantes;
REVOKE INSERT, UPDATE ON public.casos_entrantes FROM authenticated;
GRANT SELECT ON public.casos_entrantes TO authenticated;
GRANT ALL ON public.casos_entrantes TO service_role;