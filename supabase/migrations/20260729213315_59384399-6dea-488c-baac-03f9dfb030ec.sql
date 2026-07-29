
-- 1) Columnas canónicas ------------------------------------------------------
ALTER TABLE public.domiciliarios
  ADD COLUMN IF NOT EXISTS tipos_solicitud text[],
  ADD COLUMN IF NOT EXISTS unidad_especial_solicitada text,
  ADD COLUMN IF NOT EXISTS tipo_ambulancia_codigo text,
  ADD COLUMN IF NOT EXISTS ciclo_inicio_at timestamptz;

UPDATE public.domiciliarios SET ciclo_inicio_at = coalesce(created_at, now())
WHERE ciclo_inicio_at IS NULL;

ALTER TABLE public.domiciliarios ALTER COLUMN ciclo_inicio_at SET DEFAULT now();

-- 2) Backfill idempotente desde los textos históricos -------------------------
UPDATE public.domiciliarios d
SET tipos_solicitud = (
  SELECT array_agg(DISTINCT x) FROM (
    SELECT unnest(
      CASE
        WHEN upper(coalesce(d.tipo_solicitud,'')) LIKE '%PAD%CRONIC%' THEN ARRAY['PAD_CRONICO']
        WHEN upper(coalesce(d.tipo_solicitud,'')) LIKE '%PAD%' THEN ARRAY['PAD']
        WHEN upper(coalesce(d.tipo_solicitud,'')) LIKE '%PHD%' THEN ARRAY['PHD']
        WHEN upper(coalesce(d.tipo_solicitud,'')) LIKE '%UNIDAD%' THEN ARRAY['UNIDADES_ESPECIALES']
        ELSE ARRAY[]::text[]
      END
      ||
      CASE WHEN upper(coalesce(d.tipo_solicitud,'')) LIKE '%OXIGENO%'
              OR upper(coalesce(d.tipo_solicitud,'')) LIKE '%OXÍGENO%'
        THEN ARRAY['OXIGENO_DOMICILIARIO'] ELSE ARRAY[]::text[] END
      ||
      CASE WHEN upper(coalesce(d.requiere_ambulancia,'')) IN ('SI','SÍ','TRUE')
        THEN ARRAY['AMBULANCIA_EGRESO'] ELSE ARRAY[]::text[] END
    ) AS x
  ) s
)
WHERE d.tipos_solicitud IS NULL;

UPDATE public.domiciliarios
SET unidad_especial_solicitada = coalesce(unidad_especial, tipo_solicitud_detalle)
WHERE unidad_especial_solicitada IS NULL
  AND 'UNIDADES_ESPECIALES' = ANY(coalesce(tipos_solicitud,'{}'::text[]));

UPDATE public.domiciliarios
SET tipo_ambulancia_codigo = upper(replace(tipo_ambulancia,'-','_'))
WHERE tipo_ambulancia_codigo IS NULL AND tipo_ambulancia IS NOT NULL
  AND upper(replace(tipo_ambulancia,'-','_')) IN ('TAB','TAM','TAM_N');

-- 3) Gating de estados: superset (nuevos + históricos) ------------------------
CREATE OR REPLACE FUNCTION public.domi_estado_gating()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  permitidos text[] := ARRAY[
    'PENDIENTE ACEPTACION',
    'ACEPTADO CON PENDIENTE ENTREGA OXIGENO',
    'ACEPTADO CON PENDIENTE COORDINACION DE AMBULANCIA',
    'ACEPTADO CON AMBULANCIA COORDINADA',
    'AMBULANCIA EN SITIO // PTE EGRESO',
    'ACEPTADO CON PENDIENTE EGRESO',
    -- históricos conservados
    'ACEPTADO - PENDIENTE EGRESO',
    'ACEPTADO - PENDIENTE COORDINACION DE AMBULANCIA',
    'AMBULANCIA COORDINADA - PENDIENTE EGRESO',
    'ACEPTADO CON AMBULANCIA COORDINADA // PTE EGRESO',
    'CERRADO POR EGRESO',
    'CERRADO POR CANCELACION DEL PROVEEDOR',
    'CERRADO POR CANCELACION DE LA ESPECIALIDAD SOLICITANTE'
  ];
