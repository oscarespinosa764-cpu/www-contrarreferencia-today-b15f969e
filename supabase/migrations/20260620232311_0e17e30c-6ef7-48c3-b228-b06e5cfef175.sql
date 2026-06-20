-- Prevent non-admin users from changing their own `activo` flag.
-- A deactivated user still holds a valid JWT until expiry; without this guard
-- they could call profiles.update({ activo: true }) and reactivate themselves.

CREATE OR REPLACE FUNCTION public.protect_profile_activo()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only an active admin may change the `activo` flag.
  IF NEW.activo IS DISTINCT FROM OLD.activo THEN
    IF NOT public.has_role(auth.uid(), 'admin') THEN
      RAISE EXCEPTION 'Solo un administrador puede cambiar el estado de la cuenta.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_profile_activo ON public.profiles;

CREATE TRIGGER trg_protect_profile_activo
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_profile_activo();