
-- ===========================================================================
-- FASE 5K · BLOQUE C — Novedades canónicas (unidad, motivo, modalidad)
-- ===========================================================================

-- 1) RI: el cambio de unidad pasa a registrarse como NOVEDADES/CAMBIO_UNIDAD.
CREATE OR REPLACE FUNCTION private.novedad_es_cambio_unidad(_tipo text, _d jsonb)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path TO '' AS $$
  SELECT upper(coalesce(_tipo,'')) = 'NOVEDADES'
     AND coalesce(_d->>'novedad_tipo','') = 'CAMBIO_UNIDAD'
$$;

CREATE OR REPLACE FUNCTION private.seguimientos_ri_novedades_validate()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE
  tipo text := upper(coalesce(NEW.tipo_seguimiento, ''));
  d jsonb := NEW.detalles;
  cats jsonb; motivos jsonb; arr_len int;
  interna_cod text; externa_cod text; pacfam text; ri_evento text; cual text; fh text; sin_fh boolean;
BEGIN
  IF NEW.tipo_caso IS DISTINCT FROM 'referencia_interna' THEN RETURN NEW; END IF;
  IF tipo NOT IN ('OTRO', 'NOVEDADES') THEN RETURN NEW; END IF;
  -- Bloque C: la novedad estructurada de cambio de unidad tiene su propia
  -- validación server-side (RPC atómica) y no usa categorías INTERNA/EXTERNA.
  IF private.novedad_es_cambio_unidad(NEW.tipo_seguimiento, d) THEN RETURN NEW; END IF;
  IF d IS NULL OR jsonb_typeof(d) <> 'object' THEN
    RAISE EXCEPTION 'Detalles requeridos para % en Referencia Interna', tipo USING ERRCODE='check_violation';
  END IF;

  IF tipo = 'OTRO' THEN
    ri_evento := d->>'ri_evento';
    IF ri_evento IS DISTINCT FROM 'OTRO' THEN
      RAISE EXCEPTION 'ri_evento invalido para OTRO' USING ERRCODE='check_violation'; END IF;
    cual := btrim(coalesce(d->>'cual', ''));
    IF length(cual) < 3 OR length(cual) > 200 THEN
      RAISE EXCEPTION 'Campo CUAL debe tener entre 3 y 200 caracteres' USING ERRCODE='check_violation'; END IF;
    IF length(coalesce(d->>'observaciones','')) > 1000 THEN
      RAISE EXCEPTION 'Observaciones exceden 1000 caracteres' USING ERRCODE='check_violation'; END IF;
    RETURN NEW;
  END IF;

  ri_evento := d->>'ri_evento';
  IF ri_evento IS DISTINCT FROM 'NOVEDADES' THEN
    RAISE EXCEPTION 'ri_evento invalido para NOVEDADES' USING ERRCODE='check_violation'; END IF;
  cats := d->'categorias';
  IF cats IS NULL OR jsonb_typeof(cats) <> 'array' THEN
    RAISE EXCEPTION 'categorias debe ser un arreglo' USING ERRCODE='check_violation'; END IF;
  arr_len := jsonb_array_length(cats);
  IF arr_len < 1 OR arr_len > 2 THEN
    RAISE EXCEPTION 'Debe seleccionar al menos INTERNA o EXTERNA' USING ERRCODE='check_violation'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements_text(cats) v WHERE v NOT IN ('INTERNA','EXTERNA')) THEN
    RAISE EXCEPTION 'categoria no permitida' USING ERRCODE='check_violation'; END IF;

  interna_cod := d->>'interna_codigo';
  externa_cod := d->>'externa_codigo';
  pacfam := d->>'paciente_familiar_motivo';

  IF cats ? 'INTERNA' THEN
    IF interna_cod IS NULL OR interna_cod NOT IN ('EQUIPO_FALLA','REPROGRAMACION','NO_DISPONIBILIDAD_TECNICO') THEN
      RAISE EXCEPTION 'interna_codigo no permitido' USING ERRCODE='check_violation'; END IF;
    IF interna_cod = 'REPROGRAMACION' THEN
      motivos := d->'reprogramacion_motivos';
      IF motivos IS NULL OR jsonb_typeof(motivos) <> 'array' OR jsonb_array_length(motivos) < 1 THEN
        RAISE EXCEPTION 'reprogramacion_motivos requerido' USING ERRCODE='check_violation'; END IF;
      IF EXISTS (SELECT 1 FROM jsonb_array_elements_text(motivos) v
                  WHERE v NOT IN ('RETRASO_AGENDA','IMPOSIBILIDAD_TOMA_EXAMEN_PREVIO')) THEN
        RAISE EXCEPTION 'motivo de reprogramacion no permitido' USING ERRCODE='check_violation'; END IF;
      sin_fh := coalesce((d->>'sin_nueva_fecha_hora')::boolean, false);
      fh := nullif(btrim(coalesce(d->>'fecha_hora_reprogramada','')), '');
      IF sin_fh AND fh IS NOT NULL THEN
        RAISE EXCEPTION 'sin_nueva_fecha_hora no admite fecha_hora_reprogramada' USING ERRCODE='check_violation'; END IF;
      IF NOT sin_fh AND fh IS NULL THEN
        RAISE EXCEPTION 'Debe indicar la nueva fecha/hora o marcar sin_nueva_fecha_hora' USING ERRCODE='check_violation'; END IF;
      IF fh IS NOT NULL THEN
        BEGIN PERFORM fh::timestamptz; EXCEPTION WHEN others THEN
          RAISE EXCEPTION 'fecha_hora_reprogramada invalida' USING ERRCODE='check_violation'; END;
      END IF;
    END IF;
  ELSE
    IF interna_cod IS NOT NULL THEN
      RAISE EXCEPTION 'interna_codigo presente sin categoria INTERNA' USING ERRCODE='check_violation'; END IF;
  END IF;

  IF cats ? 'EXTERNA' THEN
    IF externa_cod IS NULL OR externa_cod NOT IN
      ('AMBULANCIA_SIN_DISPONIBILIDAD','RED_NO_CONTRATADA','DESCOMPENSACION_HEMODINAMICA') THEN
      RAISE EXCEPTION 'externa_codigo no permitido (No aceptacion debe registrarse como CANCELACION DEL TRAMITE)'
        USING ERRCODE='check_violation'; END IF;
    IF pacfam IS NOT NULL THEN
      RAISE EXCEPTION 'paciente_familiar_motivo no aplica a novedades externas' USING ERRCODE='check_violation'; END IF;
  ELSE
    IF externa_cod IS NOT NULL THEN
      RAISE EXCEPTION 'externa_codigo presente sin categoria EXTERNA' USING ERRCODE='check_violation'; END IF;
  END IF;

  IF length(coalesce(d->>'observaciones','')) > 1000 THEN
    RAISE EXCEPTION 'Observaciones exceden 1000 caracteres' USING ERRCODE='check_violation'; END IF;
  RETURN NEW;
