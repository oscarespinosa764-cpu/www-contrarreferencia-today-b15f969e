CREATE OR REPLACE FUNCTION private.crear_solicitud_turno(_actor uuid, _payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_nombre text; v_cargo text; v_doc text; v_sede text;
  v_tipo text; v_cambio boolean; v_ini date; v_fin date; v_d date;
  v_snap jsonb := '{}'::jsonb; v_sol jsonb := '{}'::jsonb; v_rep jsonb := '{}'::jsonb;
  v_req_id uuid; v_exc uuid; v_exento boolean; v_uso record;
  v_frag jsonb; v_i int := 0; v_min int; v_replacement uuid; v_swap uuid;
BEGIN
  IF _actor IS NULL OR NOT public.is_active_member(_actor) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'SIN_PERMISO');
  END IF;
  SELECT p.nombre, p.cargo, p.numero_documento, p.sede
    INTO v_nombre, v_cargo, v_doc, v_sede
    FROM public.profiles p WHERE p.user_id = _actor;
  IF v_nombre IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'SIN_PERMISO'); END IF;

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
  IF v_ini IS NULL OR v_fin < v_ini OR v_fin - v_ini > 62 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'ERROR_GENERAL');
  END IF;

  v_d := v_ini;
  WHILE v_d <= v_fin LOOP
    v_sol := v_sol || jsonb_build_object(v_d::text, private.resolver_dia(_actor, v_nombre, v_d));
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
    v_tipo, _actor, v_nombre, v_doc, v_cargo, coalesce(v_sede,'SEDE PRINCIPAL'), 'PENDIENTE',
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