BEGIN
  IF NEW.estado_ciclo IS NULL THEN
    NEW.estado_ciclo := 'PENDIENTE ACEPTACION';
  END IF;
  IF NOT (NEW.estado_ciclo = ANY(permitidos)) THEN
    RAISE EXCEPTION 'Estado de ciclo no permitido: %', NEW.estado_ciclo;
  END IF;
  RETURN NEW;
END;
$$;

-- 4) Resolver canónico --------------------------------------------------------
CREATE OR REPLACE FUNCTION private.resolver_estado_phd(_caso_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  c public.domiciliarios%ROWTYPE;
  ciclo_ini timestamptz;
  tipos text[];
  requeridos text[] := ARRAY['PHD','PAD','PAD_CRONICO','UNIDADES_ESPECIALES','OXIGENO_DOMICILIARIO'];
  pendiente_aceptacion boolean := false;
  s text;
  ev_terminal text;
  hay_eventos boolean;
BEGIN
  SELECT * INTO c FROM public.domiciliarios WHERE id = _caso_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  ciclo_ini := coalesce(
    (SELECT max(created_at) FROM public.seguimientos sg
      WHERE sg.caso_id = _caso_id AND sg.tipo_caso = 'domiciliario'
        AND (sg.detalles->>'evento') = 'REACTIVACION'),
    c.ciclo_inicio_at, c.created_at, '-infinity'::timestamptz);

  tipos := coalesce(c.tipos_solicitud, '{}'::text[]);

  SELECT (sg.detalles->>'evento') INTO ev_terminal
  FROM public.seguimientos sg
  WHERE sg.caso_id = _caso_id AND sg.tipo_caso = 'domiciliario'
    AND sg.created_at >= ciclo_ini
    AND (sg.detalles->>'evento') IN ('CIERRE_POR_EGRESO','CANCELACION_PROVEEDOR','CANCELACION_ESPECIALIDAD')
  ORDER BY sg.created_at DESC LIMIT 1;

  IF ev_terminal = 'CIERRE_POR_EGRESO' THEN RETURN 'CERRADO POR EGRESO'; END IF;
  IF ev_terminal = 'CANCELACION_PROVEEDOR' THEN RETURN 'CERRADO POR CANCELACION DEL PROVEEDOR'; END IF;
  IF ev_terminal = 'CANCELACION_ESPECIALIDAD' THEN RETURN 'CERRADO POR CANCELACION DE LA ESPECIALIDAD SOLICITANTE'; END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.seguimientos sg
    WHERE sg.caso_id = _caso_id AND sg.tipo_caso = 'domiciliario'
      AND sg.created_at >= ciclo_ini
      AND (sg.detalles->>'evento') IN
        ('ACEPTACION_PROVEEDOR','CONFIRMACION_ENTREGA_OXIGENO','AMBULANCIA_COORDINADA','CONFIRMACION_LLEGADA_AMBULANCIA')
  ) INTO hay_eventos;

  IF NOT hay_eventos THEN RETURN 'PENDIENTE ACEPTACION'; END IF;

  FOREACH s IN ARRAY tipos LOOP
    IF s = ANY(requeridos) THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.seguimientos sg
        WHERE sg.caso_id = _caso_id AND sg.tipo_caso = 'domiciliario'
          AND sg.created_at >= ciclo_ini
          AND (sg.detalles->>'evento') = 'ACEPTACION_PROVEEDOR'
          AND (sg.detalles->>'servicio_codigo') = s
      ) THEN
        pendiente_aceptacion := true;
      END IF;
    END IF;
  END LOOP;

  IF pendiente_aceptacion THEN RETURN 'PENDIENTE ACEPTACION'; END IF;

  IF 'OXIGENO_DOMICILIARIO' = ANY(tipos) AND NOT EXISTS (
    SELECT 1 FROM public.seguimientos sg
    WHERE sg.caso_id = _caso_id AND sg.tipo_caso = 'domiciliario'
      AND sg.created_at >= ciclo_ini
      AND (sg.detalles->>'evento') = 'CONFIRMACION_ENTREGA_OXIGENO'
  ) THEN
    RETURN 'ACEPTADO CON PENDIENTE ENTREGA OXIGENO';
  END IF;

  IF 'AMBULANCIA_EGRESO' = ANY(tipos) THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.seguimientos sg
      WHERE sg.caso_id = _caso_id AND sg.tipo_caso = 'domiciliario'
        AND sg.created_at >= ciclo_ini
        AND (sg.detalles->>'evento') = 'AMBULANCIA_COORDINADA'
    ) THEN
      RETURN 'ACEPTADO CON PENDIENTE COORDINACION DE AMBULANCIA';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.seguimientos sg
      WHERE sg.caso_id = _caso_id AND sg.tipo_caso = 'domiciliario'
        AND sg.created_at >= ciclo_ini
        AND (sg.detalles->>'evento') = 'CONFIRMACION_LLEGADA_AMBULANCIA'
    ) THEN
      RETURN 'ACEPTADO CON AMBULANCIA COORDINADA';
    END IF;
    RETURN 'AMBULANCIA EN SITIO // PTE EGRESO';
  END IF;

  RETURN 'ACEPTADO CON PENDIENTE EGRESO';
