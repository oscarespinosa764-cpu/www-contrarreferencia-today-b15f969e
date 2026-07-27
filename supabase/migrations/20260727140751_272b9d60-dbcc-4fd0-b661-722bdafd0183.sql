-- =============================================================================
-- FASE 2 · Reactivación administrativa de casos cancelados
-- =============================================================================

-- Asegura schema privado
CREATE SCHEMA IF NOT EXISTS private;

-- -----------------------------------------------------------------------------
-- 1) Trigger de captura del estado previo al cancelar (Entrantes / Salientes / PHD).
--    Inserta un seguimiento técnico "CANCELACION_CAPTURA_ESTADO_PREVIO" con el
--    estado inmediatamente anterior. Se usa SECURITY DEFINER para evitar que
--    RLS/INSERT policies bloqueen la captura desde un trigger BEFORE UPDATE.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.capture_cancellation_previous_state()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_old_state text;
  v_new_state text;
  v_tipo_caso text;
  v_cancel_set text[];
BEGIN
  IF TG_TABLE_NAME = 'casos_entrantes' THEN
    v_old_state := OLD.estado;
    v_new_state := NEW.estado;
    v_tipo_caso := 'entrante';
    v_cancel_set := ARRAY['CANCELADO','CANCELADO_VENCIMIENTO'];
  ELSIF TG_TABLE_NAME = 'remisiones' THEN
    v_old_state := OLD.estado;
    v_new_state := NEW.estado;
    v_tipo_caso := 'remision';
    v_cancel_set := ARRAY[
      'CERRADO POR CANCELACION - AVAL PARA MANEJO INTEGRAL',
      'CERRADO POR CANCELACION - CONTINUIDAD DE MANEJO INTEGRAL',
      'CERRADO POR CANCELACION - DESISTIMIENTO DE TRASLADO GENERAL',
      'CERRADO POR CANCELACION - MEJORIA CLINICA / ALTA MEDICA'
    ];
  ELSIF TG_TABLE_NAME = 'domiciliarios' THEN
    v_old_state := OLD.estado_ciclo;
    v_new_state := NEW.estado_ciclo;
    v_tipo_caso := 'domiciliario';
    v_cancel_set := ARRAY[
      'CERRADO POR CANCELACION DEL PROVEEDOR',
      'CERRADO POR CANCELACION DE LA ESPECIALIDAD SOLICITANTE'
    ];
  ELSE
    RETURN NEW;
  END IF;

  -- Solo transición hacia estado cancelatorio y desde un estado no cancelatorio
  IF v_new_state = ANY(v_cancel_set)
     AND (v_old_state IS NULL OR NOT (v_old_state = ANY(v_cancel_set)))
     AND v_old_state IS NOT NULL
  THEN
    INSERT INTO public.seguimientos (
      caso_id, tipo_caso, tipo_seguimiento, estado_solicitud, detalle,
      nombre_usuario, created_by, detalles
    ) VALUES (
      NEW.id,
      v_tipo_caso,
      'CANCELACION_CAPTURA_ESTADO_PREVIO',
      v_old_state,
      'Captura técnica de estado previo a cancelación',
      NULL,
      auth.uid(),
      jsonb_build_object(
        'estado_previo', v_old_state,
        'estado_cancelacion', v_new_state,
        'captured_at', now()
      )
    );
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- La captura NUNCA debe bloquear la cancelación real
  RAISE WARNING 'capture_cancellation_previous_state failed: %', SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_capture_cancellation_previous_state_entrantes ON public.casos_entrantes;
CREATE TRIGGER trg_capture_cancellation_previous_state_entrantes
BEFORE UPDATE OF estado ON public.casos_entrantes
FOR EACH ROW EXECUTE FUNCTION public.capture_cancellation_previous_state();

DROP TRIGGER IF EXISTS trg_capture_cancellation_previous_state_remisiones ON public.remisiones;
CREATE TRIGGER trg_capture_cancellation_previous_state_remisiones
BEFORE UPDATE OF estado ON public.remisiones
FOR EACH ROW EXECUTE FUNCTION public.capture_cancellation_previous_state();

