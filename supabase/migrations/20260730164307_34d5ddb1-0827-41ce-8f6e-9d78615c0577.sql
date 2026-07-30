-- 1) Guard de base de datos para INFORMACIÓN DEL TRÁMITE y CANAL DE GESTIÓN
CREATE OR REPLACE FUNCTION private.seguimientos_info_tramite_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  es_info boolean;
  canal text;
  canales text[] := ARRAY['TELEFÓNICO','CORREO ELECTRÓNICO','PLATAFORMA WEB','FÍSICO / PRESENCIAL','OTRO'];
BEGIN
  es_info := upper(coalesce(NEW.tipo_seguimiento,'')) IN ('INFORMACIÓN DEL TRÁMITE','INFORMACION DEL TRAMITE')
          OR upper(coalesce(NEW.detalles->>'evento','')) = 'INFORMACION_TRAMITE';

  IF NOT es_info THEN RETURN NEW; END IF;

  -- Exclusión total en PENDIENTES (cualquier capa, incluido payload manipulado).
  IF NEW.tipo_caso = 'pendiente' THEN
    RAISE EXCEPTION 'INFORMACION_TRAMITE_NO_PERMITIDA_EN_PENDIENTES';
  END IF;

  -- Canal de gestión obligatorio y validado.
  canal := upper(btrim(coalesce(NEW.detalles->>'canal_gestion', NEW.detalles->>'canal','')));
  IF canal = '' THEN RAISE EXCEPTION 'CANAL_GESTION_REQUERIDO'; END IF;
  IF NOT (canal = ANY(canales)) AND (length(canal) < 3 OR length(canal) > 80) THEN
    RAISE EXCEPTION 'CANAL_GESTION_NO_VALIDO';
  END IF;

  -- Solicitante obligatorio.
  IF length(btrim(coalesce(NEW.detalles->>'nombre_solicitante',''))) < 3
     OR length(btrim(coalesce(NEW.detalles->>'parentesco_solicitante',''))) < 3 THEN
    RAISE EXCEPTION 'SOLICITANTE_REQUERIDO';
  END IF;

  -- Campos retirados: no se aceptan en registros nuevos (históricos intactos).
  IF NEW.detalles ?| ARRAY['telefono_contacto','informacion','telefono_solicitante','informacion_brindada'] THEN
    RAISE EXCEPTION 'CAMPO_NO_AUTORIZADO';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_seguimientos_info_tramite_guard ON public.seguimientos;
CREATE TRIGGER trg_seguimientos_info_tramite_guard
BEFORE INSERT OR UPDATE ON public.seguimientos
FOR EACH ROW EXECUTE FUNCTION private.seguimientos_info_tramite_guard();

