-- ============================================================================
-- FASE 9 · BLOQUE C.2 — Creación y decisión server-authoritative de solicitudes
-- ============================================================================

-- 1. MIGRACIÓN MÍNIMA -------------------------------------------------------
ALTER TABLE public.shift_requests
  ADD COLUMN IF NOT EXISTS schedule_snapshot jsonb NULL;

ALTER TABLE public.shift_schedule_days
  ADD COLUMN IF NOT EXISTS absence_request_id uuid NULL,
  ADD COLUMN IF NOT EXISTS coverage_request_id uuid NULL,
  ADD COLUMN IF NOT EXISTS shift_change_request_id uuid NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ssd_absence_request_fkey') THEN
    ALTER TABLE public.shift_schedule_days
      ADD CONSTRAINT ssd_absence_request_fkey FOREIGN KEY (absence_request_id)
      REFERENCES public.shift_requests(id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ssd_coverage_request_fkey') THEN
    ALTER TABLE public.shift_schedule_days
      ADD CONSTRAINT ssd_coverage_request_fkey FOREIGN KEY (coverage_request_id)
      REFERENCES public.shift_requests(id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ssd_shift_change_request_fkey') THEN
    ALTER TABLE public.shift_schedule_days
      ADD CONSTRAINT ssd_shift_change_request_fkey FOREIGN KEY (shift_change_request_id)
      REFERENCES public.shift_requests(id) ON DELETE RESTRICT;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_ssd_absence_request ON public.shift_schedule_days(absence_request_id);
CREATE INDEX IF NOT EXISTS idx_ssd_coverage_request ON public.shift_schedule_days(coverage_request_id);
CREATE INDEX IF NOT EXISTS idx_ssd_change_request ON public.shift_schedule_days(shift_change_request_id);

-- 2. HELPERS ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.norm_nombre(_v text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT upper(btrim(regexp_replace(coalesce(normalize(_v, NFKC), ''), '\s+', ' ', 'g')))
$$;

-- Resolver canónico SQL (espejo del resolver TS): identidad estable, sin limit(1).
CREATE OR REPLACE FUNCTION private.resolver_dia(_user_id uuid, _fallback_name text, _fecha date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_sched uuid; v_n int; v_member uuid; v_method text; v_nombre text;
  v_day record; v_type record; v_cross boolean;
BEGIN
  IF _fecha IS NULL THEN RETURN jsonb_build_object('estado','SIN_TURNO'); END IF;

  SELECT count(*), min(id) INTO v_n, v_sched FROM public.shift_schedules s
   WHERE s.year = extract(year from _fecha)::int AND s.month = extract(month from _fecha)::int;
  IF v_n = 0 THEN RETURN jsonb_build_object('estado','SCHEDULE_NO_ENCONTRADO'); END IF;
  IF v_n > 1 THEN RETURN jsonb_build_object('estado','SCHEDULE_AMBIGUO'); END IF;

  IF _user_id IS NOT NULL THEN
    SELECT count(*), min(id) INTO v_n, v_member FROM public.shift_schedule_members m
     WHERE m.schedule_id = v_sched AND m.user_id = _user_id;
    IF v_n > 1 THEN RETURN jsonb_build_object('estado','IDENTIDAD_AMBIGUA','scheduleId',v_sched); END IF;
    IF v_n = 1 THEN v_method := 'USER_ID'; END IF;
  END IF;

  IF v_member IS NULL THEN
    v_nombre := private.norm_nombre(coalesce(
      (SELECT p.nombre FROM public.profiles p WHERE p.user_id = _user_id), _fallback_name));
    IF v_nombre = '' OR v_nombre IS NULL THEN
      RETURN jsonb_build_object('estado','MIEMBRO_NO_VINCULADO','scheduleId',v_sched);
    END IF;
    SELECT count(*), min(id) INTO v_n, v_member FROM public.shift_schedule_members m
     WHERE m.schedule_id = v_sched AND private.norm_nombre(m.full_name) = v_nombre;
    IF v_n = 0 THEN RETURN jsonb_build_object('estado','MIEMBRO_NO_VINCULADO','scheduleId',v_sched); END IF;
    IF v_n > 1 THEN RETURN jsonb_build_object('estado','IDENTIDAD_AMBIGUA','scheduleId',v_sched); END IF;
    v_method := 'UNIQUE_NORMALIZED_NAME';
  END IF;

  SELECT count(*) INTO v_n FROM public.shift_schedule_days d
   WHERE d.schedule_id = v_sched AND d.member_id = v_member
     AND d.day_number = extract(day from _fecha)::int;
  IF v_n > 1 THEN
    RETURN jsonb_build_object('estado','PROGRAMACION_INCONSISTENTE','scheduleId',v_sched,'memberId',v_member);
  END IF;

  SELECT * INTO v_day FROM public.shift_schedule_days d
   WHERE d.schedule_id = v_sched AND d.member_id = v_member
     AND d.day_number = extract(day from _fecha)::int;

  IF v_day.id IS NULL OR v_day.shift_code IS NULL THEN
    RETURN jsonb_build_object(
      'estado','SIN_TURNO','scheduleId',v_sched,'memberId',v_member,'userId',_user_id,
      'dayId',v_day.id,'dayNumber',extract(day from _fecha)::int,'fecha',_fecha,
      'resolutionMethod',v_method);
  END IF;

  SELECT * INTO v_type FROM public.shift_types t WHERE t.code = v_day.shift_code;
  v_cross := v_type.start_time IS NOT NULL AND v_type.end_time IS NOT NULL
             AND v_type.end_time <= v_type.start_time;

  RETURN jsonb_build_object(
    'estado', CASE WHEN v_type.code IS NULL THEN 'CODIGO_DESCONOCIDO' ELSE 'TURNO_ENCONTRADO' END,
    'scheduleId', v_sched, 'memberId', v_member, 'userId', _user_id,
    'dayId', v_day.id, 'dayNumber', v_day.day_number, 'fecha', _fecha,
    'shiftCode', v_day.shift_code, 'shiftName', v_type.name,
    'startTime', v_type.start_time, 'endTime', v_type.end_time,
    'hours', v_day.hours, 'origin', v_day.origin, 'notes', v_day.notes,
    'changedAt', v_day.changed_at, 'unidadFuncional', v_day.unidad_funcional,
    'absenceRequestId', v_day.absence_request_id,
    'coverageRequestId', v_day.coverage_request_id,
    'shiftChangeRequestId', v_day.shift_change_request_id,
    'crossesMidnight', coalesce(v_cross,false), 'resolutionMethod', v_method);
END $$;

REVOKE ALL ON FUNCTION private.norm_nombre(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.resolver_dia(uuid, text, date) FROM PUBLIC;

-- 3. TRIGGERS FAIL-CLOSED ---------------------------------------------------
CREATE OR REPLACE FUNCTION private.shift_days_traza_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF coalesce(current_setting('app.shift_request_decision_ctx', true), '') <> '' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.absence_request_id IS NOT NULL OR NEW.coverage_request_id IS NOT NULL
       OR NEW.shift_change_request_id IS NOT NULL THEN
      RAISE EXCEPTION 'Trazabilidad de solicitudes reservada al flujo autorizado'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.absence_request_id IS DISTINCT FROM OLD.absence_request_id
     OR NEW.coverage_request_id IS DISTINCT FROM OLD.coverage_request_id
     OR NEW.shift_change_request_id IS DISTINCT FROM OLD.shift_change_request_id THEN
    RAISE EXCEPTION 'Trazabilidad de solicitudes reservada al flujo autorizado'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS a_shift_days_traza_guard ON public.shift_schedule_days;
CREATE TRIGGER a_shift_days_traza_guard
  BEFORE INSERT OR UPDATE ON public.shift_schedule_days
  FOR EACH ROW EXECUTE FUNCTION private.shift_days_traza_guard();

CREATE OR REPLACE FUNCTION private.shift_request_decision_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF coalesce(current_setting('app.shift_request_decision_ctx', true), '') <> '' THEN
    RETURN NEW;
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status
     AND NEW.status IN ('APROBADA','NEGADA','RECHAZADA','DEVUELTA PARA AJUSTE','EJECUTADA') THEN
    RAISE EXCEPTION 'La decisión de solicitudes solo se procesa por el flujo autorizado'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NEW.approved_by IS DISTINCT FROM OLD.approved_by
     OR NEW.approved_at IS DISTINCT FROM OLD.approved_at
     OR NEW.rejected_by IS DISTINCT FROM OLD.rejected_by
     OR NEW.rejected_at IS DISTINCT FROM OLD.rejected_at
     OR NEW.cuadro_applied IS DISTINCT FROM OLD.cuadro_applied
     OR NEW.schedule_snapshot IS DISTINCT FROM OLD.schedule_snapshot THEN
    RAISE EXCEPTION 'Campos de decisión reservados al flujo autorizado'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS a_shift_request_decision_guard ON public.shift_requests;
CREATE TRIGGER a_shift_request_decision_guard
  BEFORE UPDATE ON public.shift_requests
  FOR EACH ROW EXECUTE FUNCTION private.shift_request_decision_guard();

-- 4. CREACIÓN TRANSACCIONAL -------------------------------------------------
CREATE OR REPLACE FUNCTION private.crear_solicitud_turno(_actor uuid, _payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_perfil record; v_tipo text; v_cambio boolean; v_ini date; v_fin date; v_d date;
  v_snap jsonb := '{}'::jsonb; v_sol jsonb := '{}'::jsonb; v_rep jsonb := '{}'::jsonb;
  v_r jsonb; v_req_id uuid; v_exc uuid; v_exento boolean; v_uso record;
  v_frag jsonb; v_i int := 0; v_min int; v_replacement uuid; v_swap uuid;
BEGIN
  IF _actor IS NULL OR NOT public.is_active_member(_actor) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'SIN_PERMISO');
  END IF;
  SELECT * INTO v_perfil FROM public.profiles p WHERE p.user_id = _actor;
  IF v_perfil.user_id IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'SIN_PERMISO'); END IF;

  v_tipo := coalesce(_payload->>'request_type', 'permiso');
  IF v_tipo NOT IN ('permiso','cambio_turno') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'ERROR_GENERAL');
  END IF;
  v_cambio := v_tipo = 'cambio_turno';
  v_replacement := nullif(_payload->>'replacement_user_id','')::uuid;
  v_swap := nullif(_payload->>'swap_user_id','')::uuid;

  IF v_cambio THEN
    v_ini := nullif(_payload->>'original_shift_date','')::date;
    v_fin := v_ini;
  ELSE
    v_ini := nullif(_payload->>'start_date','')::date;
    v_fin := coalesce(nullif(_payload->>'end_date','')::date, v_ini);
  END IF;
  IF v_ini IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'ERROR_GENERAL'); END IF;
  IF v_fin < v_ini THEN RETURN jsonb_build_object('ok', false, 'error', 'ERROR_GENERAL'); END IF;
  IF v_fin - v_ini > 62 THEN RETURN jsonb_build_object('ok', false, 'error', 'ERROR_GENERAL'); END IF;

  -- Snapshot server-side (evidencia). Nunca proviene del cliente.
  v_d := v_ini;
  WHILE v_d <= v_fin LOOP
    v_sol := v_sol || jsonb_build_object(v_d::text, private.resolver_dia(_actor, v_perfil.nombre, v_d));
    IF v_replacement IS NOT NULL THEN
      v_rep := v_rep || jsonb_build_object(v_d::text, private.resolver_dia(v_replacement, null, v_d));
    END IF;
    v_d := v_d + 1;
  END LOOP;
  IF v_cambio AND v_swap IS NOT NULL THEN
    v_rep := v_rep || jsonb_build_object(
      coalesce(nullif(_payload->>'requested_shift_date',''), v_ini::text),
      private.resolver_dia(v_swap, null,
        coalesce(nullif(_payload->>'requested_shift_date','')::date, v_ini)));
  END IF;
  v_snap := jsonb_build_object('version', 1, 'created_at', now(),
    'solicitante', v_sol, 'reemplazo', v_rep,
    'solicitud', jsonb_build_object(
      'request_type', v_tipo, 'start_date', v_ini, 'end_date', v_fin,
      'start_time', _payload->>'start_time', 'end_time', _payload->>'end_time',
      'requires_replacement', coalesce((_payload->>'requires_replacement')::boolean,false),
      'replacement_user_id', v_replacement, 'swap_user_id', v_swap,
      'original_shift_date', _payload->>'original_shift_date',
      'requested_shift_date', _payload->>'requested_shift_date',
      'will_recover_time', coalesce((_payload->>'will_recover_time')::boolean,false),
      'return_fractioned', coalesce((_payload->>'return_fractioned')::boolean,false)));

  -- Límite mensual revalidado desde BD.
  v_exento := coalesce(_payload->>'reason_type','') IN ('Cita médica','Calamidad');
  IF NOT v_exento THEN
    SELECT * INTO v_uso FROM public.shift_monthly_usage(
      _actor, extract(year from v_ini)::int, extract(month from v_ini)::int);
    IF coalesce(v_uso.solicitudes,0) + coalesce(v_uso.coberturas,0) >= 3 THEN
      SELECT id INTO v_exc FROM public.shift_monthly_exceptions e
       WHERE e.user_id = _actor AND e.year = extract(year from v_ini)::int
         AND e.month = extract(month from v_ini)::int
         AND e.status = 'APROBADA' AND e.usage_status = 'DISPONIBLE'
       ORDER BY e.created_at LIMIT 1 FOR UPDATE;
      IF v_exc IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'error', 'LIMITE_MENSUAL');
      END IF;
    END IF;
  END IF;

  INSERT INTO public.shift_requests (
    request_type, requester_id, requester_name, requester_identification,
    requester_role, requester_sede, status, reason_type, other_reason,
    reason_recoverable, start_date, end_date, start_time, end_time,
    will_recover_time, requires_replacement, replacement_name, replacement_role,
    replacement_user_id, paid, original_shift_code, original_shift_name,
    original_start_time, original_end_time, original_shift_date,
    requested_shift_date, requested_shift_code, swap_user_id, swap_partner_name,
    return_fractioned, return_receiver_id, return_person_id, return_person_name,
    return_person_role, return_date, return_shift_code, requested_minutes,
    returned_minutes, pending_minutes, recovery_status, is_limit_exempt,
    monthly_exception_id, support_path, support_metadata,
    out_of_rule_justification, reason_detail, observations,
    requester_signature_id, requester_signature_hash, schedule_snapshot
  ) VALUES (
    v_tipo, _actor, v_perfil.nombre, v_perfil.documento,
    v_perfil.cargo, coalesce(v_perfil.sede,'SEDE PRINCIPAL'), 'PENDIENTE',
    _payload->>'reason_type', nullif(_payload->>'other_reason',''),
    coalesce((_payload->>'reason_recoverable')::boolean, false),
    CASE WHEN v_cambio THEN NULL ELSE v_ini END,
    CASE WHEN v_cambio THEN NULL ELSE v_fin END,
    nullif(_payload->>'start_time','')::time, nullif(_payload->>'end_time','')::time,
    coalesce((_payload->>'will_recover_time')::boolean,false),
    coalesce((_payload->>'requires_replacement')::boolean,false),
    (SELECT p.nombre FROM public.profiles p WHERE p.user_id = v_replacement),
    (SELECT p.cargo FROM public.profiles p WHERE p.user_id = v_replacement),
    v_replacement, coalesce((_payload->>'paid')::boolean, true),
    coalesce(v_sol->v_ini::text->>'shiftCode', nullif(_payload->>'original_shift_code','')),
    v_sol->v_ini::text->>'shiftName',
    (v_sol->v_ini::text->>'startTime')::time, (v_sol->v_ini::text->>'endTime')::time,
    v_ini,
    nullif(_payload->>'requested_shift_date','')::date,
    CASE WHEN v_cambio AND v_swap IS NOT NULL
      THEN (v_rep->coalesce(nullif(_payload->>'requested_shift_date',''), v_ini::text)->>'shiftCode')
      ELSE NULL END,
    v_swap, (SELECT p.nombre FROM public.profiles p WHERE p.user_id = v_swap),
    coalesce((_payload->>'return_fractioned')::boolean,false),
    nullif(_payload->'fracciones'->0->>'receiver_id','')::uuid,
    nullif(_payload->'fracciones'->0->>'receiver_id','')::uuid,
    _payload->'fracciones'->0->>'receiver_name',
    _payload->'fracciones'->0->>'receiver_role',
    nullif(_payload->'fracciones'->0->>'return_date','')::date,
    _payload->'fracciones'->0->>'shift_code',
    nullif(_payload->>'requested_minutes','')::int, 0,
    CASE WHEN coalesce((_payload->>'will_recover_time')::boolean,false)
      THEN nullif(_payload->>'requested_minutes','')::int ELSE NULL END,
    CASE WHEN coalesce((_payload->>'will_recover_time')::boolean,false)
      THEN 'PENDIENTE_VERIFICACION' ELSE 'N_A' END,
    v_exento, v_exc, nullif(_payload->>'support_path',''),
    _payload->'support_metadata',
    nullif(_payload->>'out_of_rule_justification',''),
    nullif(_payload->>'reason_detail',''), nullif(_payload->>'observations',''),
    nullif(_payload->>'requester_signature_id','')::uuid,
    nullif(_payload->>'requester_signature_hash',''),
    v_snap
  ) RETURNING id INTO v_req_id;

  IF coalesce((_payload->>'will_recover_time')::boolean,false)
     AND jsonb_typeof(_payload->'fracciones') = 'array' THEN
    FOR v_frag IN SELECT * FROM jsonb_array_elements(_payload->'fracciones') LOOP
      v_i := v_i + 1;
      v_min := coalesce(nullif(v_frag->>'minutes','')::int, 0);
      INSERT INTO public.shift_return_fragments (
        request_id, fragment_no, return_date, receiver_id, receiver_name,
        receiver_role, shift_code, start_time, end_time, minutes, notes
      ) VALUES (
        v_req_id, v_i, nullif(v_frag->>'return_date','')::date,
        nullif(v_frag->>'receiver_id','')::uuid, v_frag->>'receiver_name',
        v_frag->>'receiver_role', v_frag->>'shift_code',
        nullif(v_frag->>'start_time','')::time, nullif(v_frag->>'end_time','')::time,
        v_min, nullif(v_frag->>'notes',''));
    END LOOP;
  END IF;

  IF v_exc IS NOT NULL THEN
    UPDATE public.shift_monthly_exceptions
       SET usage_status = 'UTILIZADA', used_request_id = v_req_id, used_at = now()
     WHERE id = v_exc AND status = 'APROBADA' AND usage_status = 'DISPONIBLE';
    IF NOT FOUND THEN RAISE EXCEPTION 'LIMITE_MENSUAL'; END IF;
  END IF;

  INSERT INTO public.shift_request_audit (request_id, action, new_status, user_id, detail)
  VALUES (v_req_id, 'CREADA', 'PENDIENTE', _actor,
          'Solicitud ' || v_tipo || ' · ' || coalesce(_payload->>'reason_type','—'));

  PERFORM public.registrar_auditoria_srv(_actor, 'SHIFT_REQUEST_CREATED', 'cuadro_turno',
    'shift_requests', v_req_id::text, 'exito',
    jsonb_build_object('request_type', v_tipo, 'start_date', v_ini, 'end_date', v_fin));

  RETURN jsonb_build_object('ok', true, 'id', v_req_id);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'error',
    CASE WHEN SQLERRM = 'LIMITE_MENSUAL' THEN 'LIMITE_MENSUAL' ELSE 'ERROR_GENERAL' END);
