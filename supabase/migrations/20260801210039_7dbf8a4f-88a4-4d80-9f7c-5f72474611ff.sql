-- 1) Guard fail-closed para DELETE en public.shift_schedule_days
CREATE OR REPLACE FUNCTION private.shift_days_delete_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF coalesce(current_setting('app.shift_delete_ctx', true), '') <> '1' THEN
    RAISE EXCEPTION 'Eliminación de turnos no permitida fuera de la operación autorizada'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS a_shift_days_delete_guard ON public.shift_schedule_days;
CREATE TRIGGER a_shift_days_delete_guard
BEFORE DELETE ON public.shift_schedule_days
FOR EACH ROW EXECUTE FUNCTION private.shift_days_delete_guard();

-- 2) RPC canónica transaccional
CREATE OR REPLACE FUNCTION private.eliminar_turnos_programados_lote(
  _actor uuid,
  _schedule_id uuid,
  _member_id uuid,
  _ids uuid[]
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_ids uuid[];
  v_sched record;
  v_member record;
  v_rows jsonb;
  v_count int;
  v_deleted int;
  v_lote uuid := gen_random_uuid();
  r record;
BEGIN
  IF _actor IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'NO_AUTENTICADO');
  END IF;
  IF NOT private.is_active_member(_actor) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'INACTIVO');
  END IF;
  IF NOT private.has_role(_actor, 'admin'::public.app_role) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'SIN_PERMISO');
  END IF;

  SELECT ARRAY(SELECT DISTINCT x FROM unnest(coalesce(_ids, '{}'::uuid[])) x) INTO v_ids;
  v_count := coalesce(array_length(v_ids, 1), 0);
  IF v_count = 0 OR v_count > 200 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'LOTE_NO_VALIDO');
  END IF;

  SELECT id, year, month, dependency INTO v_sched
    FROM public.shift_schedules WHERE id = _schedule_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'PROGRAMACION_CAMBIO');
  END IF;

  SELECT id, schedule_id, full_name INTO v_member
    FROM public.shift_schedule_members WHERE id = _member_id;
  IF NOT FOUND OR v_member.schedule_id <> _schedule_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'PROGRAMACION_CAMBIO');
  END IF;

  -- Relectura autoritativa con lock
  PERFORM 1 FROM public.shift_schedule_days
    WHERE id = ANY(v_ids) FOR UPDATE;

  SELECT count(*) INTO v_deleted
    FROM public.shift_schedule_days
   WHERE id = ANY(v_ids)
     AND schedule_id = _schedule_id
     AND member_id = _member_id;

  IF v_deleted <> v_count THEN
    RETURN jsonb_build_object('ok', false, 'error', 'PROGRAMACION_CAMBIO');
  END IF;

  SELECT jsonb_agg(jsonb_build_object(
           'id', d.id, 'day_number', d.day_number, 'shift_date', d.shift_date,
           'shift_code', d.shift_code, 'hours', d.hours, 'origin', d.origin,
           'notes', d.notes, 'unidad_funcional', d.unidad_funcional)
           ORDER BY d.day_number)
    INTO v_rows
    FROM public.shift_schedule_days d
   WHERE d.id = ANY(v_ids);

  -- Auditoría por fila (obligatoria, misma transacción)
  FOR r IN SELECT * FROM jsonb_array_elements(v_rows) AS t(row) LOOP
    INSERT INTO public.audit_logs (user_id, actor_email, accion, modulo, tabla, registro_id, resultado, detalles)
    VALUES (_actor, (SELECT email FROM auth.users WHERE id = _actor),
            'TURNO_BORRADO', 'cuadro_turno', 'shift_schedule_days',
            (r.row->>'id'), 'exito',
            jsonb_build_object('lote_id', v_lote, 'schedule_id', _schedule_id,
              'member_id', _member_id, 'funcionario', v_member.full_name,
              'anio', v_sched.year, 'mes', v_sched.month,
              'dependencia', v_sched.dependency, 'snapshot', r.row));
  END LOOP;

  -- Auditoría resumen
  INSERT INTO public.audit_logs (user_id, actor_email, accion, modulo, tabla, registro_id, resultado, detalles)
  VALUES (_actor, (SELECT email FROM auth.users WHERE id = _actor),
          'TURNOS_BORRADOS_LOTE', 'cuadro_turno', 'shift_schedule_days',
          _schedule_id::text, 'exito',
          jsonb_build_object('lote_id', v_lote, 'schedule_id', _schedule_id,
            'member_id', _member_id, 'funcionario', v_member.full_name,
            'anio', v_sched.year, 'mes', v_sched.month,
            'dependencia', v_sched.dependency,
            'solicitados', v_count, 'eliminados', v_count,
            'ids', to_jsonb(v_ids), 'filas', v_rows));

  -- DELETE único dentro del contexto canónico
  PERFORM set_config('app.shift_delete_ctx', '1', true);
  DELETE FROM public.shift_schedule_days
   WHERE id = ANY(v_ids) AND schedule_id = _schedule_id AND member_id = _member_id;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  PERFORM set_config('app.shift_delete_ctx', '', true);

  IF v_deleted <> v_count THEN
    RAISE EXCEPTION 'Conteo de eliminación inconsistente';
  END IF;

  RETURN jsonb_build_object('ok', true, 'eliminados', v_deleted,
    'ids_eliminados', to_jsonb(v_ids), 'lote_id', v_lote);
END;
$$;

CREATE OR REPLACE FUNCTION public.eliminar_turnos_programados_lote(
  _actor uuid, _schedule_id uuid, _member_id uuid, _ids uuid[]
) RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT private.eliminar_turnos_programados_lote(_actor, _schedule_id, _member_id, _ids);
$$;

REVOKE ALL ON FUNCTION public.eliminar_turnos_programados_lote(uuid, uuid, uuid, uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.eliminar_turnos_programados_lote(uuid, uuid, uuid, uuid[]) TO service_role;