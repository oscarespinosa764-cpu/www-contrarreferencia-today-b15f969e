
-- =========================================================
-- 1. Configuración global segura (system_settings)
-- =========================================================
CREATE TABLE IF NOT EXISTS public.system_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID
);

GRANT SELECT ON public.system_settings TO authenticated;
GRANT ALL ON public.system_settings TO service_role;
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

-- Solo admins pueden leer configuración global desde el cliente
DROP POLICY IF EXISTS sys_settings_admin_read ON public.system_settings;
CREATE POLICY sys_settings_admin_read ON public.system_settings
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Escrituras solo por servidor (service_role bypass); denegar cliente
DROP POLICY IF EXISTS sys_settings_no_client_write ON public.system_settings;
CREATE POLICY sys_settings_no_client_write ON public.system_settings
  FOR ALL TO authenticated
  USING (false) WITH CHECK (false);

-- Semilla: modo BOOTSTRAP
INSERT INTO public.system_settings (key, value)
VALUES ('device_access_mode', to_jsonb('BOOTSTRAP'::text))
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.system_settings (key, value)
VALUES ('device_max_per_role', jsonb_build_object('admin', 3, 'operativa', 2, 'temporal', 1))
ON CONFLICT (key) DO NOTHING;

-- =========================================================
-- 2. authorized_devices
-- =========================================================
CREATE TABLE IF NOT EXISTS public.authorized_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_public_id UUID NOT NULL DEFAULT gen_random_uuid(),
  public_key JSONB NOT NULL,
  credential_version INTEGER NOT NULL DEFAULT 1,
  nombre_dispositivo TEXT,
  descripcion TEXT,
  navegador TEXT,
  sistema_operativo TEXT,
  tipo_dispositivo TEXT,
  user_agent_resumido TEXT,
  estado TEXT NOT NULL DEFAULT 'PENDIENTE'
    CHECK (estado IN ('PENDIENTE','AUTORIZADO','RECHAZADO','REVOCADO','BLOQUEADO','EXPIRADO')),
  solicitado_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  autorizado_at TIMESTAMPTZ,
  autorizado_por UUID,
  rechazado_at TIMESTAMPTZ,
  rechazado_por UUID,
  revocado_at TIMESTAMPTZ,
  revocado_por UUID,
  bloqueado_at TIMESTAMPTZ,
  bloqueado_por UUID,
  motivo TEXT,
  ultima_actividad_at TIMESTAMPTZ,
  expiracion_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, device_public_id)
);

CREATE INDEX IF NOT EXISTS idx_authdev_user_estado
  ON public.authorized_devices (user_id, estado);
CREATE INDEX IF NOT EXISTS idx_authdev_public_id
  ON public.authorized_devices (device_public_id);

GRANT SELECT, INSERT, UPDATE ON public.authorized_devices TO authenticated;
GRANT ALL ON public.authorized_devices TO service_role;
ALTER TABLE public.authorized_devices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS authdev_own_read ON public.authorized_devices;
CREATE POLICY authdev_own_read ON public.authorized_devices
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS authdev_own_rename ON public.authorized_devices;
CREATE POLICY authdev_own_rename ON public.authorized_devices
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- Escrituras críticas (insert de nuevos dispositivos y cambios de estado) van por server functions con service_role.
DROP POLICY IF EXISTS authdev_no_client_insert ON public.authorized_devices;
CREATE POLICY authdev_no_client_insert ON public.authorized_devices
  FOR INSERT TO authenticated
  WITH CHECK (false);

-- =========================================================
-- 3. device_access_requests
-- =========================================================
CREATE TABLE IF NOT EXISTS public.device_access_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_id UUID NOT NULL REFERENCES public.authorized_devices(id) ON DELETE CASCADE,
  session_id TEXT,
  estado TEXT NOT NULL DEFAULT 'PENDIENTE'
    CHECK (estado IN ('PENDIENTE','APROBADA','RECHAZADA','EXPIRADA','CANCELADA')),
  solicitado_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revisado_at TIMESTAMPTZ,
  revisado_por UUID,
  navegador TEXT,
  sistema_operativo TEXT,
  tipo_dispositivo TEXT,
  ip_enmascarada TEXT,
  motivo TEXT,
  observacion_admin TEXT,
  expiracion_solicitud TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Idempotencia: una sola solicitud pendiente por (usuario, dispositivo)
CREATE UNIQUE INDEX IF NOT EXISTS uq_devreq_pendiente
  ON public.device_access_requests (user_id, device_id)
  WHERE estado = 'PENDIENTE';
CREATE INDEX IF NOT EXISTS idx_devreq_user_estado
  ON public.device_access_requests (user_id, estado);

GRANT SELECT ON public.device_access_requests TO authenticated;
GRANT ALL ON public.device_access_requests TO service_role;
ALTER TABLE public.device_access_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS devreq_own_read ON public.device_access_requests;
CREATE POLICY devreq_own_read ON public.device_access_requests
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- =========================================================
-- 4. authorized_device_sessions
-- =========================================================
CREATE TABLE IF NOT EXISTS public.authorized_device_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_id UUID NOT NULL REFERENCES public.authorized_devices(id) ON DELETE CASCADE,
  auth_session_id TEXT NOT NULL,
  estado TEXT NOT NULL DEFAULT 'ACTIVA'
    CHECK (estado IN ('ACTIVA','REVOCADA','EXPIRADA','CERRADA')),
  creado_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ultima_validacion_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expira_at TIMESTAMPTZ,
  revocado_at TIMESTAMPTZ,
  motivo_revocacion TEXT,
  UNIQUE (auth_session_id)
);

