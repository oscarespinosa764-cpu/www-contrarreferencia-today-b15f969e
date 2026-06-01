-- 1. Helper: only active users with an assigned role are "members"
CREATE OR REPLACE FUNCTION public.is_active_member(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = _user_id AND p.activo = true
  ) AND EXISTS (
    SELECT 1 FROM public.user_roles r
    WHERE r.user_id = _user_id
  )
$$;

-- 2. has_role now requires the user's profile to be active (enforces deactivation)
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.profiles p ON p.user_id = ur.user_id
    WHERE ur.user_id = _user_id
      AND ur.role = _role
      AND p.activo = true
  )
$$;

-- 3. can_edit now requires the user's profile to be active
CREATE OR REPLACE FUNCTION public.can_edit(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.profiles p ON p.user_id = ur.user_id
    WHERE ur.user_id = _user_id
      AND ur.role IN ('admin','operativa')
      AND p.activo = true
  )
$$;

-- 4. New signups no longer get automatic access (pending approval model)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, nombre)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'nombre', NEW.email));

  -- Only the coordinator email becomes admin automatically.
  -- Everyone else stays WITHOUT a role until an admin grants one.
  IF lower(NEW.email) = 'coordreferencia@cedimips.com' THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'admin');
  END IF;

  RETURN NEW;
END;
$$;

-- 5. Restrict SELECT on sensitive tables to active members only
DROP POLICY IF EXISTS "Casos: autenticados ven" ON public.casos_entrantes;
CREATE POLICY "Casos: miembros activos ven"
ON public.casos_entrantes FOR SELECT TO authenticated
USING (public.is_active_member(auth.uid()));

DROP POLICY IF EXISTS "Remisiones: autenticados ven" ON public.remisiones;
CREATE POLICY "Remisiones: miembros activos ven"
ON public.remisiones FOR SELECT TO authenticated
USING (public.is_active_member(auth.uid()));

DROP POLICY IF EXISTS "Seguimientos: autenticados ven" ON public.seguimientos;
CREATE POLICY "Seguimientos: miembros activos ven"
ON public.seguimientos FOR SELECT TO authenticated
USING (public.is_active_member(auth.uid()));

DROP POLICY IF EXISTS "Catalogos: autenticados ven" ON public.catalogos;
CREATE POLICY "Catalogos: miembros activos ven"
ON public.catalogos FOR SELECT TO authenticated
USING (public.is_active_member(auth.uid()));

-- 6. Lock down trigger-only SECURITY DEFINER functions so signed-in users
--    cannot call them directly (they only run from triggers).
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;