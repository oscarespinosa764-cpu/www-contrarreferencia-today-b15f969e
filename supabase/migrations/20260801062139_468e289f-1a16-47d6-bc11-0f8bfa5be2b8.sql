-- 1) Guard de columnas de especialidad en public.remisiones (fail-closed).
CREATE OR REPLACE FUNCTION private.remisiones_especialidades_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF (OLD.especialidades_tratantes IS DISTINCT FROM NEW.especialidades_tratantes
      OR OLD.especialidades_receptoras IS DISTINCT FROM NEW.especialidades_receptoras)
     AND coalesce(current_setting('app.esp_hist_ctx', true), '') <> '1' THEN
    RAISE EXCEPTION 'Las especialidades deben modificarse desde Seguimientos → Novedades → Cambio de Especialidad'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS a_remisiones_especialidades_guard ON public.remisiones;
CREATE TRIGGER a_remisiones_especialidades_guard
BEFORE UPDATE ON public.remisiones
FOR EACH ROW EXECUTE FUNCTION private.remisiones_especialidades_guard();

-- 2) Endurecer el guard del historial: solo contexto canónico (sin excepción service_role).
CREATE OR REPLACE FUNCTION private.esp_historial_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF coalesce(current_setting('app.esp_hist_ctx', true), '') <> '1' THEN
    RAISE EXCEPTION 'El historial de especialidades solo puede registrarse mediante la novedad CAMBIO DE ESPECIALIDAD'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;