CREATE INDEX IF NOT EXISTS idx_devsess_authsess_estado
  ON public.authorized_device_sessions (auth_session_id, estado);
CREATE INDEX IF NOT EXISTS idx_devsess_user_estado
  ON public.authorized_device_sessions (user_id, estado);

GRANT SELECT ON public.authorized_device_sessions TO authenticated;
GRANT ALL ON public.authorized_device_sessions TO service_role;
ALTER TABLE public.authorized_device_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS devsess_own_read ON public.authorized_device_sessions;
CREATE POLICY devsess_own_read ON public.authorized_device_sessions
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- =========================================================
-- 5. device_challenges (solo servidor)
-- =========================================================
CREATE TABLE IF NOT EXISTS public.device_challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_id UUID,
  challenge_hash TEXT NOT NULL,
  purpose TEXT NOT NULL
    CHECK (purpose IN ('REGISTER_DEVICE','VERIFY_DEVICE','LINK_SESSION','REVOKE_DEVICE','ADMIN_APPROVAL')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_devchal_expires
  ON public.device_challenges (expires_at, used_at);

GRANT ALL ON public.device_challenges TO service_role;
ALTER TABLE public.device_challenges ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS devchal_no_client ON public.device_challenges;
CREATE POLICY devchal_no_client ON public.device_challenges
  FOR ALL TO authenticated
  USING (false) WITH CHECK (false);

-- =========================================================
-- 6. device_recovery_codes (solo servidor)
-- =========================================================
CREATE TABLE IF NOT EXISTS public.device_recovery_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code_hash TEXT NOT NULL UNIQUE,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  used_by UUID,
  motivo TEXT
);

CREATE INDEX IF NOT EXISTS idx_devrec_expires
  ON public.device_recovery_codes (expires_at, used_at);

GRANT ALL ON public.device_recovery_codes TO service_role;
ALTER TABLE public.device_recovery_codes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS devrec_no_client ON public.device_recovery_codes;
CREATE POLICY devrec_no_client ON public.device_recovery_codes
  FOR ALL TO authenticated
  USING (false) WITH CHECK (false);

-- =========================================================
-- 7. Trigger updated_at
-- =========================================================
DROP TRIGGER IF EXISTS trg_authdev_updated ON public.authorized_devices;
CREATE TRIGGER trg_authdev_updated
  BEFORE UPDATE ON public.authorized_devices
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_devreq_updated ON public.device_access_requests;
CREATE TRIGGER trg_devreq_updated
  BEFORE UPDATE ON public.device_access_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================
-- 8. Función central de autorización
-- =========================================================
-- Devuelve TRUE en modos DISABLED/BOOTSTRAP/EMERGENCY_RECOVERY (no bloquea nada).
-- Solo en ENFORCED exige: sesión vinculada + dispositivo AUTORIZADO + no revocado/expirado.
CREATE OR REPLACE FUNCTION public.is_current_session_device_authorized()
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_mode TEXT;
  v_uid UUID := auth.uid();
  v_session TEXT;
  v_ok BOOLEAN;
BEGIN
  IF v_uid IS NULL THEN
    RETURN FALSE;
  END IF;

  SELECT value #>> '{}' INTO v_mode
    FROM public.system_settings
   WHERE key = 'device_access_mode';

  IF v_mode IS NULL OR v_mode IN ('DISABLED','BOOTSTRAP','EMERGENCY_RECOVERY') THEN
    RETURN TRUE;
  END IF;

  -- ENFORCED
  BEGIN
    v_session := auth.jwt() ->> 'session_id';
  EXCEPTION WHEN OTHERS THEN
    v_session := NULL;
  END;

  IF v_session IS NULL THEN
    RETURN FALSE;
  END IF;

  SELECT TRUE INTO v_ok
    FROM public.authorized_device_sessions s
    JOIN public.authorized_devices d ON d.id = s.device_id
   WHERE s.auth_session_id = v_session
     AND s.user_id = v_uid
     AND s.estado = 'ACTIVA'
     AND d.user_id = v_uid
     AND d.estado = 'AUTORIZADO'
     AND (d.expiracion_at IS NULL OR d.expiracion_at > now())
   LIMIT 1;

  RETURN COALESCE(v_ok, FALSE);
END;
$$;

REVOKE ALL ON FUNCTION public.is_current_session_device_authorized() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_current_session_device_authorized() TO authenticated, service_role;

-- Modo público (útil para el frontend admin)
CREATE OR REPLACE FUNCTION public.get_device_access_mode()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE((SELECT value #>> '{}' FROM public.system_settings WHERE key = 'device_access_mode'), 'BOOTSTRAP')
$$;

REVOKE ALL ON FUNCTION public.get_device_access_mode() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_device_access_mode() TO authenticated, service_role;