END;
$function$;

-- El cambio de unidad NO altera el estado del ciclo de RI.
CREATE OR REPLACE FUNCTION private.seguimientos_ri_estado_apply()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE
  ts text := upper(coalesce(NEW.tipo_seguimiento, ''));
  d jsonb := NEW.detalles;
  nuevo_estado text := NULL; arch boolean := NULL;
  externa_cod text; interna_cod text; sin_fh boolean;
BEGIN
  IF NEW.tipo_caso IS DISTINCT FROM 'referencia_interna' THEN RETURN NEW; END IF;
  IF ts IN ('CAMBIO DE UNIDAD', 'OTRO') THEN RETURN NEW; END IF;
  IF private.novedad_es_cambio_unidad(NEW.tipo_seguimiento, d) THEN RETURN NEW; END IF;

  IF ts IN ('CANCELACIÓN DEL TRÁMITE','CANCELACION DEL TRAMITE') THEN
    nuevo_estado := 'CANCELADO'; arch := true;
  ELSIF ts IN ('CIERRE POR CULMINACIÓN DE SOLICITUD','CIERRE POR CULMINACION DE SOLICITUD') THEN
    nuevo_estado := 'CERRADO POR CULMINACION DE SOLICITUD'; arch := true;
  ELSIF ts IN ('TRÁMITE COORDINADO','TRAMITE COORDINADO','EXAMEN COORDINADO')
        OR ts LIKE 'PENDIENTE COORDINAC%EXAMEN' THEN
    nuevo_estado := 'TRAMITE COORDINADO SIN CONFIRMACION AMBULANCIA';
  ELSIF ts IN ('CONFIRMACIÓN DE PROGRAMACIÓN DE AMBULANCIA','CONFIRMACION DE PROGRAMACION DE AMBULANCIA',
               'AMBULANCIA COORDINADA','ACTIVACIÓN DE PROVEEDOR CONTRATADO DE TEP',
               'ACTIVACION DE PROVEEDOR CONTRATADO DE TEP') THEN
    nuevo_estado := 'AMBULANCIA PROGRAMADA';
  ELSIF ts IN ('CONFIRMACIÓN DE LLEGADA DE AMBULANCIA','CONFIRMACION DE LLEGADA DE AMBULANCIA') THEN
    nuevo_estado := 'AMBULANCIA EN SITIO PTE CONFIRMACION REINGRESO';
  ELSIF ts = 'NOVEDADES' AND d IS NOT NULL THEN
    externa_cod := d->>'externa_codigo'; interna_cod := d->>'interna_codigo';
    sin_fh := coalesce((d->>'sin_nueva_fecha_hora')::boolean, false);
    IF externa_cod = 'DESCOMPENSACION_HEMODINAMICA' THEN nuevo_estado := 'PENDIENTE COORDINACION';
    ELSIF externa_cod = 'AMBULANCIA_SIN_DISPONIBILIDAD' THEN nuevo_estado := 'TRAMITE COORDINADO SIN CONFIRMACION AMBULANCIA';
    ELSIF interna_cod = 'REPROGRAMACION' THEN
      nuevo_estado := CASE WHEN sin_fh THEN 'PENDIENTE COORDINACION' ELSE 'TRAMITE COORDINADO SIN CONFIRMACION AMBULANCIA' END;
    ELSE RETURN NEW; END IF;
  ELSE RETURN NEW; END IF;

  IF nuevo_estado IS NULL THEN RETURN NEW; END IF;
  UPDATE public.referencia_interna
     SET estado = nuevo_estado, archivado = COALESCE(arch, archivado), updated_at = now()
   WHERE id = NEW.caso_id AND coalesce(archivado, false) = false;
  RETURN NEW;
