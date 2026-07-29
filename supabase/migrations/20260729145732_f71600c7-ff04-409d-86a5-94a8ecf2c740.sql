-- Catálogo (compatibilidad con lecturas informativas actuales).
INSERT INTO public.catalogos (tipo, valor, activo)
VALUES
  ('UNIDAD', 'HOSPITALIZACIÓN', true),
  ('UNIDAD', 'QUIRÓFANO', true)
ON CONFLICT DO NOTHING;

-- Función atómica para Cambio de Unidad en Referencias Internas.
CREATE OR REPLACE FUNCTION public.registrar_cambio_unidad_ri(
  _caso_id uuid,
  _nueva_unidad_codigo text,
  _nueva_cama text,
  _observaciones text DEFAULT NULL,
  _plantilla_indigo text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_nombre text;
  v_email text;
  v_servicio_actual text;
  v_archivado boolean;
  v_estado text;
  v_cama_actual text;
  v_nueva_label text;
  v_cama_norm text;
  v_obs text;
  v_plantilla text;
  v_seg_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No autenticado');
  END IF;
  IF NOT private.is_active_member(v_uid) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Usuario no autorizado');
  END IF;

  IF _nueva_unidad_codigo IS NULL
     OR _nueva_unidad_codigo NOT IN ('UCI_ADULTOS','URGENCIAS','HOSPITALIZACION','QUIROFANO') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Unidad no permitida');
  END IF;

  v_cama_norm := upper(btrim(regexp_replace(coalesce(_nueva_cama, ''), '\s+', ' ', 'g')));
  IF v_cama_norm = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'La nueva cama es obligatoria');
  END IF;
  IF length(v_cama_norm) > 30 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'La nueva cama supera la longitud permitida');
  END IF;

  v_nueva_label := CASE _nueva_unidad_codigo
    WHEN 'UCI_ADULTOS'     THEN 'UCI ADULTOS'
    WHEN 'URGENCIAS'       THEN 'URGENCIAS'
    WHEN 'HOSPITALIZACION' THEN 'HOSPITALIZACIÓN'
    WHEN 'QUIROFANO'       THEN 'QUIRÓFANO'
  END;

  v_obs := nullif(btrim(coalesce(_observaciones, '')), '');
  IF v_obs IS NOT NULL AND length(v_obs) > 1000 THEN
    v_obs := left(v_obs, 1000);
  END IF;
  v_plantilla := nullif(btrim(coalesce(_plantilla_indigo, '')), '');

  -- Bloquea la fila del caso y valida estado.
  SELECT servicio, archivado, estado
    INTO v_servicio_actual, v_archivado, v_estado
    FROM public.referencia_interna
   WHERE id = _caso_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Caso no encontrado');
  END IF;
  IF coalesce(v_archivado, false) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'El caso está cerrado y no admite cambios');
  END IF;

  -- Cama actual = último CAMBIO DE UNIDAD registrado (referencia_interna no tiene columna cama).
  SELECT upper(btrim(coalesce(
           (s.detalles->>'nueva_cama'),
           (s.detalles->>'cama_nueva')
         )))
    INTO v_cama_actual
    FROM public.seguimientos s
   WHERE s.caso_id = _caso_id
     AND s.tipo_caso = 'referencia_interna'
     AND upper(coalesce(s.tipo_seguimiento, '')) = 'CAMBIO DE UNIDAD'
   ORDER BY s.created_at DESC
   LIMIT 1;

  v_cama_actual := coalesce(v_cama_actual, '');

  IF upper(coalesce(v_servicio_actual, '')) = upper(v_nueva_label)
     AND v_cama_actual = v_cama_norm THEN
    RETURN jsonb_build_object('ok', false, 'error', 'La nueva ubicación debe ser diferente de la ubicación actual');
  END IF;

  SELECT p.nombre INTO v_nombre FROM public.profiles p WHERE p.user_id = v_uid;
  SELECT email INTO v_email FROM auth.users WHERE id = v_uid;

  INSERT INTO public.seguimientos (
    caso_id, tipo_caso, tipo_seguimiento, estado_solicitud, detalle,
    plantilla_indigo, detalles, nombre_usuario, created_by
  ) VALUES (
    _caso_id,
    'referencia_interna',
    'CAMBIO DE UNIDAD',
    NULL,
    v_obs,
    v_plantilla,
    jsonb_build_object(
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
    coalesce(v_nombre, v_email),
    v_uid
  )
  RETURNING id INTO v_seg_id;

  UPDATE public.referencia_interna
     SET servicio   = v_nueva_label,
         updated_at = now()
   WHERE id = _caso_id;

  PERFORM public.registrar_auditoria_srv(
    v_uid,
    'CAMBIO_UNIDAD_RI',
    'referencia_interna',
    'referencia_interna',
    _caso_id::text,
    'exito',
    jsonb_build_object(
      'caso_id',            _caso_id,
      'unidad_anterior',    v_servicio_actual,
      'cama_anterior',      nullif(v_cama_actual, ''),
      'nueva_unidad_codigo', _nueva_unidad_codigo,
      'nueva_unidad_label',  v_nueva_label,
      'nueva_cama',         v_cama_norm,
      'seguimiento_id',     v_seg_id
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'seguimiento_id', v_seg_id,
    'nueva_unidad',   v_nueva_label,
    'nueva_cama',     v_cama_norm
  );
END;
$$;

REVOKE ALL ON FUNCTION public.registrar_cambio_unidad_ri(uuid, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.registrar_cambio_unidad_ri(uuid, text, text, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.registrar_cambio_unidad_ri(uuid, text, text, text, text) TO authenticated;