DROP TRIGGER IF EXISTS trg_capture_cancellation_previous_state_domi ON public.domiciliarios;
CREATE TRIGGER trg_capture_cancellation_previous_state_domi
BEFORE UPDATE OF estado_ciclo ON public.domiciliarios
FOR EACH ROW EXECUTE FUNCTION public.capture_cancellation_previous_state();

-- -----------------------------------------------------------------------------
-- 2) Ajuste MÍNIMO al trigger de PHD para permitir la reactivación canónica.
--    Solo permite salir de un estado terminal cancelatorio cuando el marcador
--    transaccional 'app.admin_case_reactivation' está activo (lo establece
--    la función privada de reactivación al inicio de su transacción).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.domi_estado_gating()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  estados_permitidos TEXT[] := ARRAY[
    'PENDIENTE ACEPTACION',
    'ACEPTADO - PENDIENTE EGRESO',
    'ACEPTADO - PENDIENTE COORDINACION DE AMBULANCIA',
    'AMBULANCIA COORDINADA - PENDIENTE EGRESO',
    'CERRADO POR EGRESO',
    'CERRADO POR CANCELACION DEL PROVEEDOR',
    'CERRADO POR CANCELACION DE LA ESPECIALIDAD SOLICITANTE'
  ];
  terminales TEXT[] := ARRAY[
    'CERRADO POR EGRESO',
    'CERRADO POR CANCELACION DEL PROVEEDOR',
    'CERRADO POR CANCELACION DE LA ESPECIALIDAD SOLICITANTE'
  ];
  cancelatorios TEXT[] := ARRAY[
    'CERRADO POR CANCELACION DEL PROVEEDOR',
    'CERRADO POR CANCELACION DE LA ESPECIALIDAD SOLICITANTE'
  ];
  transiciones_validas TEXT[] := ARRAY[
    'PENDIENTE ACEPTACION->ACEPTADO - PENDIENTE EGRESO',
    'PENDIENTE ACEPTACION->ACEPTADO - PENDIENTE COORDINACION DE AMBULANCIA',
    'ACEPTADO - PENDIENTE EGRESO->ACEPTADO - PENDIENTE COORDINACION DE AMBULANCIA',
    'ACEPTADO - PENDIENTE EGRESO->CERRADO POR EGRESO',
    'ACEPTADO - PENDIENTE COORDINACION DE AMBULANCIA->AMBULANCIA COORDINADA - PENDIENTE EGRESO',
    'AMBULANCIA COORDINADA - PENDIENTE EGRESO->CERRADO POR EGRESO'
  ];
  trans TEXT;
  reactivation_marker TEXT;
BEGIN
  IF NEW.estado_ciclo IS NULL THEN
    NEW.estado_ciclo := 'PENDIENTE ACEPTACION';
  END IF;

  IF NOT (NEW.estado_ciclo = ANY(estados_permitidos)) THEN
    RAISE EXCEPTION 'Estado_ciclo no válido: %', NEW.estado_ciclo
      USING ERRCODE = 'check_violation';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.estado_ciclo <> 'PENDIENTE ACEPTACION' THEN
      RAISE EXCEPTION 'Todo caso nuevo debe iniciar en PENDIENTE ACEPTACION'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.estado_ciclo IS NOT DISTINCT FROM NEW.estado_ciclo THEN
    RETURN NEW;
  END IF;

  -- Excepción controlada: reactivación canónica desde estado cancelatorio terminal
  IF OLD.estado_ciclo = ANY(cancelatorios) THEN
    BEGIN
      reactivation_marker := current_setting('app.admin_case_reactivation', true);
    EXCEPTION WHEN OTHERS THEN
      reactivation_marker := NULL;
    END;
    IF reactivation_marker = 'true'
       AND NEW.estado_ciclo = ANY(estados_permitidos)
       AND NOT (NEW.estado_ciclo = ANY(terminales))
    THEN
      RETURN NEW;
    END IF;
  END IF;

  IF OLD.estado_ciclo = ANY(terminales) THEN
    RAISE EXCEPTION 'No se puede modificar el estado desde un estado terminal (%).', OLD.estado_ciclo
      USING ERRCODE = 'check_violation';
  END IF;

  -- Cancelaciones permitidas desde cualquier estado activo
  IF NEW.estado_ciclo IN (
       'CERRADO POR CANCELACION DEL PROVEEDOR',
       'CERRADO POR CANCELACION DE LA ESPECIALIDAD SOLICITANTE'
     ) THEN
    RETURN NEW;
  END IF;

  trans := OLD.estado_ciclo || '->' || NEW.estado_ciclo;
  IF NOT (trans = ANY(transiciones_validas)) THEN
    RAISE EXCEPTION 'Transición no permitida: % -> %', OLD.estado_ciclo, NEW.estado_ciclo
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