END;
$function$;

-- RPC de RI: mismo flujo, ahora persistido como NOVEDADES/CAMBIO_UNIDAD.
CREATE OR REPLACE FUNCTION public.registrar_cambio_unidad_ri(
  _caso_id uuid, _nueva_unidad_codigo text, _nueva_cama text,
  _observaciones text DEFAULT NULL, _plantilla_indigo text DEFAULT NULL, _actor_uid uuid DEFAULT NULL)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE
  v_uid uuid := COALESCE(_actor_uid, auth.uid());
  v_nombre text; v_email text; v_servicio_actual text; v_archivado boolean; v_estado text;
  v_cama_actual text; v_nueva_label text; v_cama_norm text; v_obs text; v_plantilla text; v_seg_id uuid;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'No autenticado'); END IF;
  IF NOT private.is_active_member(v_uid) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Usuario no autorizado'); END IF;
  IF _nueva_unidad_codigo IS NULL OR _nueva_unidad_codigo NOT IN
     ('UCI_ADULTOS','URGENCIAS','HOSPITALIZACION','QUIROFANO') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Unidad no permitida'); END IF;

  v_cama_norm := upper(btrim(regexp_replace(coalesce(_nueva_cama, ''), '\s+', ' ', 'g')));
  IF v_cama_norm = '' THEN RETURN jsonb_build_object('ok', false, 'error', 'La nueva cama es obligatoria'); END IF;
  IF length(v_cama_norm) > 30 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'La nueva cama supera la longitud permitida'); END IF;

  v_nueva_label := CASE _nueva_unidad_codigo
    WHEN 'UCI_ADULTOS' THEN 'UCI ADULTOS' WHEN 'URGENCIAS' THEN 'URGENCIAS'
    WHEN 'HOSPITALIZACION' THEN 'HOSPITALIZACIÓN' WHEN 'QUIROFANO' THEN 'QUIRÓFANO' END;

  v_obs := nullif(btrim(coalesce(_observaciones, '')), '');
  IF v_obs IS NOT NULL AND length(v_obs) > 1000 THEN v_obs := left(v_obs, 1000); END IF;
  v_plantilla := nullif(btrim(coalesce(_plantilla_indigo, '')), '');

  SELECT servicio, archivado, estado INTO v_servicio_actual, v_archivado, v_estado
    FROM public.referencia_interna WHERE id = _caso_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'Caso no encontrado'); END IF;
  IF coalesce(v_archivado, false) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'El caso está cerrado y no admite cambios'); END IF;

  SELECT upper(btrim(coalesce((s.detalles->>'nueva_cama'), (s.detalles->>'cama_nueva'))))
    INTO v_cama_actual
    FROM public.seguimientos s
   WHERE s.caso_id = _caso_id AND s.tipo_caso = 'referencia_interna'
     AND (upper(coalesce(s.tipo_seguimiento,'')) = 'CAMBIO DE UNIDAD'
          OR private.novedad_es_cambio_unidad(s.tipo_seguimiento, s.detalles))
   ORDER BY s.created_at DESC LIMIT 1;
  v_cama_actual := coalesce(v_cama_actual, '');

  IF upper(coalesce(v_servicio_actual, '')) = upper(v_nueva_label) AND v_cama_actual = v_cama_norm THEN
    RETURN jsonb_build_object('ok', false, 'error', 'La nueva ubicación debe ser diferente de la ubicación actual'); END IF;

  SELECT p.nombre INTO v_nombre FROM public.profiles p WHERE p.user_id = v_uid;
  SELECT email INTO v_email FROM auth.users WHERE id = v_uid;

  INSERT INTO public.seguimientos (
    caso_id, tipo_caso, tipo_seguimiento, estado_solicitud, detalle,
    plantilla_indigo, detalles, nombre_usuario, created_by
  ) VALUES (
    _caso_id, 'referencia_interna', 'NOVEDADES', NULL, v_obs, v_plantilla,
    jsonb_build_object(
      'novedad_tipo',          'CAMBIO_UNIDAD',
      'ri_evento',             'CAMBIO_UNIDAD',
      'unidad_anterior',       v_servicio_actual,
      'unidad_anterior_label', v_servicio_actual,
      'cama_anterior',         nullif(v_cama_actual, ''),
      'nueva_unidad_codigo',   _nueva_unidad_codigo,
      'nueva_unidad_label',    v_nueva_label,
      'nueva_unidad',          v_nueva_label,
      'unidad_nueva',          v_nueva_label,
      'nueva_cama',            v_cama_norm,
      'cama_nueva',            v_cama_norm,
      'observaciones',         v_obs
    ),
    coalesce(v_nombre, v_email), v_uid
  ) RETURNING id INTO v_seg_id;

  UPDATE public.referencia_interna SET servicio = v_nueva_label, updated_at = now() WHERE id = _caso_id;

  PERFORM public.registrar_auditoria_srv(v_uid, 'CAMBIO_UNIDAD_RI', 'referencia_interna',
    'referencia_interna', _caso_id::text, 'exito',
    jsonb_build_object('caso_id', _caso_id, 'unidad_anterior', v_servicio_actual,
      'cama_anterior', nullif(v_cama_actual,''), 'nueva_unidad_codigo', _nueva_unidad_codigo,
      'nueva_unidad_label', v_nueva_label, 'nueva_cama', v_cama_norm, 'seguimiento_id', v_seg_id));

  RETURN jsonb_build_object('ok', true, 'seguimiento_id', v_seg_id,
    'nueva_unidad', v_nueva_label, 'nueva_cama', v_cama_norm);
