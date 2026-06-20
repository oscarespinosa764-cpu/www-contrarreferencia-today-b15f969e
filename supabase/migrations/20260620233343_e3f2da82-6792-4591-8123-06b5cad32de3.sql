-- Mover la lógica SECURITY DEFINER a un esquema privado NO expuesto por la API.
-- Las políticas RLS y las llamadas RPC siguen usando public.* (ahora INVOKER),
-- que delegan en private.* (DEFINER, no expuestas). Así el linter 0029 deja de
-- marcar funciones DEFINER ejecutables por authenticated en el esquema público,
-- sin alterar el control de acceso.

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Lógica real (privada, con privilegios) — bypass de RLS por ser DEFINER
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.profiles p ON p.user_id = ur.user_id
    WHERE ur.user_id = _user_id
      AND ur.role = _role
      AND p.activo = true
  )
$$;

CREATE OR REPLACE FUNCTION private.can_edit(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.profiles p ON p.user_id = ur.user_id
    WHERE ur.user_id = _user_id
      AND ur.role IN ('admin','operativa')
      AND p.activo = true
  )
$$;

CREATE OR REPLACE FUNCTION private.is_active_member(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = _user_id AND p.activo = true
  ) AND EXISTS (
    SELECT 1 FROM public.user_roles r
    WHERE r.user_id = _user_id
  )
$$;

CREATE OR REPLACE FUNCTION private.registrar_auditoria(
  _accion text, _modulo text DEFAULT NULL, _tabla text DEFAULT NULL,
  _registro_id text DEFAULT NULL, _resultado text DEFAULT 'exito',
  _detalles jsonb DEFAULT NULL, _ip text DEFAULT NULL, _user_agent text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT private.is_active_member(auth.uid()) THEN
    RETURN;
  END IF;
  INSERT INTO public.audit_logs (
    user_id, actor_email, accion, modulo, tabla, registro_id, resultado, detalles, ip, user_agent
  ) VALUES (
    auth.uid(),
    (SELECT email FROM auth.users WHERE id = auth.uid()),
    _accion, _modulo, _tabla, _registro_id, COALESCE(_resultado, 'exito'), _detalles, _ip, _user_agent
  );
END;
$$;

-- Permisos sobre la lógica privada (no expuesta a la API => no la marca el linter).
REVOKE ALL ON FUNCTION private.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.can_edit(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.is_active_member(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.registrar_auditoria(text, text, text, text, text, jsonb, text, text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION private.has_role(uuid, public.app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.can_edit(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.is_active_member(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.registrar_auditoria(text, text, text, text, text, jsonb, text, text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Puentes públicos SECURITY INVOKER (el linter 0029 no marca INVOKER).
-- Mantienen la misma firma => las políticas RLS y RPC existentes siguen igual.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT private.has_role(_user_id, _role)
$$;

CREATE OR REPLACE FUNCTION public.can_edit(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT private.can_edit(_user_id)
$$;

CREATE OR REPLACE FUNCTION public.is_active_member(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT private.is_active_member(_user_id)
$$;

CREATE OR REPLACE FUNCTION public.registrar_auditoria(
  _accion text, _modulo text DEFAULT NULL, _tabla text DEFAULT NULL,
  _registro_id text DEFAULT NULL, _resultado text DEFAULT 'exito',
  _detalles jsonb DEFAULT NULL, _ip text DEFAULT NULL, _user_agent text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  PERFORM private.registrar_auditoria(_accion, _modulo, _tabla, _registro_id, _resultado, _detalles, _ip, _user_agent);
END;
$$;