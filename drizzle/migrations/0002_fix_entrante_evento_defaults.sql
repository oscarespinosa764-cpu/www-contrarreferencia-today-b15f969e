CREATE OR REPLACE FUNCTION private.entrante_evento_compuesto(
  _actor uuid,
  _caso_id uuid,
  _tipo text,
  _fila jsonb,
  _estado_padre text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_padre public.casos_entrantes%ROWTYPE;
  v_row   public.casos_entrantes%ROWTYPE;
BEGIN
  IF _actor IS NULL OR NOT private.is_active_member(_actor) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Usuario no autorizado');
  END IF;
  IF _tipo NOT IN ('ING','CAN','AMP') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Tipo de evento no permitido');
  END IF;

  SELECT * INTO v_padre FROM public.casos_entrantes WHERE id = _caso_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'El caso no existe');
  END IF;

  v_row := jsonb_populate_record(NULL::public.casos_entrantes, _fila);
  v_row.id         := gen_random_uuid();
  v_row.tipo       := _tipo;
  v_row.cod_ref    := v_padre.codigo;
  v_row.created_by := _actor;
  v_row.created_at := now();
  v_row.updated_at := now();
  -- Columnas NOT NULL con DEFAULT: el INSERT de fila completa escribe NULL
  -- explícito y omite el default, por lo que se replican aquí.
  v_row.archivado  := COALESCE(v_row.archivado, false);
  v_row.remision_hora_conocida := COALESCE(v_row.remision_hora_conocida, false);

  BEGIN
    INSERT INTO public.casos_entrantes VALUES (v_row.*);
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object('ok', false, 'error', 'DUPLICADO');
  END;

  IF _estado_padre IS NOT NULL THEN
    UPDATE public.casos_entrantes
       SET estado = _estado_padre, updated_at = now()
     WHERE id = v_padre.id;
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;