-- 3) RPC canónica: el contexto cubre historial Y actualización de la remisión.
CREATE OR REPLACE FUNCTION private.novedad_cambio_especialidad(
  _actor uuid, _caso_id uuid, _agregar text[], _cerrar text[],
  _observaciones text DEFAULT NULL, _plantilla text DEFAULT NULL, _canales jsonb DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_arch boolean; v_estado text; v_tratantes text;
  v_antes text[] := '{}'; v_agregar text[] := '{}'; v_cerrar text[] := '{}';
  v_cerradas text[] := '{}'; v_add text[] := '{}'; v_react text[] := '{}';
  v_despues text[] := '{}';
  v_obs text; v_nombre text; v_seg_id uuid; v_det jsonb; v_e text;
BEGIN
  IF _actor IS NULL OR NOT private.is_active_member(_actor) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Usuario no autorizado'); END IF;

  SELECT coalesce(archivado,false), upper(coalesce(estado,'')), coalesce(especialidades_tratantes,'')
    INTO v_arch, v_estado, v_tratantes
    FROM public.remisiones WHERE id = _caso_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'Caso no encontrado'); END IF;
  IF v_arch THEN RETURN jsonb_build_object('ok', false, 'error', 'El caso está cerrado'); END IF;
  IF v_estado ~ '(CERRAD|CANCELAD|DESIST|TRASLADO EFECTIVO|ARCHIV|CULMINAD)' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'El caso no admite cambios de especialidad'); END IF;

  SELECT coalesce(array_agg(DISTINCT s), '{}')
    INTO v_antes
    FROM unnest(string_to_array(v_tratantes, ',')) t(x),
         LATERAL (SELECT upper(btrim(regexp_replace(x, '\s+', ' ', 'g')))) z(s)
   WHERE btrim(x) <> '';

  SELECT coalesce(array_agg(esp), '{}') INTO v_cerradas FROM (
    SELECT DISTINCT ON (upper(btrim(h.especialidad)))
           upper(btrim(h.especialidad)) AS esp, h.action
      FROM public.especialidades_historial h
     WHERE h.caso_id = _caso_id
     ORDER BY upper(btrim(h.especialidad)), h.effective_at DESC, h.created_at DESC
  ) u WHERE u.action = 'CLOSED' AND NOT (u.esp = ANY(v_antes));

  SELECT coalesce(array_agg(DISTINCT s), '{}') INTO v_agregar
    FROM unnest(coalesce(_agregar,'{}')) t(x),
         LATERAL (SELECT upper(btrim(regexp_replace(x, '\s+', ' ', 'g')))) z(s)
   WHERE btrim(x) <> '';
  SELECT coalesce(array_agg(DISTINCT s), '{}') INTO v_cerrar
    FROM unnest(coalesce(_cerrar,'{}')) t(x),
         LATERAL (SELECT upper(btrim(regexp_replace(x, '\s+', ' ', 'g')))) z(s)
   WHERE btrim(x) <> '';

  IF array_length(v_agregar,1) IS NULL AND array_length(v_cerrar,1) IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No se registró ningún cambio de especialidad'); END IF;
  IF array_length(v_agregar,1) > 20 OR array_length(v_cerrar,1) > 20 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Demasiadas especialidades en una sola operación'); END IF;
  IF EXISTS (SELECT 1 FROM unnest(v_agregar) a WHERE a = ANY(v_cerrar)) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Una especialidad no puede agregarse y cerrarse a la vez'); END IF;

  FOREACH v_e IN ARRAY v_agregar LOOP
    IF NOT EXISTS (SELECT 1 FROM public.catalogos c
                    WHERE c.tipo = 'ESPECIALIDAD' AND c.activo = true
                      AND upper(btrim(c.valor)) = v_e) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'Especialidad no válida: ' || v_e); END IF;
    IF v_e = ANY(v_antes) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'La especialidad ' || v_e || ' ya está activa'); END IF;
  END LOOP;
  FOREACH v_e IN ARRAY v_cerrar LOOP
    IF NOT (v_e = ANY(v_antes)) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'La especialidad ' || v_e || ' no está activa'); END IF;
  END LOOP;

  SELECT coalesce(array_agg(a), '{}') INTO v_react FROM unnest(v_agregar) a WHERE a = ANY(v_cerradas);
  SELECT coalesce(array_agg(a), '{}') INTO v_add   FROM unnest(v_agregar) a WHERE NOT (a = ANY(v_cerradas));
  SELECT coalesce(array_agg(x), '{}') INTO v_despues FROM (
    SELECT unnest(v_antes) AS x
    EXCEPT SELECT unnest(v_cerrar)
    UNION SELECT unnest(v_agregar)
  ) q;
  IF array_length(v_despues,1) IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'El caso debe conservar al menos una especialidad activa'); END IF;

  v_obs := nullif(left(btrim(coalesce(_observaciones,'')), 1000), '');
  IF (array_length(v_cerrar,1) IS NOT NULL OR array_length(v_react,1) IS NOT NULL) AND v_obs IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Registre las observaciones del cambio'); END IF;

  SELECT p.nombre INTO v_nombre FROM public.profiles p WHERE p.user_id = _actor;

  v_det := jsonb_strip_nulls(jsonb_build_object(
    'novedad_tipo',                'CAMBIO_ESPECIALIDAD',
    'especialidades_antes',        to_jsonb(v_antes),
    'especialidades_agregadas',    to_jsonb(v_add),
    'especialidades_cerradas',     to_jsonb(v_cerrar),
    'especialidades_reactivadas',  to_jsonb(v_react),
    'especialidades_despues',      to_jsonb(v_despues),
    'motivo',                      v_obs,
    'observaciones',               v_obs
  ));
  IF _canales IS NOT NULL AND jsonb_typeof(_canales) = 'array' AND jsonb_array_length(_canales) > 0 THEN
    v_det := v_det || jsonb_build_object('canales_gestion', _canales, 'canal_gestion', _canales->>0);
  END IF;

  INSERT INTO public.seguimientos (caso_id, tipo_caso, tipo_seguimiento, detalle,
    plantilla_indigo, detalles, nombre_usuario, created_by)
  VALUES (_caso_id, 'remision', 'NOVEDADES', v_obs,
    nullif(left(btrim(coalesce(_plantilla,'')), 20000), ''), v_det, v_nombre, _actor)
  RETURNING id INTO v_seg_id;

  -- Contexto canónico: cubre historial inmutable Y actualización de columnas protegidas.
  PERFORM set_config('app.esp_hist_ctx', '1', true);

  INSERT INTO public.especialidades_historial
    (caso_id, tabla, tipo_caso, especialidad, action, previous_status, new_status,
     motivo, seguimiento_id, changed_by, changed_by_name)
  SELECT _caso_id, 'remisiones', 'remision', e, 'CLOSED', 'ACTIVA',
         'CERRADA POR FINALIZACIÓN DE MANEJO', v_obs, v_seg_id, _actor, v_nombre
    FROM unnest(v_cerrar) e
  UNION ALL
  SELECT _caso_id, 'remisiones', 'remision', e, 'REACTIVATED',
         'CERRADA POR FINALIZACIÓN DE MANEJO', 'ACTIVA', v_obs, v_seg_id, _actor, v_nombre
    FROM unnest(v_react) e
  UNION ALL
  SELECT _caso_id, 'remisiones', 'remision', e, 'ADDED', NULL, 'ACTIVA',
         v_obs, v_seg_id, _actor, v_nombre
    FROM unnest(v_add) e;

  UPDATE public.remisiones
     SET especialidades_tratantes = array_to_string(v_despues, ', '), updated_at = now()
   WHERE id = _caso_id;

  PERFORM set_config('app.esp_hist_ctx', '', true);

  PERFORM public.registrar_auditoria_srv(_actor, 'NOVEDAD_CAMBIO_ESPECIALIDAD',
    'salientes', 'remisiones', _caso_id::text, 'exito', v_det);

  RETURN jsonb_build_object('ok', true, 'seguimiento_id', v_seg_id,
    'especialidades_antes', to_jsonb(v_antes),
    'especialidades_agregadas', to_jsonb(v_add),
    'especialidades_cerradas', to_jsonb(v_cerrar),
    'especialidades_reactivadas', to_jsonb(v_react),
    'especialidades_despues', to_jsonb(v_despues));
END;
$$;