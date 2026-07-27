CREATE OR REPLACE FUNCTION private.reactivar_caso_cancelado_admin(
  _requester uuid,
  _tipo_caso text,
  _caso_id uuid,
  _motivo_reactivacion text,
  _updated_at_esperado timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_is_admin boolean;
  v_is_active boolean;
  v_cancel_set text[];
  v_current_state text;
  v_current_updated_at timestamptz;
  v_previous_state text;
  v_capture_seg_id uuid;
  v_capture_created_at timestamptz;
  v_reactivation_seg_id uuid;
  v_motivo text;
  v_fuente text;
  v_initial_state text;
  v_mutating_types text[];
  v_mutating_estado_solicitud text[];
  v_mutating_count int;
  v_case_created_at timestamptz;
  v_evidencia_creacion boolean;
BEGIN
  v_motivo := btrim(coalesce(_motivo_reactivacion, ''));
  IF length(v_motivo) < 10 OR length(v_motivo) > 500 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'MOTIVO_INVALIDO');
  END IF;

  IF _requester IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'REQUESTER_INVALIDO');
  END IF;
  SELECT private.is_active_member(_requester) INTO v_is_active;
  IF NOT COALESCE(v_is_active, false) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'USUARIO_NO_ACTIVO');
  END IF;
  SELECT public.has_role(_requester, 'admin'::public.app_role) INTO v_is_admin;
  IF NOT COALESCE(v_is_admin, false) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NO_ES_ADMIN');
  END IF;

  IF _tipo_caso = 'entrante' THEN
    v_cancel_set := ARRAY['CANCELADO','CANCELADO_VENCIMIENTO'];
    v_initial_state := NULL;
  ELSIF _tipo_caso = 'remision' THEN
    v_cancel_set := ARRAY[
      'CERRADO POR CANCELACION - AVAL PARA MANEJO INTEGRAL',
      'CERRADO POR CANCELACION - CONTINUIDAD DE MANEJO INTEGRAL',
      'CERRADO POR CANCELACION - DESISTIMIENTO DE TRASLADO GENERAL',
      'CERRADO POR CANCELACION - MEJORIA CLINICA / ALTA MEDICA'
    ];
    v_initial_state := 'PENDIENTE ACEPTACION';
    -- Solo transiciones estructuradas hacia estados operativos DISTINTOS del cancelatorio actual.
    -- Se excluyen los eventos de cancelación porque su resultado ES el estado que se está deshaciendo.
    v_mutating_types := ARRAY[
      'ACEPTACIÓN DE IPS RECEPTORA',
      'AMBULANCIA COORDINADA',
      'ENTREGA DE DOCUMENTACIÓN AMBULANCIA',
      'CIERRE DE CASO POR EGRESO',
      'CIERRE DE CASO POR TRASLADO EFECTIVO'
    ];
    v_mutating_estado_solicitud := ARRAY[
      'ACEPTADO SIN PROGRAMACION DE AMBULANCIA',
      'ACEPTADO CON AMBULANCIA COORDINADA',
      'PENDIENTE EGRESO REMISION',
      'CERRADO POR REMISION EXITOSA',
      'CERRADO POR TRASLADO EFECTIVO',
      'DESISTIMIENTO IPS',
      'DESISTIMIENTO GENERAL'
    ];
  ELSIF _tipo_caso = 'domiciliario' THEN
    v_cancel_set := ARRAY[
      'CERRADO POR CANCELACION DEL PROVEEDOR',
      'CERRADO POR CANCELACION DE LA ESPECIALIDAD SOLICITANTE'
    ];
    v_initial_state := 'PENDIENTE ACEPTACION';
    v_mutating_types := ARRAY[
      'ACEPTACIÓN DE IPS RECEPTORA',
      'AMBULANCIA COORDINADA',
      'ENTREGA DE DOCUMENTACIÓN AMBULANCIA',
      'CIERRE DE CASO POR EGRESO'
    ];
    v_mutating_estado_solicitud := ARRAY[
      'ACEPTADO - PENDIENTE EGRESO',
      'ACEPTADO - PENDIENTE COORDINACION DE AMBULANCIA',
      'AMBULANCIA COORDINADA - PENDIENTE EGRESO',
      'CERRADO POR EGRESO'
    ];
  ELSIF _tipo_caso = 'referencia_interna' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'FLUJO_NO_APLICA');
  ELSE
    RETURN jsonb_build_object('ok', false, 'code', 'TIPO_CASO_INVALIDO');
  END IF;

  IF _tipo_caso = 'entrante' THEN
    SELECT estado, updated_at, created_at
      INTO v_current_state, v_current_updated_at, v_case_created_at
      FROM public.casos_entrantes WHERE id = _caso_id FOR UPDATE;
  ELSIF _tipo_caso = 'remision' THEN
    SELECT estado, updated_at, created_at
      INTO v_current_state, v_current_updated_at, v_case_created_at
      FROM public.remisiones WHERE id = _caso_id FOR UPDATE;
  ELSIF _tipo_caso = 'domiciliario' THEN
    SELECT estado_ciclo, updated_at, created_at
      INTO v_current_state, v_current_updated_at, v_case_created_at
      FROM public.domiciliarios WHERE id = _caso_id FOR UPDATE;
  END IF;

  IF v_current_state IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'CASO_NO_ENCONTRADO');
  END IF;

  IF _updated_at_esperado IS NULL OR v_current_updated_at IS DISTINCT FROM _updated_at_esperado THEN
    RETURN jsonb_build_object('ok', false, 'code', 'CASE_CONCURRENTLY_UPDATED');
  END IF;

  IF NOT (v_current_state = ANY(v_cancel_set)) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'CASO_NO_ESTA_CANCELADO');
  END IF;

  SELECT id, created_at,
         coalesce(detalles->>'estado_previo', estado_solicitud)
    INTO v_capture_seg_id, v_capture_created_at, v_previous_state
    FROM public.seguimientos
   WHERE caso_id = _caso_id
     AND tipo_caso = _tipo_caso
     AND tipo_seguimiento = 'CANCELACION_CAPTURA_ESTADO_PREVIO'
   ORDER BY created_at DESC
   LIMIT 1;

  IF v_capture_seg_id IS NOT NULL AND v_previous_state IS NOT NULL
     AND NOT (v_previous_state = ANY(v_cancel_set)) THEN
    v_fuente := 'CAPTURED_PREVIOUS_STATE';
  ELSE
    v_previous_state := NULL;
    v_capture_seg_id := NULL;

    IF v_initial_state IS NOT NULL THEN
      v_evidencia_creacion := v_case_created_at IS NOT NULL;

      SELECT count(*)
        INTO v_mutating_count
        FROM public.seguimientos
       WHERE caso_id = _caso_id
         AND tipo_caso = _tipo_caso
         AND (
              tipo_seguimiento = ANY(v_mutating_types)
           OR (estado_solicitud IS NOT NULL AND estado_solicitud = ANY(v_mutating_estado_solicitud))
         );

      IF v_evidencia_creacion AND v_mutating_count = 0 THEN
        v_previous_state := v_initial_state;
        v_fuente := 'RECONSTRUCTED_STATE_TIMELINE';
      END IF;
    END IF;
  END IF;

  IF v_previous_state IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NO_ESTADO_PREVIO_CONFIABLE');
  END IF;

  IF v_previous_state = ANY(v_cancel_set) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NO_ESTADO_PREVIO_CONFIABLE');
  END IF;

  IF _tipo_caso = 'domiciliario' THEN
    IF v_previous_state IN ('CERRADO POR EGRESO',
                            'CERRADO POR CANCELACION DEL PROVEEDOR',
                            'CERRADO POR CANCELACION DE LA ESPECIALIDAD SOLICITANTE') THEN
      RETURN jsonb_build_object('ok', false, 'code', 'NO_ESTADO_PREVIO_CONFIABLE');
    END IF;
    PERFORM set_config('app.admin_case_reactivation', 'true', true);
  END IF;

  IF _tipo_caso = 'entrante' THEN
    UPDATE public.casos_entrantes
       SET estado = v_previous_state, updated_at = now()
     WHERE id = _caso_id;
  ELSIF _tipo_caso = 'remision' THEN
    UPDATE public.remisiones
       SET estado = v_previous_state, updated_at = now()
     WHERE id = _caso_id;
  ELSIF _tipo_caso = 'domiciliario' THEN
    UPDATE public.domiciliarios
       SET estado_ciclo = v_previous_state, updated_at = now()
     WHERE id = _caso_id;
  END IF;

  INSERT INTO public.seguimientos (
    caso_id, tipo_caso, tipo_seguimiento, estado_solicitud, detalle,
    created_by, detalles
  ) VALUES (
    _caso_id,
    _tipo_caso,
    'REACTIVACION_ADMINISTRATIVA',
    v_previous_state,
    'REACTIVADO POR ADMINISTRADOR — CANCELACIÓN DESHECHA',
    _requester,
    jsonb_build_object(
      'motivo_reactivacion', v_motivo,
      'estado_cancelado', v_current_state,
      'estado_restaurado', v_previous_state,
      'fuente_resolucion', v_fuente,
      'captura_seguimiento_id', v_capture_seg_id,
      'captura_created_at', v_capture_created_at,
      'transiciones_estructuradas_previas', coalesce(v_mutating_count, 0),
      'requester_id', _requester,
      'reactivado_at', now()
    )
  ) RETURNING id INTO v_reactivation_seg_id;

  PERFORM public.registrar_auditoria_srv(
    _requester,
    'CASE_REACTIVATED_ADMIN',
    'reactivacion',
    CASE _tipo_caso
      WHEN 'entrante' THEN 'casos_entrantes'
      WHEN 'remision' THEN 'remisiones'
      WHEN 'domiciliario' THEN 'domiciliarios'
    END,
    _caso_id::text,
    'exito',
    jsonb_build_object(
      'tipo_caso', _tipo_caso,
      'estado_cancelado', v_current_state,
      'estado_restaurado', v_previous_state,
      'fuente_resolucion', v_fuente,
      'motivo_reactivacion', v_motivo,
      'captura_seguimiento_id', v_capture_seg_id,
      'transiciones_estructuradas_previas', coalesce(v_mutating_count, 0),
      'reactivacion_seguimiento_id', v_reactivation_seg_id
    ),
    NULL, NULL
  );

  RETURN jsonb_build_object(
    'ok', true,
    'estado_restaurado', v_previous_state,
    'estado_cancelado', v_current_state,
    'fuente_resolucion', v_fuente,
    'reactivacion_seguimiento_id', v_reactivation_seg_id
  );
END;
$$;