END;
$function$;

-- 2) NOVEDAD · CAMBIO DE UNIDAD (remisiones y atención domiciliaria).
CREATE OR REPLACE FUNCTION private.novedad_cambio_unidad(
  _actor uuid, _tipo_caso text, _caso_id uuid, _nuevo_servicio text, _nueva_cama text,
  _observaciones text, _plantilla text, _canales jsonb)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE
  v_tabla text; v_serv_act text; v_cama_act text; v_arch boolean;
  v_serv text; v_cama text; v_obs text; v_nombre text; v_seg_id uuid; v_det jsonb;
BEGIN
  IF _actor IS NULL OR NOT private.is_active_member(_actor) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Usuario no autorizado'); END IF;
  IF _tipo_caso NOT IN ('remision','domiciliario') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Módulo no permitido'); END IF;

  v_serv := upper(btrim(regexp_replace(coalesce(_nuevo_servicio,''), '\s+', ' ', 'g')));
  v_cama := upper(btrim(regexp_replace(coalesce(_nueva_cama,''), '\s+', ' ', 'g')));
  IF v_serv = '' THEN RETURN jsonb_build_object('ok', false, 'error', 'Seleccione la nueva unidad'); END IF;
  IF v_cama = '' OR length(v_cama) > 30 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Nueva cama inválida'); END IF;
  IF NOT EXISTS (SELECT 1 FROM public.catalogos c
                  WHERE c.tipo = 'UNIDAD' AND c.activo = true
                    AND upper(btrim(c.valor)) = v_serv) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Unidad no permitida'); END IF;

  IF _tipo_caso = 'remision' THEN
    SELECT upper(btrim(coalesce(servicio,''))), upper(btrim(coalesce(cama,''))), coalesce(archivado,false)
      INTO v_serv_act, v_cama_act, v_arch FROM public.remisiones WHERE id = _caso_id FOR UPDATE;
  ELSE
    SELECT upper(btrim(coalesce(servicio,''))), upper(btrim(coalesce(cama,''))), coalesce(archivado,false)
      INTO v_serv_act, v_cama_act, v_arch FROM public.domiciliarios WHERE id = _caso_id FOR UPDATE;
  END IF;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'Caso no encontrado'); END IF;
  IF v_arch THEN RETURN jsonb_build_object('ok', false, 'error', 'El caso está cerrado'); END IF;
  IF v_serv_act = v_serv AND v_cama_act = v_cama THEN
    RETURN jsonb_build_object('ok', false, 'error', 'La nueva ubicación debe ser diferente de la actual'); END IF;

  v_obs := nullif(left(btrim(coalesce(_observaciones,'')), 1000), '');
  SELECT p.nombre INTO v_nombre FROM public.profiles p WHERE p.user_id = _actor;

  v_det := jsonb_strip_nulls(jsonb_build_object(
    'novedad_tipo',    'CAMBIO_UNIDAD',
    'unidad_anterior', nullif(v_serv_act,''),
    'cama_anterior',   nullif(v_cama_act,''),
    'nueva_unidad',    v_serv,
    'nueva_cama',      v_cama,
    'observaciones',   v_obs
  ));
  IF _canales IS NOT NULL AND jsonb_typeof(_canales) = 'array' AND jsonb_array_length(_canales) > 0 THEN
    v_det := v_det || jsonb_build_object('canales_gestion', _canales,
                                         'canal_gestion', _canales->>0);
  END IF;

  INSERT INTO public.seguimientos (caso_id, tipo_caso, tipo_seguimiento, detalle,
    plantilla_indigo, detalles, nombre_usuario, created_by)
  VALUES (_caso_id, _tipo_caso, 'NOVEDADES', v_obs,
    nullif(btrim(coalesce(_plantilla,'')),''), v_det, v_nombre, _actor)
  RETURNING id INTO v_seg_id;

  IF _tipo_caso = 'remision' THEN
    UPDATE public.remisiones SET servicio = v_serv, cama = v_cama, updated_at = now() WHERE id = _caso_id;
  ELSE
    UPDATE public.domiciliarios SET servicio = v_serv, cama = v_cama, updated_at = now() WHERE id = _caso_id;
  END IF;

  PERFORM public.registrar_auditoria_srv(_actor, 'NOVEDAD_CAMBIO_UNIDAD',
    CASE WHEN _tipo_caso = 'remision' THEN 'salientes' ELSE 'domiciliarios' END,
    CASE WHEN _tipo_caso = 'remision' THEN 'remisiones' ELSE 'domiciliarios' END,
    _caso_id::text, 'exito', v_det);

  RETURN jsonb_build_object('ok', true, 'seguimiento_id', v_seg_id,
    'unidad_anterior', v_serv_act, 'cama_anterior', v_cama_act,
    'nueva_unidad', v_serv, 'nueva_cama', v_cama);
