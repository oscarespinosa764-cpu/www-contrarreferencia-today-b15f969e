
-- =========================================================
-- PARTE A: Directorio canónico (403 fix)
-- =========================================================

-- Campos explícitos para cuentas de prueba / sistema (no destructivos).
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS es_cuenta_prueba boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS es_cuenta_sistema boolean NOT NULL DEFAULT false;

-- Wrapper público SECURITY DEFINER: exige usuario autenticado y miembro activo,
-- excluye al propio usuario, cuentas de prueba/sistema, y no expone datos sensibles.
CREATE OR REPLACE FUNCTION public.get_directorio_activos()
RETURNS TABLE(user_id uuid, nombre text, cargo text, sede text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.user_id, p.nombre, p.cargo, p.sede
  FROM public.profiles p
  JOIN public.user_roles r ON r.user_id = p.user_id
  WHERE p.activo = true
    AND COALESCE(p.es_cuenta_prueba, false) = false
    AND COALESCE(p.es_cuenta_sistema, false) = false
    AND p.user_id <> COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid)
    AND auth.uid() IS NOT NULL
    AND private.is_active_member(auth.uid())
  ORDER BY p.nombre;
$$;

REVOKE ALL ON FUNCTION public.get_directorio_activos() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_directorio_activos() TO authenticated;

-- =========================================================
-- PARTE B: Autorización por navegador (no por usuario)
-- =========================================================

-- Alcance informativo del dispositivo.
ALTER TABLE public.authorized_devices
  ADD COLUMN IF NOT EXISTS alcance text NOT NULL DEFAULT 'ORGANIZATION';

-- device_public_id debe ser globalmente único (credencial del navegador).
CREATE UNIQUE INDEX IF NOT EXISTS authorized_devices_device_public_id_key
  ON public.authorized_devices (device_public_id);

-- Verificación central: la sesión pertenece a auth.uid() y el dispositivo está
-- autorizado; NO se exige que el registrante original sea auth.uid().
CREATE OR REPLACE FUNCTION public.is_current_session_device_authorized()
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
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
     AND d.estado = 'AUTORIZADO'
     AND (d.expiracion_at IS NULL OR d.expiracion_at > now())
   LIMIT 1;

  RETURN COALESCE(v_ok, FALSE);
END;
$$;