-- -----------------------------------------------------------------------------
-- 3) Función privada canónica y atómica de reactivación.
-- -----------------------------------------------------------------------------
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
BEGIN
  -- Sanitizar motivo
  v_motivo := btrim(coalesce(_motivo_reactivacion, ''));
  IF length(v_motivo) < 10 OR length(v_motivo) > 500 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'MOTIVO_INVALIDO');
  END IF;

  -- Validar requester activo + admin
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

  -- Allowlist por tipo_caso
  IF _tipo_caso = 'entrante' THEN
    v_cancel_set := ARRAY['CANCELADO','CANCELADO_VENCIMIENTO'];
  ELSIF _tipo_caso = 'remision' THEN
    v_cancel_set := ARRAY[
      'CERRADO POR CANCELACION - AVAL PARA MANEJO INTEGRAL',
      'CERRADO POR CANCELACION - CONTINUIDAD DE MANEJO INTEGRAL',
      'CERRADO POR CANCELACION - DESISTIMIENTO DE TRASLADO GENERAL',
      'CERRADO POR CANCELACION - MEJORIA CLINICA / ALTA MEDICA'
    ];
  ELSIF _tipo_caso = 'domiciliario' THEN
    v_cancel_set := ARRAY[
      'CERRADO POR CANCELACION DEL PROVEEDOR',
      'CERRADO POR CANCELACION DE LA ESPECIALIDAD SOLICITANTE'
    ];
  ELSIF _tipo_caso = 'referencia_interna' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'FLUJO_NO_APLICA');
  ELSE
    RETURN jsonb_build_object('ok', false, 'code', 'TIPO_CASO_INVALIDO');
  END IF;

  -- Bloquear el registro y leer estado + updated_at, según flujo
  IF _tipo_caso = 'entrante' THEN
    SELECT estado, updated_at INTO v_current_state, v_current_updated_at
      FROM public.casos_entrantes WHERE id = _caso_id FOR UPDATE;
  ELSIF _tipo_caso = 'remision' THEN
    SELECT estado, updated_at INTO v_current_state, v_current_updated_at
      FROM public.remisiones WHERE id = _caso_id FOR UPDATE;
  ELSIF _tipo_caso = 'domiciliario' THEN
    SELECT estado_ciclo, updated_at INTO v_current_state, v_current_updated_at
      FROM public.domiciliarios WHERE id = _caso_id FOR UPDATE;
  END IF;

  IF v_current_state IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'CASO_NO_ENCONTRADO');
  END IF;

  -- Concurrencia
  IF _updated_at_esperado IS NULL OR v_current_updated_at IS DISTINCT FROM _updated_at_esperado THEN
    RETURN jsonb_build_object('ok', false, 'code', 'CASE_CONCURRENTLY_UPDATED');
  END IF;

  -- Estado actual debe ser cancelatorio exacto
  IF NOT (v_current_state = ANY(v_cancel_set)) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'CASO_NO_ESTA_CANCELADO');
  END IF;

  -- Buscar el evento de captura estructurado más reciente
  SELECT id, created_at,
         coalesce(detalles->>'estado_previo', estado_solicitud)
    INTO v_capture_seg_id, v_capture_created_at, v_previous_state
    FROM public.seguimientos
   WHERE caso_id = _caso_id
     AND tipo_caso = _tipo_caso
     AND tipo_seguimiento = 'CANCELACION_CAPTURA_ESTADO_PREVIO'
   ORDER BY created_at DESC
   LIMIT 1;

  IF v_capture_seg_id IS NULL OR v_previous_state IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NO_ESTADO_PREVIO_CONFIABLE');
  END IF;

  -- Estado previo no puede ser cancelatorio (por si captura vino de re-cancel)
  IF v_previous_state = ANY(v_cancel_set) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NO_ESTADO_PREVIO_CONFIABLE');
  END IF;

  -- Validación adicional para PHD: estado restaurable no puede ser terminal
  IF _tipo_caso = 'domiciliario' THEN
    IF v_previous_state IN ('CERRADO POR EGRESO',
                            'CERRADO POR CANCELACION DEL PROVEEDOR',
                            'CERRADO POR CANCELACION DE LA ESPECIALIDAD SOLICITANTE') THEN
      RETURN jsonb_build_object('ok', false, 'code', 'NO_ESTADO_PREVIO_CONFIABLE');
    END IF;
    -- Activar marcador transaccional para la excepción controlada del gating
    PERFORM set_config('app.admin_case_reactivation', 'true', true);
  END IF;

  -- Aplicar restauración
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

  -- Insertar seguimiento de reactivación
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
      'captura_seguimiento_id', v_capture_seg_id,
      'captura_created_at', v_capture_created_at,
      'requester_id', _requester,
      'reactivado_at', now()
    )
  ) RETURNING id INTO v_reactivation_seg_id;

  -- Auditoría dentro de la misma transacción
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
      'motivo_reactivacion', v_motivo,
      'captura_seguimiento_id', v_capture_seg_id,
      'reactivacion_seguimiento_id', v_reactivation_seg_id
    ),
    NULL, NULL
  );

  RETURN jsonb_build_object(
    'ok', true,
    'estado_restaurado', v_previous_state,
    'estado_cancelado', v_current_state,
    'reactivacion_seguimiento_id', v_reactivation_seg_id
  );