END;
$function$;

CREATE OR REPLACE FUNCTION public.novedad_cambio_unidad(
  _actor uuid, _tipo_caso text, _caso_id uuid, _nuevo_servicio text, _nueva_cama text,
  _observaciones text DEFAULT NULL, _plantilla text DEFAULT NULL, _canales jsonb DEFAULT NULL)
 RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path TO '' AS $$
  SELECT private.novedad_cambio_unidad(_actor, _tipo_caso, _caso_id, _nuevo_servicio,
                                       _nueva_cama, _observaciones, _plantilla, _canales);
$$;
REVOKE ALL ON FUNCTION public.novedad_cambio_unidad(uuid,text,uuid,text,text,text,text,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.novedad_cambio_unidad(uuid,text,uuid,text,text,text,text,jsonb) TO service_role;

-- 3) NOVEDAD · CAMBIO MOTIVO DE REMISIÓN
CREATE OR REPLACE FUNCTION private.motivos_remision_allow()
RETURNS text[] LANGUAGE sql IMMUTABLE SET search_path TO '' AS $$
  SELECT ARRAY['RED NO CONTRATADA','NO RECURSO HUMANO','NO DISPONIBILIDAD DE INSUMO O TECNOLOGIA',
               'NO DISPONIBILIDAD DE UNIDAD','NO DISPONIBILIDAD DE CAMAS','NIVEL DE COMPETENCIA',
               'PETICION VOLUNTARIA','EN TRAMITE']