END;
$$;

REVOKE ALL ON FUNCTION private.resolver_estado_phd(uuid) FROM PUBLIC, anon, authenticated;

-- 5) Trigger de aplicación (server-authoritative) -----------------------------
CREATE OR REPLACE FUNCTION private.seguimientos_phd_estado_apply()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  nuevo text;
BEGIN
  IF NEW.tipo_caso <> 'domiciliario' THEN RETURN NEW; END IF;
  nuevo := private.resolver_estado_phd(NEW.caso_id);
  IF nuevo IS NULL THEN RETURN NEW; END IF;
  UPDATE public.domiciliarios SET estado_ciclo = nuevo, updated_at = now()
  WHERE id = NEW.caso_id AND estado_ciclo IS DISTINCT FROM nuevo;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_seguimientos_phd_estado ON public.seguimientos;
CREATE TRIGGER trg_seguimientos_phd_estado
AFTER INSERT ON public.seguimientos
FOR EACH ROW EXECUTE FUNCTION private.seguimientos_phd_estado_apply();

-- 6) Operación transaccional de eventos --------------------------------------
CREATE OR REPLACE FUNCTION public.registrar_evento_phd(
  _actor uuid, _caso_id uuid, _payload jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  c public.domiciliarios%ROWTYPE;
  ev text := upper(coalesce(_payload->>'evento',''));
  servicio text := upper(coalesce(_payload->>'servicio_codigo',''));
  tipos text[];
  ciclo_ini timestamptz;
  requeridos text[] := ARRAY['PHD','PAD','PAD_CRONICO','UNIDADES_ESPECIALES','OXIGENO_DOMICILIARIO'];
  firma_id uuid;
  fila_firma public.entrega_firmas%ROWTYPE;
  coord_at timestamptz;
  nombre text;
  detalles jsonb;
  seg_id uuid;
  nuevo_estado text;
  pendiente boolean := false;
  s text;
BEGIN
  IF _actor IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'NO_AUTENTICADO'); END IF;

  SELECT * INTO c FROM public.domiciliarios WHERE id = _caso_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'CASO_NO_ENCONTRADO'); END IF;
  IF coalesce(c.archivado, false) OR c.estado_ciclo LIKE 'CERRADO%' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'CASO_CERRADO');
  END IF;

  tipos := coalesce(c.tipos_solicitud, '{}'::text[]);
  ciclo_ini := coalesce(
    (SELECT max(created_at) FROM public.seguimientos sg
      WHERE sg.caso_id = _caso_id AND sg.tipo_caso = 'domiciliario'
        AND (sg.detalles->>'evento') = 'REACTIVACION'),
    c.ciclo_inicio_at, c.created_at, '-infinity'::timestamptz);

  -- Pendientes del ciclo
  FOREACH s IN ARRAY tipos LOOP
    IF s = ANY(requeridos) AND NOT EXISTS (
      SELECT 1 FROM public.seguimientos sg
      WHERE sg.caso_id=_caso_id AND sg.tipo_caso='domiciliario' AND sg.created_at>=ciclo_ini
        AND (sg.detalles->>'evento')='ACEPTACION_PROVEEDOR' AND (sg.detalles->>'servicio_codigo')=s
    ) THEN pendiente := true; END IF;
  END LOOP;

  IF ev = 'ACEPTACION_PROVEEDOR' THEN
    IF NOT (servicio = ANY(requeridos)) OR NOT (servicio = ANY(tipos)) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'SERVICIO_NO_SOLICITADO');
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.seguimientos sg
      WHERE sg.caso_id=_caso_id AND sg.tipo_caso='domiciliario' AND sg.created_at>=ciclo_ini
        AND (sg.detalles->>'evento')='ACEPTACION_PROVEEDOR' AND (sg.detalles->>'servicio_codigo')=servicio
    ) THEN RETURN jsonb_build_object('ok', false, 'error', 'ACEPTACION_DUPLICADA'); END IF;

  ELSIF ev = 'CONFIRMACION_ENTREGA_OXIGENO' THEN
    IF NOT ('OXIGENO_DOMICILIARIO' = ANY(tipos)) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'OXIGENO_NO_SOLICITADO'); END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.seguimientos sg
      WHERE sg.caso_id=_caso_id AND sg.tipo_caso='domiciliario' AND sg.created_at>=ciclo_ini
        AND (sg.detalles->>'evento')='ACEPTACION_PROVEEDOR'
        AND (sg.detalles->>'servicio_codigo')='OXIGENO_DOMICILIARIO'
    ) THEN RETURN jsonb_build_object('ok', false, 'error', 'OXIGENO_SIN_ACEPTACION'); END IF;
    IF EXISTS (
      SELECT 1 FROM public.seguimientos sg
      WHERE sg.caso_id=_caso_id AND sg.tipo_caso='domiciliario' AND sg.created_at>=ciclo_ini
        AND (sg.detalles->>'evento')='CONFIRMACION_ENTREGA_OXIGENO'
    ) THEN RETURN jsonb_build_object('ok', false, 'error', 'ENTREGA_DUPLICADA'); END IF;

  ELSIF ev = 'AMBULANCIA_COORDINADA' THEN
    IF NOT ('AMBULANCIA_EGRESO' = ANY(tipos)) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'AMBULANCIA_NO_SOLICITADA'); END IF;
    IF pendiente THEN RETURN jsonb_build_object('ok', false, 'error', 'ACEPTACIONES_PENDIENTES'); END IF;
    IF 'OXIGENO_DOMICILIARIO' = ANY(tipos) AND NOT EXISTS (
      SELECT 1 FROM public.seguimientos sg
      WHERE sg.caso_id=_caso_id AND sg.tipo_caso='domiciliario' AND sg.created_at>=ciclo_ini
        AND (sg.detalles->>'evento')='CONFIRMACION_ENTREGA_OXIGENO'
    ) THEN RETURN jsonb_build_object('ok', false, 'error', 'OXIGENO_PENDIENTE'); END IF;
    IF EXISTS (
      SELECT 1 FROM public.seguimientos sg
      WHERE sg.caso_id=_caso_id AND sg.tipo_caso='domiciliario' AND sg.created_at>=ciclo_ini
        AND (sg.detalles->>'evento')='AMBULANCIA_COORDINADA'
    ) THEN RETURN jsonb_build_object('ok', false, 'error', 'COORDINACION_DUPLICADA'); END IF;

  ELSIF ev = 'CONFIRMACION_LLEGADA_AMBULANCIA' THEN
    IF NOT ('AMBULANCIA_EGRESO' = ANY(tipos)) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'AMBULANCIA_NO_SOLICITADA'); END IF;
    SELECT max(created_at) INTO coord_at FROM public.seguimientos sg
      WHERE sg.caso_id=_caso_id AND sg.tipo_caso='domiciliario' AND sg.created_at>=ciclo_ini
        AND (sg.detalles->>'evento')='AMBULANCIA_COORDINADA';
    IF coord_at IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'SIN_COORDINACION'); END IF;
    IF EXISTS (
      SELECT 1 FROM public.seguimientos sg
      WHERE sg.caso_id=_caso_id AND sg.tipo_caso='domiciliario' AND sg.created_at>=ciclo_ini
        AND (sg.detalles->>'evento')='CONFIRMACION_LLEGADA_AMBULANCIA'
    ) THEN RETURN jsonb_build_object('ok', false, 'error', 'LLEGADA_DUPLICADA'); END IF;
    BEGIN firma_id := (_payload->>'firma_id')::uuid; EXCEPTION WHEN others THEN firma_id := NULL; END;
    IF firma_id IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'FIRMA_REQUERIDA'); END IF;
    SELECT * INTO fila_firma FROM public.entrega_firmas WHERE id = firma_id FOR UPDATE;
    IF NOT FOUND OR fila_firma.caso_id <> _caso_id OR fila_firma.tipo_caso <> 'domiciliario'
       OR fila_firma.estado <> 'FIRMADA' OR fila_firma.firmado_at IS NULL
       OR fila_firma.firmado_at < coord_at OR fila_firma.firmado_at < ciclo_ini THEN
      RETURN jsonb_build_object('ok', false, 'error', 'FIRMA_INVALIDA');
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.seguimientos sg
      WHERE sg.tipo_caso='domiciliario' AND (sg.detalles->>'firma_id') = firma_id::text
    ) THEN RETURN jsonb_build_object('ok', false, 'error', 'FIRMA_YA_USADA'); END IF;

  ELSIF ev = 'CIERRE_POR_EGRESO' THEN
    IF pendiente THEN RETURN jsonb_build_object('ok', false, 'error', 'ACEPTACIONES_PENDIENTES'); END IF;
    IF 'OXIGENO_DOMICILIARIO' = ANY(tipos) AND NOT EXISTS (
      SELECT 1 FROM public.seguimientos sg
      WHERE sg.caso_id=_caso_id AND sg.tipo_caso='domiciliario' AND sg.created_at>=ciclo_ini
        AND (sg.detalles->>'evento')='CONFIRMACION_ENTREGA_OXIGENO'
    ) THEN RETURN jsonb_build_object('ok', false, 'error', 'OXIGENO_PENDIENTE'); END IF;
    IF 'AMBULANCIA_EGRESO' = ANY(tipos) AND NOT EXISTS (
      SELECT 1 FROM public.seguimientos sg
      WHERE sg.caso_id=_caso_id AND sg.tipo_caso='domiciliario' AND sg.created_at>=ciclo_ini
        AND (sg.detalles->>'evento')='CONFIRMACION_LLEGADA_AMBULANCIA'
    ) THEN RETURN jsonb_build_object('ok', false, 'error', 'LLEGADA_PENDIENTE'); END IF;

  ELSIF ev IN ('CANCELACION_PROVEEDOR','CANCELACION_ESPECIALIDAD','RADICACION',
               'EVOLUCION_NOVEDAD','SEGUIMIENTO_GENERAL','RESPUESTA_PROVEEDOR','NO_ACEPTACION_PROVEEDOR') THEN
    NULL;
  ELSE
    RETURN jsonb_build_object('ok', false, 'error', 'EVENTO_NO_PERMITIDO');
  END IF;

  SELECT p.nombre INTO nombre FROM public.profiles p WHERE p.user_id = _actor;

  detalles := jsonb_strip_nulls(jsonb_build_object(
    'evento', ev,
    'servicio_codigo', nullif(servicio,''),
    'proveedor', nullif(upper(coalesce(_payload->>'proveedor','')),''),
    'canal', nullif(upper(coalesce(_payload->>'canal','')),''),
    'motivo', nullif(upper(coalesce(_payload->>'motivo','')),''),
    'especialidad', nullif(upper(coalesce(_payload->>'especialidad','')),''),
    'responsable', nullif(upper(coalesce(_payload->>'responsable','')),''),
    'numero_radicado', nullif(_payload->>'numero_radicado',''),
    'empresa_ambulancia_label', nullif(upper(coalesce(_payload->>'empresa_ambulancia_label','')),''),
    'tipo_ambulancia_codigo', nullif(upper(coalesce(_payload->>'tipo_ambulancia_codigo','')),''),
    'fecha_coordinacion', nullif(_payload->>'fecha_coordinacion',''),
    'hora_coordinacion', nullif(_payload->>'hora_coordinacion',''),
    'fecha_evento', nullif(_payload->>'fecha_evento',''),
    'firma_id', CASE WHEN firma_id IS NULL THEN NULL ELSE firma_id::text END,
    'codigo_verificacion', CASE WHEN firma_id IS NULL THEN NULL ELSE fila_firma.codigo_verificacion END,
    'observaciones', nullif(_payload->>'observaciones',''),
    'ciclo_inicio', ciclo_ini::text,
    'estado_anterior', c.estado_ciclo
  ));

  INSERT INTO public.seguimientos (
    caso_id, tipo_caso, tipo_seguimiento, detalle, detalles,
    nombre_usuario, estado_solicitud, created_by, radicado
  ) VALUES (
    _caso_id, 'domiciliario', coalesce(nullif(_payload->>'tipo_seguimiento',''), ev),
    nullif(_payload->>'detalle',''), detalles,
    coalesce(nombre,'—'), c.estado_ciclo, _actor, nullif(_payload->>'numero_radicado','')
  ) RETURNING id INTO seg_id;

  IF ev = 'AMBULANCIA_COORDINADA' THEN
    UPDATE public.domiciliarios
      SET proveedor_ambulancia = nullif(upper(coalesce(_payload->>'empresa_ambulancia_label','')),''),
          fecha_coordinacion_ambulancia = now()
      WHERE id = _caso_id;
  END IF;

  SELECT estado_ciclo INTO nuevo_estado FROM public.domiciliarios WHERE id = _caso_id;

  INSERT INTO public.audit_logs (user_id, accion, modulo, tabla, registro_id, resultado, detalles)
  VALUES (_actor, 'PHD_EVENTO_' || ev, 'domiciliarios', 'seguimientos', seg_id, 'exito',
          jsonb_build_object('caso_id', _caso_id, 'servicio', nullif(servicio,''),
                             'estado_anterior', c.estado_ciclo, 'estado_nuevo', nuevo_estado));

  RETURN jsonb_build_object('ok', true, 'seguimiento_id', seg_id, 'estado_ciclo', nuevo_estado);