END;
$$;

-- Cerrar permisos: sólo service_role puede invocar
REVOKE ALL ON FUNCTION private.reactivar_caso_cancelado_admin(uuid, text, uuid, text, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.reactivar_caso_cancelado_admin(uuid, text, uuid, text, timestamptz) FROM anon;
REVOKE ALL ON FUNCTION private.reactivar_caso_cancelado_admin(uuid, text, uuid, text, timestamptz) FROM authenticated;
GRANT EXECUTE ON FUNCTION private.reactivar_caso_cancelado_admin(uuid, text, uuid, text, timestamptz) TO service_role;

-- Función pública fina para invocar desde el server con service_role (misma firma)
CREATE OR REPLACE FUNCTION public.reactivar_caso_cancelado_admin(
  _requester uuid,
  _tipo_caso text,
  _caso_id uuid,
  _motivo_reactivacion text,
  _updated_at_esperado timestamptz
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT private.reactivar_caso_cancelado_admin(
    _requester, _tipo_caso, _caso_id, _motivo_reactivacion, _updated_at_esperado
  );
$$;

REVOKE ALL ON FUNCTION public.reactivar_caso_cancelado_admin(uuid, text, uuid, text, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reactivar_caso_cancelado_admin(uuid, text, uuid, text, timestamptz) FROM anon;
REVOKE ALL ON FUNCTION public.reactivar_caso_cancelado_admin(uuid, text, uuid, text, timestamptz) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.reactivar_caso_cancelado_admin(uuid, text, uuid, text, timestamptz) TO service_role;