$$;

CREATE OR REPLACE FUNCTION private.novedad_cambio_motivo_remision(
  _actor uuid, _caso_id uuid, _nuevo_motivo text, _justificacion text,
  _observaciones text, _plantilla text, _canales jsonb)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE
  v_actual text; v_arch boolean; v_nuevo text; v_just text; v_obs text;
  v_nombre text; v_seg_id uuid; v_det jsonb;
BEGIN
  IF _actor IS NULL OR NOT private.is_active_member(_actor) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Usuario no autorizado'); END IF;

  v_nuevo := upper(btrim(regexp_replace(coalesce(_nuevo_motivo,''), '\s+', ' ', 'g')));
  IF NOT (v_nuevo = ANY(private.motivos_remision_allow())) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Motivo de remisión no permitido'); END IF;
  v_just := nullif(left(btrim(coalesce(_justificacion,'')), 1000), '');
  IF v_just IS NULL OR length(v_just) < 3 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'La justificación es obligatoria'); END IF;

  SELECT upper(btrim(coalesce(remision_por,''))), coalesce(archivado,false)
    INTO v_actual, v_arch FROM public.remisiones WHERE id = _caso_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'Caso no encontrado'); END IF;
  IF v_arch THEN RETURN jsonb_build_object('ok', false, 'error', 'El caso está cerrado'); END IF;
  IF v_actual = v_nuevo THEN
    RETURN jsonb_build_object('ok', false, 'error', 'El nuevo motivo debe ser diferente del actual'); END IF;

  v_obs := nullif(left(btrim(coalesce(_observaciones,'')), 1000), '');
  SELECT p.nombre INTO v_nombre FROM public.profiles p WHERE p.user_id = _actor;

  v_det := jsonb_strip_nulls(jsonb_build_object(
    'novedad_tipo',   'CAMBIO_MOTIVO_REMISION',
    'motivo_anterior', nullif(v_actual,''),
    'motivo_nuevo',    v_nuevo,
    'justificacion',   v_just,
    'observaciones',   v_obs));
  IF _canales IS NOT NULL AND jsonb_typeof(_canales) = 'array' AND jsonb_array_length(_canales) > 0 THEN
    v_det := v_det || jsonb_build_object('canales_gestion', _canales, 'canal_gestion', _canales->>0);
  END IF;

  INSERT INTO public.seguimientos (caso_id, tipo_caso, tipo_seguimiento, detalle,
    plantilla_indigo, detalles, nombre_usuario, created_by)
  VALUES (_caso_id, 'remision', 'NOVEDADES', coalesce(v_obs, v_just),
    nullif(btrim(coalesce(_plantilla,'')),''), v_det, v_nombre, _actor)
  RETURNING id INTO v_seg_id;

  UPDATE public.remisiones SET remision_por = v_nuevo, updated_at = now() WHERE id = _caso_id;

  PERFORM public.registrar_auditoria_srv(_actor, 'NOVEDAD_CAMBIO_MOTIVO_REMISION', 'salientes',
    'remisiones', _caso_id::text, 'exito', v_det);

  RETURN jsonb_build_object('ok', true, 'seguimiento_id', v_seg_id,
    'motivo_anterior', v_actual, 'motivo_nuevo', v_nuevo);
END;
$function$;

CREATE OR REPLACE FUNCTION public.novedad_cambio_motivo_remision(
  _actor uuid, _caso_id uuid, _nuevo_motivo text, _justificacion text,
  _observaciones text DEFAULT NULL, _plantilla text DEFAULT NULL, _canales jsonb DEFAULT NULL)
 RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path TO '' AS $$
  SELECT private.novedad_cambio_motivo_remision(_actor, _caso_id, _nuevo_motivo, _justificacion,
                                                _observaciones, _plantilla, _canales);