END;
$$;

REVOKE ALL ON FUNCTION public.registrar_evento_phd(uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_evento_phd(uuid, uuid, jsonb) TO service_role;

-- 7) Backfill de estados vigentes (idempotente) -------------------------------
UPDATE public.domiciliarios d
SET estado_ciclo = CASE d.estado_ciclo
      WHEN 'ACEPTADO - PENDIENTE EGRESO' THEN 'ACEPTADO CON PENDIENTE EGRESO'
      WHEN 'ACEPTADO - PENDIENTE COORDINACION DE AMBULANCIA' THEN 'ACEPTADO CON PENDIENTE COORDINACION DE AMBULANCIA'
      WHEN 'AMBULANCIA COORDINADA - PENDIENTE EGRESO' THEN 'ACEPTADO CON AMBULANCIA COORDINADA'
      WHEN 'ACEPTADO CON AMBULANCIA COORDINADA // PTE EGRESO' THEN 'ACEPTADO CON AMBULANCIA COORDINADA'
      ELSE d.estado_ciclo END
WHERE coalesce(d.archivado,false) = false
  AND d.estado_ciclo IN ('ACEPTADO - PENDIENTE EGRESO','ACEPTADO - PENDIENTE COORDINACION DE AMBULANCIA',
                         'AMBULANCIA COORDINADA - PENDIENTE EGRESO','ACEPTADO CON AMBULANCIA COORDINADA // PTE EGRESO');