-- 2) registrar_evento_phd: nuevo evento INFORMACION_TRAMITE + canal validado
CREATE OR REPLACE FUNCTION public.registrar_evento_phd(_actor uuid, _caso_id uuid, _payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  descripcion text := btrim(coalesce(_payload->>'descripcion',''));
  s text;
  canal_ev text := upper(btrim(coalesce(_payload->>'canal','')));
  canales text[] := ARRAY['TELEFÓNICO','CORREO ELECTRÓNICO','PLATAFORMA WEB','FÍSICO / PRESENCIAL','OTRO'];
  nom_sol text := btrim(coalesce(_payload->>'nombre_solicitante',''));
  par_sol text := btrim(coalesce(_payload->>'parentesco_solicitante',''));
BEGIN
  IF _actor IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'NO_AUTENTICADO'); END IF;

  SELECT * INTO c FROM public.domiciliarios WHERE id = _caso_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'CASO_NO_ENCONTRADO'); END IF;
  IF coalesce(c.archivado, false) OR c.estado_ciclo LIKE 'CERRADO%' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'CASO_CERRADO');
  END IF;

  -- Canal de gestión obligatorio para todo evento manual.
  IF canal_ev = '' THEN RETURN jsonb_build_object('ok', false, 'error', 'CANAL_REQUERIDO'); END IF;
  IF NOT (canal_ev = ANY(canales)) AND (length(canal_ev) < 3 OR length(canal_ev) > 80) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'CANAL_NO_VALIDO');
  END IF;

  tipos := coalesce(c.tipos_solicitud, '{}'::text[]);
  ciclo_ini := coalesce(
    (SELECT max(created_at) FROM public.seguimientos sg
      WHERE sg.caso_id = _caso_id AND sg.tipo_caso = 'domiciliario'
        AND (sg.detalles->>'evento') = 'REACTIVACION'),
    c.ciclo_inicio_at, c.created_at, '-infinity'::timestamptz);

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

  ELSIF ev = 'RADICACION' THEN
    IF NOT private.phd_eapb_exige_radicacion(_caso_id) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'RADICACION_NO_REQUERIDA');
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.seguimientos sg
      WHERE sg.caso_id=_caso_id AND sg.tipo_caso='domiciliario' AND sg.created_at>=ciclo_ini
        AND (sg.detalles->>'evento')='RADICACION'
    ) THEN RETURN jsonb_build_object('ok', false, 'error', 'RADICACION_DUPLICADA'); END IF;

  ELSIF ev IN ('EVOLUCION_DIARIA','NOVEDADES','OTRO') THEN
    IF ev IN ('NOVEDADES','OTRO') AND length(descripcion) < 3 THEN
      RETURN jsonb_build_object('ok', false, 'error', 'DESCRIPCION_REQUERIDA');
    END IF;
    IF ev = 'EVOLUCION_DIARIA' AND length(descripcion) < 3 THEN
      RETURN jsonb_build_object('ok', false, 'error', 'DESCRIPCION_REQUERIDA');
    END IF;

  ELSIF ev = 'INFORMACION_TRAMITE' THEN
    -- Evento informativo: NO altera requisitos, secuencia ni estado_ciclo.
    IF length(nom_sol) < 3 OR length(par_sol) < 3 THEN
      RETURN jsonb_build_object('ok', false, 'error', 'SOLICITANTE_REQUERIDO');
    END IF;

  ELSIF ev = 'CANCELACION_TRAMITE' THEN
    IF EXISTS (
      SELECT 1 FROM public.seguimientos sg
      WHERE sg.caso_id=_caso_id AND sg.tipo_caso='domiciliario' AND sg.created_at>=ciclo_ini
        AND (sg.detalles->>'evento')='CANCELACION_TRAMITE'
    ) THEN RETURN jsonb_build_object('ok', false, 'error', 'CANCELACION_DUPLICADA'); END IF;

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

  ELSE
    RETURN jsonb_build_object('ok', false, 'error', 'EVENTO_NO_PERMITIDO');
  END IF;

  SELECT p.nombre INTO nombre FROM public.profiles p WHERE p.user_id = _actor;

  detalles := jsonb_strip_nulls(jsonb_build_object(
    'evento', ev,
    'servicio_codigo', nullif(servicio,''),
    'descripcion', nullif(descripcion,''),
    'proveedor', nullif(upper(coalesce(_payload->>'proveedor','')),''),
    'canal', nullif(canal_ev,''),
    'canal_gestion', nullif(canal_ev,''),
    'motivo', nullif(upper(coalesce(_payload->>'motivo','')),''),
    'especialidad', nullif(upper(coalesce(_payload->>'especialidad','')),''),
    -- El responsable SIEMPRE es el actor autenticado; nunca el enviado por el cliente.
    'responsable', coalesce(nombre,'—'),
    'nombre_solicitante', CASE WHEN ev='INFORMACION_TRAMITE' THEN upper(nullif(nom_sol,'')) END,
    'parentesco_solicitante', CASE WHEN ev='INFORMACION_TRAMITE' THEN upper(nullif(par_sol,'')) END,
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
$function$;

REVOKE ALL ON FUNCTION public.registrar_evento_phd(uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;