$$;
REVOKE ALL ON FUNCTION public.novedad_cambio_motivo_remision(uuid,uuid,text,text,text,text,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.novedad_cambio_motivo_remision(uuid,uuid,text,text,text,text,jsonb) TO service_role;

-- 4) NOVEDAD · GESTIÓN DE MODALIDAD (atención domiciliaria)
CREATE OR REPLACE FUNCTION private.novedad_gestion_modalidad(
  _actor uuid, _caso_id uuid, _gestion text, _origen text, _nueva text,
  _justificacion text, _observaciones text, _plantilla text, _canales jsonb)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE
  allow text[] := ARRAY['PHD','PAD','PAD_CRONICO','UNIDADES_ESPECIALES','OXIGENO_DOMICILIARIO','AMBULANCIA_EGRESO'];
  v_tipos text[]; v_arch boolean; v_estado text; v_nuevos text[];
  v_just text; v_obs text; v_nombre text; v_seg_id uuid; v_det jsonb; v_ciclo timestamptz;
BEGIN
  IF _actor IS NULL OR NOT private.is_active_member(_actor) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Usuario no autorizado'); END IF;
  IF _gestion NOT IN ('AGREGAR_MODALIDAD','CAMBIAR_MODALIDAD') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Tipo de gestión no permitido'); END IF;
  IF NOT (coalesce(_nueva,'') = ANY(allow)) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Modalidad no permitida'); END IF;

  v_just := nullif(left(btrim(coalesce(_justificacion,'')), 1000), '');
  IF v_just IS NULL OR length(v_just) < 3 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'La justificación es obligatoria'); END IF;

  SELECT coalesce(tipos_solicitud,'{}'::text[]), coalesce(archivado,false), estado_ciclo,
         coalesce(ciclo_inicio_at, created_at)
    INTO v_tipos, v_arch, v_estado, v_ciclo
    FROM public.domiciliarios WHERE id = _caso_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'Caso no encontrado'); END IF;
  IF v_arch OR coalesce(v_estado,'') LIKE 'CERRADO%' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'El caso está cerrado'); END IF;
  IF _nueva = ANY(v_tipos) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'La modalidad ya está activa en el caso'); END IF;

  IF _gestion = 'AGREGAR_MODALIDAD' THEN
    IF array_length(v_tipos,1) >= 4 THEN
      RETURN jsonb_build_object('ok', false, 'error', 'El caso alcanzó el máximo de modalidades'); END IF;
    v_nuevos := v_tipos || _nueva;
  ELSE
    IF NOT (coalesce(_origen,'') = ANY(allow)) OR NOT (_origen = ANY(v_tipos)) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'La modalidad a reemplazar no está activa en el caso'); END IF;
    IF _origen = _nueva THEN
      RETURN jsonb_build_object('ok', false, 'error', 'La nueva modalidad debe ser diferente'); END IF;
    -- Evidencia irreversible de ambulancia: no se permite retirarla.
    IF _origen = 'AMBULANCIA_EGRESO' THEN
      IF EXISTS (SELECT 1 FROM public.seguimientos s
                  WHERE s.caso_id = _caso_id AND s.tipo_caso = 'domiciliario'
                    AND s.created_at >= v_ciclo
                    AND upper(coalesce(s.detalles->>'evento','')) = 'CONFIRMACION_LLEGADA_AMBULANCIA')
         OR EXISTS (SELECT 1 FROM public.entrega_firmas ef
                     WHERE ef.caso_id = _caso_id AND ef.tipo_caso = 'domiciliario'
                       AND ef.estado IN ('FIRMADA','PENDIENTE')) THEN
        RETURN jsonb_build_object('ok', false, 'error',
          'La modalidad AMBULANCIA tiene evidencia registrada o una firma QR vigente: revoque o cierre el flujo antes de cambiarla');
      END IF;
    END IF;
    v_nuevos := array_remove(v_tipos, _origen) || _nueva;
  END IF;

  v_obs := nullif(left(btrim(coalesce(_observaciones,'')), 1000), '');
  SELECT p.nombre INTO v_nombre FROM public.profiles p WHERE p.user_id = _actor;

  v_det := jsonb_strip_nulls(jsonb_build_object(
    'novedad_tipo', 'GESTION_MODALIDAD',
    'gestion_modalidad_tipo', _gestion,
    'modalidad_origen_codigo', CASE WHEN _gestion='CAMBIAR_MODALIDAD' THEN _origen END,
    'modalidad_nueva_codigo', _nueva,
    'modalidades_activas_antes', to_jsonb(v_tipos),
    'modalidades_activas_despues', to_jsonb(v_nuevos),
    'justificacion', v_just,
    'observaciones', v_obs));
  IF _canales IS NOT NULL AND jsonb_typeof(_canales) = 'array' AND jsonb_array_length(_canales) > 0 THEN
    v_det := v_det || jsonb_build_object('canales_gestion', _canales, 'canal_gestion', _canales->>0);
  END IF;

  UPDATE public.domiciliarios SET tipos_solicitud = v_nuevos, updated_at = now() WHERE id = _caso_id;

  INSERT INTO public.seguimientos (caso_id, tipo_caso, tipo_seguimiento, detalle,
    plantilla_indigo, detalles, nombre_usuario, created_by)
  VALUES (_caso_id, 'domiciliario', 'NOVEDADES', coalesce(v_obs, v_just),
    nullif(btrim(coalesce(_plantilla,'')),''), v_det, v_nombre, _actor)
  RETURNING id INTO v_seg_id;

  PERFORM public.registrar_auditoria_srv(_actor, 'NOVEDAD_GESTION_MODALIDAD', 'domiciliarios',
    'domiciliarios', _caso_id::text, 'exito', v_det);

  SELECT estado_ciclo INTO v_estado FROM public.domiciliarios WHERE id = _caso_id;
  RETURN jsonb_build_object('ok', true, 'seguimiento_id', v_seg_id,
    'modalidades_activas', to_jsonb(v_nuevos), 'estado_ciclo', v_estado);
