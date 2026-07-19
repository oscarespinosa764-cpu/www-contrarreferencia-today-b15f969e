
CREATE OR REPLACE FUNCTION public.protect_profile_activo()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.activo IS DISTINCT FROM OLD.activo THEN
    -- Operaciones server-side confiables (service_role sin sesión): la server
    -- function ya validó que el ejecutor es admin activo antes de escribir.
    IF auth.uid() IS NULL THEN
      RETURN NEW;
    END IF;
    IF NOT public.has_role(auth.uid(), 'admin') THEN
      RAISE EXCEPTION 'Solo un administrador puede cambiar el estado de la cuenta.';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;
