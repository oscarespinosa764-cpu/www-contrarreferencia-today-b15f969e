-- 1) Tabla de auditoría
CREATE TABLE public.audit_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid,
  actor_email text,
  accion text NOT NULL,
  modulo text,
  tabla text,
  registro_id text,
  resultado text NOT NULL DEFAULT 'exito',
  detalles jsonb,
  ip text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Solo el administrador puede consultar la auditoría.
CREATE POLICY "Auditoria: solo admin consulta"
ON public.audit_logs FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Sin políticas de INSERT/UPDATE/DELETE para usuarios:
-- los registros se insertan vía función SECURITY DEFINER o service_role,
-- y nadie puede modificarlos ni eliminarlos (auditoría inmutable).

CREATE INDEX idx_audit_logs_created_at ON public.audit_logs (created_at DESC);
CREATE INDEX idx_audit_logs_user_id ON public.audit_logs (user_id);

-- 2) Función segura para registrar auditoría (ejecuta con privilegios del dueño)
CREATE OR REPLACE FUNCTION public.registrar_auditoria(
  _accion text,
  _modulo text DEFAULT NULL,
  _tabla text DEFAULT NULL,
  _registro_id text DEFAULT NULL,
  _resultado text DEFAULT 'exito',
  _detalles jsonb DEFAULT NULL,
  _ip text DEFAULT NULL,
  _user_agent text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Solo miembros activos pueden generar eventos de auditoría.
  IF NOT public.is_active_member(auth.uid()) THEN
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

GRANT EXECUTE ON FUNCTION public.registrar_auditoria(text, text, text, text, text, jsonb, text, text) TO authenticated;

-- 3) Tabla de consentimientos de tratamiento de datos
CREATE TABLE public.consentimientos (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  version text NOT NULL,
  aceptado boolean NOT NULL DEFAULT true,
  ip text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.consentimientos TO authenticated;
GRANT ALL ON public.consentimientos TO service_role;

ALTER TABLE public.consentimientos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Consentimientos: ver propio o admin ve todos"
ON public.consentimientos FOR SELECT TO authenticated
USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Consentimientos: registrar el propio"
ON public.consentimientos FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

-- 4) Corregir políticas de entregas_turno: aplicar solo a usuarios autenticados
ALTER POLICY "Entregas: admin elimina" ON public.entregas_turno TO authenticated;
ALTER POLICY "Entregas: editores crean" ON public.entregas_turno TO authenticated;
ALTER POLICY "Entregas: miembros activos ven" ON public.entregas_turno TO authenticated;
ALTER POLICY "Entregas: editores actualizan" ON public.entregas_turno TO authenticated;