-- FASE 9 · BLOQUE C.1 — Identidad canónica de miembros del Cuadro de Turno
ALTER TABLE public.shift_schedule_members
  ADD COLUMN IF NOT EXISTS link_source text,
  ADD COLUMN IF NOT EXISTS linked_by uuid,
  ADD COLUMN IF NOT EXISTS linked_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'shift_schedule_members_link_source_chk'
       AND conrelid = 'public.shift_schedule_members'::regclass
  ) THEN
    ALTER TABLE public.shift_schedule_members
      ADD CONSTRAINT shift_schedule_members_link_source_chk
      CHECK (link_source IS NULL OR link_source IN
        ('MANUAL_ADMIN','CONFIRMED_NAME_SUGGESTION','IMPORT_TECHNICAL_ID'));
  END IF;
END $$;

-- Unicidad de vínculo dentro del mismo schedule (no bloquea meses distintos).
CREATE UNIQUE INDEX IF NOT EXISTS shift_schedule_members_schedule_user_uniq
  ON public.shift_schedule_members (schedule_id, user_id)
  WHERE user_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Vinculación (admin activo, transaccional, auditada)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.vincular_miembro_usuario(
  _actor uuid, _member_id uuid, _target_user_id uuid, _link_source text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $fn$
DECLARE
  m public.shift_schedule_members%ROWTYPE;
  v_sched uuid;
  v_activo boolean;
BEGIN
  IF _actor IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'NO_AUTENTICADO'); END IF;
  IF NOT private.is_active_member(_actor) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'INACTIVO'); END IF;
  IF NOT private.has_role(_actor, 'admin'::public.app_role) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'SIN_PERMISO'); END IF;
  IF _link_source IS NULL OR _link_source NOT IN ('MANUAL_ADMIN','CONFIRMED_NAME_SUGGESTION') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'LINK_SOURCE_NO_VALIDO'); END IF;

  SELECT * INTO m FROM public.shift_schedule_members WHERE id = _member_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'MIEMBRO_NO_ENCONTRADO'); END IF;

  SELECT id INTO v_sched FROM public.shift_schedules WHERE id = m.schedule_id;
  IF v_sched IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'SCHEDULE_NO_ENCONTRADO'); END IF;

  SELECT p.activo INTO v_activo FROM public.profiles p WHERE p.user_id = _target_user_id;
  IF v_activo IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'USUARIO_NO_ENCONTRADO'); END IF;
  IF NOT v_activo THEN RETURN jsonb_build_object('ok', false, 'error', 'USUARIO_INACTIVO'); END IF;

  IF EXISTS (
    SELECT 1 FROM public.shift_schedule_members x
     WHERE x.schedule_id = m.schedule_id AND x.user_id = _target_user_id AND x.id <> m.id
  ) THEN RETURN jsonb_build_object('ok', false, 'error', 'VINCULO_DUPLICADO'); END IF;

  UPDATE public.shift_schedule_members
     SET user_id = _target_user_id,
         link_source = _link_source,
         linked_by = _actor,
         linked_at = now(),
         updated_at = now()
   WHERE id = m.id
   RETURNING * INTO m;

  INSERT INTO public.audit_logs (user_id, accion, modulo, tabla, registro_id, resultado, detalles)
  VALUES (_actor, 'SHIFT_MEMBER_USER_LINKED', 'cuadro_turno', 'shift_schedule_members',
          m.id::text, 'exito',
          jsonb_build_object('member_id', m.id, 'schedule_id', m.schedule_id,
                             'user_id', _target_user_id, 'link_source', _link_source));

  RETURN jsonb_build_object('ok', true, 'member_id', m.id, 'schedule_id', m.schedule_id,
                            'user_id', m.user_id, 'link_source', m.link_source,
                            'linked_at', m.linked_at);
END;
$fn$;

CREATE OR REPLACE FUNCTION private.desvincular_miembro_usuario(_actor uuid, _member_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $fn$
DECLARE
  m public.shift_schedule_members%ROWTYPE;
  v_prev uuid;
BEGIN
  IF _actor IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'NO_AUTENTICADO'); END IF;
  IF NOT private.is_active_member(_actor) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'INACTIVO'); END IF;
  IF NOT private.has_role(_actor, 'admin'::public.app_role) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'SIN_PERMISO'); END IF;

  SELECT * INTO m FROM public.shift_schedule_members WHERE id = _member_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'MIEMBRO_NO_ENCONTRADO'); END IF;
  v_prev := m.user_id;
  IF v_prev IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'SIN_VINCULO'); END IF;

  UPDATE public.shift_schedule_members
     SET user_id = NULL, link_source = NULL, linked_by = NULL, linked_at = NULL,
         updated_at = now()
   WHERE id = m.id RETURNING * INTO m;

  INSERT INTO public.audit_logs (user_id, accion, modulo, tabla, registro_id, resultado, detalles)
  VALUES (_actor, 'SHIFT_MEMBER_USER_UNLINKED', 'cuadro_turno', 'shift_schedule_members',
          m.id::text, 'exito',
          jsonb_build_object('member_id', m.id, 'schedule_id', m.schedule_id, 'user_id', v_prev));

  RETURN jsonb_build_object('ok', true, 'member_id', m.id, 'schedule_id', m.schedule_id);
END;
$fn$;

-- Puntos de entrada expuestos SOLO a service_role (Server Function media el acceso).
CREATE OR REPLACE FUNCTION public.vincular_miembro_usuario(
  _actor uuid, _member_id uuid, _target_user_id uuid, _link_source text
) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = ''
AS $fn$ SELECT private.vincular_miembro_usuario(_actor, _member_id, _target_user_id, _link_source); $fn$;

CREATE OR REPLACE FUNCTION public.desvincular_miembro_usuario(_actor uuid, _member_id uuid)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = ''
AS $fn$ SELECT private.desvincular_miembro_usuario(_actor, _member_id); $fn$;

REVOKE ALL ON FUNCTION private.vincular_miembro_usuario(uuid, uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.desvincular_miembro_usuario(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.vincular_miembro_usuario(uuid, uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.desvincular_miembro_usuario(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.vincular_miembro_usuario(uuid, uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.desvincular_miembro_usuario(uuid, uuid) TO service_role;