END;
$function$;

CREATE OR REPLACE FUNCTION public.novedad_gestion_modalidad(
  _actor uuid, _caso_id uuid, _gestion text, _origen text, _nueva text,
  _justificacion text, _observaciones text DEFAULT NULL, _plantilla text DEFAULT NULL,
  _canales jsonb DEFAULT NULL)
 RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path TO '' AS $$
  SELECT private.novedad_gestion_modalidad(_actor, _caso_id, _gestion, _origen, _nueva,
                                           _justificacion, _observaciones, _plantilla, _canales);
$$;
REVOKE ALL ON FUNCTION public.novedad_gestion_modalidad(uuid,uuid,text,text,text,text,text,text,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.novedad_gestion_modalidad(uuid,uuid,text,text,text,text,text,text,jsonb) TO service_role;

-- 5) Guard: tipos principales retirados + Revisión Autorización Estancia.
CREATE OR REPLACE FUNCTION private.seguimientos_tipos_retirados_guard()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE
  t text := private.norm_txt(NEW.tipo_seguimiento);
  v_motivo text;
BEGIN
  IF t IN ('CORREO ELECTRONICO','PLATAFORMA WEB','FISICO O PRESENCIAL','CONTACTO TELEFONICO') THEN
    RAISE EXCEPTION 'El canal debe registrarse dentro de CANAL DE GESTIÓN, no como tipo de seguimiento.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF t IN ('CAMBIO DE UNIDAD','CAMBIO EN ESPECIALIDAD') THEN
    RAISE EXCEPTION 'Esta acción debe registrarse dentro de NOVEDADES.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.tipo_caso = 'remision' AND t LIKE 'REVISION AUTORIZACION ESTANCIA%' THEN
    SELECT private.norm_txt(remision_por) INTO v_motivo FROM public.remisiones WHERE id = NEW.caso_id;
    IF coalesce(v_motivo,'') <> 'RED NO CONTRATADA' THEN
      RAISE EXCEPTION 'REVISIÓN AUTORIZACIÓN ESTANCIA solo aplica a casos con REMISIÓN POR = RED NO CONTRATADA.'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS a_seguimientos_tipos_retirados_guard ON public.seguimientos;
CREATE TRIGGER a_seguimientos_tipos_retirados_guard
  BEFORE INSERT ON public.seguimientos
  FOR EACH ROW EXECUTE FUNCTION private.seguimientos_tipos_retirados_guard();