END $$;

REVOKE ALL ON FUNCTION private.crear_solicitud_turno(uuid, jsonb) FROM PUBLIC;

-- 5. DECISIÓN TRANSACCIONAL -------------------------------------------------
CREATE OR REPLACE FUNCTION private.decidir_solicitud_turno(
  _actor uuid, _request_id uuid, _decision text,
  _observacion text DEFAULT NULL, _registrar_ausentismo boolean DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  r record; v_snap jsonb; v_legacy boolean; v_d date; v_fin date;
  v_cur jsonb; v_prev jsonb; v_dias jsonb := '[]'::jsonb;
  v_rep jsonb; v_rep_day record; v_new_id uuid; v_parcial boolean;
  v_aplico boolean := false; v_a jsonb; v_b jsonb; v_ta text; v_ha numeric;
  v_nota text; v_min int; v_frag record; v_evt text;
BEGIN
  IF _actor IS NULL OR NOT public.is_active_member(_actor)
     OR NOT public.has_role(_actor, 'admin') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'SIN_PERMISO');
  END IF;
  IF _decision NOT IN ('APROBAR','NEGAR','DEVOLVER_PARA_AJUSTE') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'ERROR_GENERAL');
  END IF;

  PERFORM set_config('app.shift_request_decision_ctx', _request_id::text, true);

  SELECT * INTO r FROM public.shift_requests WHERE id = _request_id FOR UPDATE;
  IF r.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'ERROR_GENERAL'); END IF;
  IF r.status NOT IN ('PENDIENTE','DEVUELTA PARA AJUSTE') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'DOBLE_DECISION');
  END IF;

  -- ---- NEGAR / DEVOLVER: sin efectos sobre el Cuadro ----------------------
  IF _decision IN ('NEGAR','DEVOLVER_PARA_AJUSTE') THEN
    UPDATE public.shift_requests
       SET status = CASE WHEN _decision = 'NEGAR' THEN 'NEGADA' ELSE 'DEVUELTA PARA AJUSTE' END,
           rejected_by = _actor, rejected_at = now(),
           rejection_reason = left(coalesce(_observacion,''), 1000),
           response_observation = nullif(_observacion,'')
     WHERE id = _request_id;
    INSERT INTO public.shift_request_audit (request_id, action, previous_status, new_status, user_id, detail)
    VALUES (_request_id, CASE WHEN _decision = 'NEGAR' THEN 'NEGADA' ELSE 'DEVUELTA' END,
            r.status, CASE WHEN _decision = 'NEGAR' THEN 'NEGADA' ELSE 'DEVUELTA PARA AJUSTE' END,
            _actor, _observacion);
    PERFORM public.registrar_auditoria_srv(_actor,
      CASE WHEN _decision = 'NEGAR' THEN 'SHIFT_REQUEST_DENIED' ELSE 'SHIFT_REQUEST_RETURNED' END,
      'cuadro_turno', 'shift_requests', _request_id::text, 'exito',
      jsonb_build_object('previous_status', r.status));
    RETURN jsonb_build_object('ok', true, 'decision', _decision);
  END IF;

  -- ---- APROBAR ------------------------------------------------------------
  v_snap := r.schedule_snapshot;
  v_legacy := v_snap IS NULL;

  IF r.request_type = 'cambio_turno' THEN
    -- Cambio de turno: A (solicitante/fecha original) y B (compañero/fecha solicitada)
    v_a := private.resolver_dia(r.requester_id, r.requester_name, r.original_shift_date);
    IF r.swap_user_id IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'error', 'MIEMBRO_NO_VINCULADO');
    END IF;
    v_b := private.resolver_dia(r.swap_user_id, r.swap_partner_name,
             coalesce(r.requested_shift_date, r.original_shift_date));
    IF v_a->>'estado' <> 'TURNO_ENCONTRADO' OR v_b->>'estado' <> 'TURNO_ENCONTRADO' THEN
      RETURN jsonb_build_object('ok', false, 'error',
        CASE WHEN v_a->>'estado' IN ('MIEMBRO_NO_VINCULADO','IDENTIDAD_AMBIGUA')
               OR v_b->>'estado' IN ('MIEMBRO_NO_VINCULADO','IDENTIDAD_AMBIGUA')
             THEN coalesce(v_b->>'estado', v_a->>'estado') ELSE 'SIN_TURNO' END);
    END IF;
    IF NOT v_legacy THEN
      v_prev := v_snap->'solicitante'->r.original_shift_date::text;
      IF v_prev IS NOT NULL AND (
           v_prev->>'dayId' IS DISTINCT FROM v_a->>'dayId'
        OR v_prev->>'shiftCode' IS DISTINCT FROM v_a->>'shiftCode'
        OR v_prev->>'memberId' IS DISTINCT FROM v_a->>'memberId') THEN
        RETURN jsonb_build_object('ok', false, 'error', 'PROGRAMACION_CAMBIADA');
      END IF;
    END IF;

    PERFORM id FROM public.shift_schedule_days
      WHERE id IN ((v_a->>'dayId')::uuid, (v_b->>'dayId')::uuid) ORDER BY id FOR UPDATE;

    IF coalesce(r.requested_shift_date, r.original_shift_date) = r.original_shift_date THEN
      -- Misma fecha: intercambio de código y horas.
      v_ta := v_a->>'shiftCode'; v_ha := (v_a->>'hours')::numeric;
      UPDATE public.shift_schedule_days SET shift_code = v_b->>'shiftCode',
             hours = (v_b->>'hours')::numeric, shift_change_request_id = _request_id,
             origin = 'cambio_turno_solicitud', changed_by = _actor, changed_at = now(),
             notes = left(coalesce(notes || ' · ', '') || 'CAMBIO ' || left(_request_id::text,8), 400)
       WHERE id = (v_a->>'dayId')::uuid;
      UPDATE public.shift_schedule_days SET shift_code = v_ta, hours = v_ha,
             shift_change_request_id = _request_id, origin = 'cambio_turno_solicitud',
             changed_by = _actor, changed_at = now(),
             notes = left(coalesce(notes || ' · ', '') || 'CAMBIO ' || left(_request_id::text,8), 400)
       WHERE id = (v_b->>'dayId')::uuid;
    ELSE
      -- Fechas diferentes: intercambio de titular (member_id) conservando el turno.
      IF EXISTS (SELECT 1 FROM public.shift_schedule_days d
                  WHERE d.member_id = (v_b->>'memberId')::uuid
                    AND d.schedule_id = (v_a->>'scheduleId')::uuid
                    AND d.day_number = (v_a->>'dayNumber')::int)
         OR EXISTS (SELECT 1 FROM public.shift_schedule_days d
                  WHERE d.member_id = (v_a->>'memberId')::uuid
                    AND d.schedule_id = (v_b->>'scheduleId')::uuid
                    AND d.day_number = (v_b->>'dayNumber')::int) THEN
        RETURN jsonb_build_object('ok', false, 'error', 'REEMPLAZO_OCUPADO');
      END IF;
      IF (SELECT s1.dependency FROM public.shift_schedules s1 WHERE s1.id = (v_a->>'scheduleId')::uuid)
         IS DISTINCT FROM
         (SELECT s2.dependency FROM public.shift_schedules s2 WHERE s2.id = (v_b->>'scheduleId')::uuid) THEN
        RETURN jsonb_build_object('ok', false, 'error', 'ERROR_GENERAL');
      END IF;
      UPDATE public.shift_schedule_days
         SET member_id = (v_b->>'memberId')::uuid, shift_change_request_id = _request_id,
             origin = 'cambio_turno_solicitud', changed_by = _actor, changed_at = now()
       WHERE id = (v_a->>'dayId')::uuid;
      UPDATE public.shift_schedule_days
         SET member_id = (v_a->>'memberId')::uuid, shift_change_request_id = _request_id,
             origin = 'cambio_turno_solicitud', changed_by = _actor, changed_at = now()
       WHERE id = (v_b->>'dayId')::uuid;
    END IF;
    v_aplico := true;
    v_dias := v_dias || jsonb_build_array(jsonb_build_object('before', v_a, 'after', v_b));
    PERFORM public.registrar_auditoria_srv(_actor, 'SHIFT_SWAP_APPLIED', 'cuadro_turno',
      'shift_schedule_days', _request_id::text, 'exito',
      jsonb_build_object('a', v_a, 'b', v_b));

  ELSE
    -- ---- PERMISO ----------------------------------------------------------
    v_parcial := r.start_time IS NOT NULL AND r.end_time IS NOT NULL;
    v_d := coalesce(r.start_date, r.original_shift_date);
    v_fin := coalesce(r.end_date, v_d);
    IF v_d IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'SIN_TURNO'); END IF;

    WHILE v_d <= v_fin LOOP
      v_cur := private.resolver_dia(r.requester_id, r.requester_name, v_d);

      IF v_cur->>'estado' IN ('IDENTIDAD_AMBIGUA','MIEMBRO_NO_VINCULADO',
                              'SCHEDULE_AMBIGUO','PROGRAMACION_INCONSISTENTE') THEN
        RETURN jsonb_build_object('ok', false, 'error', v_cur->>'estado');
      END IF;

      IF NOT v_legacy THEN
        v_prev := v_snap->'solicitante'->v_d::text;
        IF v_prev IS NOT NULL AND (
             v_prev->>'dayId' IS DISTINCT FROM v_cur->>'dayId'
          OR v_prev->>'shiftCode' IS DISTINCT FROM v_cur->>'shiftCode'
          OR v_prev->>'memberId' IS DISTINCT FROM v_cur->>'memberId'
          OR v_prev->>'scheduleId' IS DISTINCT FROM v_cur->>'scheduleId'
          OR coalesce(v_prev->>'hours','0') IS DISTINCT FROM coalesce(v_cur->>'hours','0')
          OR v_prev->>'absenceRequestId' IS DISTINCT FROM v_cur->>'absenceRequestId'
          OR v_prev->>'coverageRequestId' IS DISTINCT FROM v_cur->>'coverageRequestId'
          OR v_prev->>'shiftChangeRequestId' IS DISTINCT FROM v_cur->>'shiftChangeRequestId'
          OR v_prev->>'changedAt' IS DISTINCT FROM v_cur->>'changedAt') THEN
          RETURN jsonb_build_object('ok', false, 'error', 'PROGRAMACION_CAMBIADA', 'fecha', v_d);
        END IF;
      END IF;

      IF v_cur->>'estado' <> 'TURNO_ENCONTRADO' THEN
        v_dias := v_dias || jsonb_build_array(
          jsonb_build_object('fecha', v_d, 'resultado', 'SIN_PROGRAMACION'));
      ELSIF v_parcial THEN
        -- Permiso/cobertura parcial: no se modifica el Cuadro de Turno.
        v_dias := v_dias || jsonb_build_array(
          jsonb_build_object('fecha', v_d, 'resultado', 'PARCIAL_SIN_CAMBIO_CUADRO'));
      ELSE
        PERFORM id FROM public.shift_schedule_days WHERE id = (v_cur->>'dayId')::uuid FOR UPDATE;
        v_nota := 'PERMISO ' || left(_request_id::text, 8);
        UPDATE public.shift_schedule_days
           SET absence_request_id = _request_id, origin = 'permiso_aprobado',
               changed_by = _actor, changed_at = now(),
               notes = CASE WHEN coalesce(notes,'') LIKE '%' || v_nota || '%' THEN notes
                            ELSE left(coalesce(notes || ' · ', '') || v_nota, 400) END
         WHERE id = (v_cur->>'dayId')::uuid;
        v_aplico := true;

        -- Cobertura de día completo con reemplazo.
        IF r.requires_replacement AND r.replacement_user_id IS NOT NULL THEN
          IF r.replacement_user_id = r.requester_id THEN
            RETURN jsonb_build_object('ok', false, 'error', 'ERROR_GENERAL');
          END IF;
          IF NOT public.is_active_member(r.replacement_user_id) THEN
            RETURN jsonb_build_object('ok', false, 'error', 'MIEMBRO_NO_VINCULADO');
          END IF;
          v_rep := private.resolver_dia(r.replacement_user_id, r.replacement_name, v_d);
          IF v_rep->>'memberId' IS NULL THEN
            RETURN jsonb_build_object('ok', false, 'error',
              coalesce(nullif(v_rep->>'estado','SIN_TURNO'), 'MIEMBRO_NO_VINCULADO'));
          END IF;
          IF v_rep->>'estado' = 'TURNO_ENCONTRADO' THEN
            RETURN jsonb_build_object('ok', false, 'error', 'REEMPLAZO_OCUPADO', 'fecha', v_d);
          END IF;
          SELECT * INTO v_rep_day FROM public.shift_schedule_days d
            WHERE d.member_id = (v_rep->>'memberId')::uuid
              AND d.day_number = (v_cur->>'dayNumber')::int FOR UPDATE;
          IF v_rep_day.id IS NOT NULL AND v_rep_day.shift_code IS NOT NULL THEN
            RETURN jsonb_build_object('ok', false, 'error', 'REEMPLAZO_OCUPADO', 'fecha', v_d);
          END IF;
          IF v_rep_day.id IS NOT NULL THEN
            UPDATE public.shift_schedule_days
               SET shift_code = v_cur->>'shiftCode', hours = (v_cur->>'hours')::numeric,
                   coverage_request_id = _request_id, origin = 'cobertura_solicitud',
                   changed_by = _actor, changed_at = now(),
                   notes = left('COBERTURA ' || left(_request_id::text,8), 400)
             WHERE id = v_rep_day.id;
          ELSE
            INSERT INTO public.shift_schedule_days (
              schedule_id, member_id, day_number, shift_date, shift_code, hours,
              notes, origin, changed_by, changed_at, unidad_funcional, coverage_request_id
            ) VALUES (
              (v_rep->>'scheduleId')::uuid, (v_rep->>'memberId')::uuid,
              (v_cur->>'dayNumber')::int, v_d, v_cur->>'shiftCode',
              (v_cur->>'hours')::numeric, 'COBERTURA ' || left(_request_id::text,8),
              'cobertura_solicitud', _actor, now(), v_cur->>'unidadFuncional', _request_id)
            RETURNING id INTO v_new_id;
          END IF;
          PERFORM public.registrar_auditoria_srv(_actor, 'SHIFT_COVERAGE_APPLIED', 'cuadro_turno',
            'shift_schedule_days', _request_id::text, 'exito',
            jsonb_build_object('fecha', v_d, 'solicitante', v_cur, 'reemplazo', v_rep));
        END IF;

        v_dias := v_dias || jsonb_build_array(
          jsonb_build_object('fecha', v_d, 'resultado', 'APLICADO',
                             'before', v_cur, 'shift_code', v_cur->>'shiftCode'));
      END IF;
      v_d := v_d + 1;
    END LOOP;

    PERFORM public.registrar_auditoria_srv(_actor, 'SHIFT_PERMISSION_APPLIED', 'cuadro_turno',
      'shift_schedule_days', _request_id::text, 'exito', jsonb_build_object('dias', v_dias));
  END IF;

  -- ---- Ausentismo (misma transacción, sin duplicados) ---------------------
  IF coalesce(_registrar_ausentismo, r.register_absenteeism, false)
     AND NOT EXISTS (SELECT 1 FROM public.shift_absenteeism_records a WHERE a.request_id = _request_id) THEN
    v_min := coalesce(
      CASE WHEN r.start_time IS NOT NULL AND r.end_time IS NOT NULL
        THEN (extract(epoch from (r.end_time - r.start_time)) / 60)::int END,
      r.requested_minutes, 0);
    v_evt := CASE WHEN r.reason_type = 'Incapacidad' THEN 'INC'
                  WHEN r.reason_type = 'Licencia' THEN 'LIC'
                  WHEN r.reason_type = 'Llegada tarde' THEN 'LLT'
                  WHEN r.reason_type = 'Ausencia' THEN 'AUS'
                  WHEN r.reason_type = 'Salida' THEN 'SAL' ELSE 'PER' END;
    INSERT INTO public.shift_absenteeism_records (
      request_id, user_id, identification_number, worker_name, role_name,
      start_date, end_date, start_time, end_time, minutes_number, days_number,
      event_code, event_name, reason, origin, approved_by, approved_at,
      created_by, status
    ) VALUES (
      _request_id, r.requester_id, r.requester_identification, r.requester_name,
      r.requester_role, r.start_date, r.end_date, r.start_time, r.end_time,
      v_min, greatest(1, coalesce(r.end_date, r.start_date) - r.start_date + 1),
      v_evt, r.reason_type,
      CASE WHEN r.reason_type = 'Otro' THEN r.other_reason ELSE r.reason_type END,
      'solicitud_aprobada', _actor, now(), _actor,
      CASE WHEN r.will_recover_time THEN 'pendiente_verificacion' ELSE 'activo' END);
  END IF;

  -- ---- Avisos de verificación de devolución -------------------------------
  IF r.will_recover_time THEN
    FOR v_frag IN SELECT f.* FROM public.shift_return_fragments f
      WHERE f.request_id = _request_id AND f.verification_result = 'PENDIENTE' LOOP
      INSERT INTO public.avisos (mensaje, estado, prioridad, modulo, fecha_inicio, archivado, created_by)
      SELECT 'VERIFICAR DEVOLUCIÓN DE TIEMPO — ' || coalesce(r.requester_name,'Funcionario')
             || ' debía devolver ' || round(coalesce(v_frag.minutes,0)/60.0, 1) || ' h a '
             || coalesce(v_frag.receiver_name,'receptor') || ' el '
             || coalesce(v_frag.return_date::text,'—') || '.',
             'ACTIVO', 'ALTO', 'TURNO',
             coalesce(v_frag.return_date::timestamptz, now()), false, _actor
      WHERE NOT EXISTS (
        SELECT 1 FROM public.avisos a WHERE a.modulo = 'TURNO' AND a.archivado = false
          AND a.mensaje LIKE '%' || coalesce(v_frag.receiver_name,'receptor') || '%'
          AND a.fecha_inicio = coalesce(v_frag.return_date::timestamptz, now()));
    END LOOP;
  END IF;

  UPDATE public.shift_requests
     SET status = 'APROBADA', approved_by = _actor, approved_at = now(),
         approval_observation = nullif(_observacion,''),
         register_absenteeism = coalesce(_registrar_ausentismo, r.register_absenteeism, false),
         cuadro_applied = true
   WHERE id = _request_id;

  INSERT INTO public.shift_request_audit (request_id, action, previous_status, new_status, user_id, detail)
  VALUES (_request_id, 'APROBADA', r.status, 'APROBADA', _actor,
          coalesce(_observacion, '') || CASE WHEN v_legacy THEN ' [legacy sin snapshot]' ELSE '' END);

  PERFORM public.registrar_auditoria_srv(_actor, 'SHIFT_REQUEST_APPROVED', 'cuadro_turno',
    'shift_requests', _request_id::text, 'exito',
    jsonb_build_object('legacy', v_legacy, 'aplico_cuadro', v_aplico, 'dias', v_dias));

  RETURN jsonb_build_object('ok', true, 'decision', 'APROBAR', 'dias', v_dias, 'legacy', v_legacy);
END $$;

REVOKE ALL ON FUNCTION private.decidir_solicitud_turno(uuid, uuid, text, text, boolean) FROM PUBLIC;

-- 6. WRAPPERS PÚBLICOS (invocables solo por service_role desde Server Function)
CREATE OR REPLACE FUNCTION public.crear_solicitud_turno(_actor uuid, _payload jsonb)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT private.crear_solicitud_turno(_actor, _payload)
$$;

CREATE OR REPLACE FUNCTION public.decidir_solicitud_turno(
  _actor uuid, _request_id uuid, _decision text,
  _observacion text DEFAULT NULL, _registrar_ausentismo boolean DEFAULT NULL)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT private.decidir_solicitud_turno(_actor, _request_id, _decision, _observacion, _registrar_ausentismo)
$$;

REVOKE ALL ON FUNCTION public.crear_solicitud_turno(uuid, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.decidir_solicitud_turno(uuid, uuid, text, text, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crear_solicitud_turno(uuid, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.decidir_solicitud_turno(uuid, uuid, text, text, boolean) TO service_role;