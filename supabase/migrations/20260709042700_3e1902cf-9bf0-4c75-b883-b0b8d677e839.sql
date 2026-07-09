-- ─────────────────────────────────────────────────────────────────────────────
-- Fase 4 — HALLAZGOS 3 y 4: entrega_firmas legible/actualizable por cualquier
-- miembro activo. Se aplica mínimo privilegio (dueño o admin) + protección de
-- columnas + token_hash no legible + confirmación de no-DELETE (append-only).
-- Reversible: recrear políticas previas, DROP trigger/función, re-GRANT SELECT.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1) SELECT: solo dueño (usuario_genero) o administrador.
DROP POLICY IF EXISTS "Miembros activos ven sesiones de firma" ON public.entrega_firmas;
CREATE POLICY "Dueño o admin ven sesiones de firma"
  ON public.entrega_firmas FOR SELECT TO authenticated
  USING (usuario_genero = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- 2) UPDATE: solo dueño o administrador.
DROP POLICY IF EXISTS "Miembros activos actualizan sesiones de firma" ON public.entrega_firmas;
CREATE POLICY "Dueño o admin actualizan sesiones de firma"
  ON public.entrega_firmas FOR UPDATE TO authenticated
  USING (usuario_genero = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (usuario_genero = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- 3) INSERT: el creador debe ser el propio usuario activo.
DROP POLICY IF EXISTS "Miembros activos crean sesiones de firma" ON public.entrega_firmas;
CREATE POLICY "Miembro activo crea su sesión de firma"
  ON public.entrega_firmas FOR INSERT TO authenticated
  WITH CHECK (usuario_genero = auth.uid() AND public.is_active_member(auth.uid()));

-- 4) token_hash nunca legible desde el cliente: SELECT por columnas (sin token_hash).
REVOKE SELECT ON public.entrega_firmas FROM authenticated;
GRANT SELECT (
  id, caso_id, tipo_caso, seguimiento_id, estado, expira_at, usuario_genero,
  nombre_usuario, snapshot, firmante_nombre, firmante_cargo, firmante_empresa,
  firmante_documento, firmante_telefono, aceptacion, firma_data, firma_ip,
  firma_user_agent, firmado_at, codigo_verificacion, pdf_hash, created_at, updated_at
) ON public.entrega_firmas TO authenticated;

-- 5) Append-only: sin eliminación física desde la API (control intencional).
REVOKE DELETE ON public.entrega_firmas FROM anon, authenticated;

-- 6) Protección de columnas en UPDATE para no-admins (defensa en profundidad).
--    El proceso del servidor (service_role, sin auth.uid) firma y queda exento.
CREATE OR REPLACE FUNCTION public.guard_entrega_firmas_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  -- Operaciones server-side confiables (firma por QR vía service_role): exentas.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  -- Administrador/coordinador puede realizar acciones administrativas.
  IF public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;

  -- Operativo dueño: solo puede ANULAR su sesión; nada más.
  IF NEW.token_hash          IS DISTINCT FROM OLD.token_hash
     OR NEW.caso_id          IS DISTINCT FROM OLD.caso_id
     OR NEW.seguimiento_id   IS DISTINCT FROM OLD.seguimiento_id
     OR NEW.usuario_genero   IS DISTINCT FROM OLD.usuario_genero
     OR NEW.expira_at        IS DISTINCT FROM OLD.expira_at
     OR NEW.snapshot         IS DISTINCT FROM OLD.snapshot
     OR NEW.firma_data       IS DISTINCT FROM OLD.firma_data
     OR NEW.firmante_nombre  IS DISTINCT FROM OLD.firmante_nombre
     OR NEW.firmante_documento IS DISTINCT FROM OLD.firmante_documento
     OR NEW.firmante_telefono  IS DISTINCT FROM OLD.firmante_telefono
     OR NEW.firmado_at       IS DISTINCT FROM OLD.firmado_at
     OR NEW.codigo_verificacion IS DISTINCT FROM OLD.codigo_verificacion
     OR NEW.pdf_hash         IS DISTINCT FROM OLD.pdf_hash
  THEN
    RAISE EXCEPTION 'No puede modificar campos protegidos de la sesión de firma'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NEW.estado IS DISTINCT FROM OLD.estado AND NEW.estado <> 'ANULADA' THEN
    RAISE EXCEPTION 'Solo puede anular la sesión de firma'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.guard_entrega_firmas_update() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_guard_entrega_firmas_update ON public.entrega_firmas;
CREATE TRIGGER trg_guard_entrega_firmas_update
  BEFORE UPDATE ON public.entrega_firmas
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_entrega_firmas_update();