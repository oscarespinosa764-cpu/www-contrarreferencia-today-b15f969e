CREATE OR REPLACE FUNCTION private.importar_gu_fr_50(_actor uuid, _lote jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  r jsonb;
  ins int := 0; omit int := 0; total int := 0;
  por_hoja jsonb := '{}'::jsonb;
  hoja_ins int; hoja_omit int;
  d text; f timestamptz; existe boolean;
BEGIN
  IF _actor IS NULL OR NOT public.is_active_member(_actor) THEN
    RAISE EXCEPTION 'IMPORT_NO_AUTORIZADO';
  END IF;
  IF NOT public.has_role(_actor, 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'IMPORT_SOLO_ADMIN';
  END IF;

  -- ENTRANTES -> public.casos_entrantes
  hoja_ins := 0; hoja_omit := 0;
  FOR r IN SELECT * FROM jsonb_array_elements(COALESCE(_lote->'ENTRANTES', '[]'::jsonb)) LOOP
    total := total + 1;
    d := NULLIF(r->>'documento','');
    f := NULLIF(r->>'fecha_envio','')::timestamptz;
    SELECT EXISTS(SELECT 1 FROM public.casos_entrantes c
      WHERE c.documento = d AND date_trunc('minute', c.fecha) = date_trunc('minute', f)) INTO existe;
    IF existe THEN hoja_omit := hoja_omit + 1; CONTINUE; END IF;
    INSERT INTO public.casos_entrantes
      (tipo, documento, nombres, ips, especialidad, unidad, eapb, aseguramiento, estado, fecha, detalle, created_by)
    VALUES ('REMISION', d, NULLIF(r->>'paciente',''), NULLIF(r->>'ips_remite',''),
            NULLIF(r->>'especialidad',''), NULLIF(r->>'unidad',''), NULLIF(r->>'eapb',''),
            NULLIF(r->>'eapb',''), NULLIF(r->>'estado',''), f, NULLIF(r->>'justificacion',''), _actor);
    hoja_ins := hoja_ins + 1;
  END LOOP;
  ins := ins + hoja_ins; omit := omit + hoja_omit;
  por_hoja := por_hoja || jsonb_build_object('ENTRANTES', jsonb_build_object('insertadas', hoja_ins, 'omitidas', hoja_omit));

  -- SALIENTES -> public.remisiones
  hoja_ins := 0; hoja_omit := 0;
  FOR r IN SELECT * FROM jsonb_array_elements(COALESCE(_lote->'SALIENTES', '[]'::jsonb)) LOOP
    total := total + 1;
    d := NULLIF(r->>'documento','');
    f := NULLIF(r->>'fecha_solicitud','')::timestamptz;
    SELECT EXISTS(SELECT 1 FROM public.remisiones c
      WHERE c.documento = d AND date_trunc('minute', c.fecha_inicio) = date_trunc('minute', f)) INTO existe;
    IF existe THEN hoja_omit := hoja_omit + 1; CONTINUE; END IF;
    INSERT INTO public.remisiones
      (paciente, documento, edad, eapb, asegurador, regimen, servicio, remision_por, cie10,
       especificacion, ips_receptora, estado, tipo_ambulancia, prestador_traslado,
       observaciones, fecha_inicio, created_by)
    VALUES (NULLIF(r->>'paciente',''), d, NULLIF(r->>'edad',''), NULLIF(r->>'eapb',''),
            NULLIF(r->>'eapb',''), NULLIF(r->>'regimen',''), NULLIF(r->>'servicio_remite',''),
            NULLIF(r->>'motivo_remision',''), NULLIF(r->>'cie10',''), NULLIF(r->>'cie10_descripcion',''),
            NULLIF(r->>'ips_receptora',''), COALESCE(NULLIF(r->>'estado_actual',''),'EN GESTION'),
            NULLIF(r->>'tipo_ambulancia',''), NULLIF(r->>'empresa_traslado',''),
            NULLIF(r->>'observaciones',''), f, _actor);
    hoja_ins := hoja_ins + 1;
  END LOOP;
  ins := ins + hoja_ins; omit := omit + hoja_omit;
  por_hoja := por_hoja || jsonb_build_object('SALIENTES', jsonb_build_object('insertadas', hoja_ins, 'omitidas', hoja_omit));

  -- ATENCION DOMICILIARIA -> public.domiciliarios
  hoja_ins := 0; hoja_omit := 0;
  FOR r IN SELECT * FROM jsonb_array_elements(COALESCE(_lote->'ATENCION DOMICILIARIA', '[]'::jsonb)) LOOP
    total := total + 1;
    d := NULLIF(r->>'documento','');
    f := NULLIF(r->>'fecha_solicitud','')::timestamptz;
    SELECT EXISTS(SELECT 1 FROM public.domiciliarios c
      WHERE c.documento = d AND date_trunc('minute', c.fecha_inicio) = date_trunc('minute', f)) INTO existe;
    IF existe THEN hoja_omit := hoja_omit + 1; CONTINUE; END IF;
    INSERT INTO public.domiciliarios
      (tipo_solicitud, tipo_solicitud_detalle, paciente, documento, edad, eapb, regimen, servicio,
       cie10, estado, requiere_ambulancia, tipo_ambulancia, proveedor, observaciones,
       fecha, fecha_inicio, created_by)
    VALUES (COALESCE(NULLIF(r->>'tipo_solicitud',''),'PHD'), NULLIF(r->>'tipo_solicitud',''),
            NULLIF(r->>'paciente',''), d, NULLIF(r->>'edad',''), NULLIF(r->>'eapb',''),
            NULLIF(r->>'regimen',''), NULLIF(r->>'servicio_remite',''), NULLIF(r->>'cie10',''),
            COALESCE(NULLIF(r->>'estado',''),'EN GESTION'),
            COALESCE((r->>'requiere_ambulancia') ILIKE 'SI', false),
            NULLIF(r->>'tipo_ambulancia',''), NULLIF(r->>'empresa_traslado',''),
            NULLIF(r->>'observaciones',''), f, f, _actor);
    hoja_ins := hoja_ins + 1;
  END LOOP;
  ins := ins + hoja_ins; omit := omit + hoja_omit;
  por_hoja := por_hoja || jsonb_build_object('ATENCION DOMICILIARIA', jsonb_build_object('insertadas', hoja_ins, 'omitidas', hoja_omit));

  -- REFERENCIAS INTERNAS -> public.referencia_interna
  hoja_ins := 0; hoja_omit := 0;
  FOR r IN SELECT * FROM jsonb_array_elements(COALESCE(_lote->'REFERENCIAS INTERNAS', '[]'::jsonb)) LOOP
    total := total + 1;
    d := NULLIF(r->>'documento','');
    f := NULLIF(r->>'fecha_solicitud','')::timestamptz;
    SELECT EXISTS(SELECT 1 FROM public.referencia_interna c
      WHERE c.documento = d AND date_trunc('minute', c.fecha_inicio) = date_trunc('minute', f)) INTO existe;
    IF existe THEN hoja_omit := hoja_omit + 1; CONTINUE; END IF;
    INSERT INTO public.referencia_interna
      (tipo_solicitud, servicio, proveedor_prestador, paciente, documento, eapb, estado,
       observaciones, tipo_ambulancia, fecha, fecha_inicio, created_by)
    VALUES (NULLIF(r->>'vx_examen',''), NULLIF(r->>'especialidad_solicitante',''),
            NULLIF(r->>'ips_acepta',''), NULLIF(r->>'paciente',''), d, NULLIF(r->>'entidad',''),
            'EN GESTION', NULLIF(r->>'observacion',''), NULLIF(r->>'tipo_ambulancia',''),
            f, f, _actor);
    hoja_ins := hoja_ins + 1;
  END LOOP;
  ins := ins + hoja_ins; omit := omit + hoja_omit;
  por_hoja := por_hoja || jsonb_build_object('REFERENCIAS INTERNAS', jsonb_build_object('insertadas', hoja_ins, 'omitidas', hoja_omit));

  PERFORM public.registrar_auditoria_srv(
    _actor, 'GU_FR_50_IMPORT_SUCCESS', 'importaciones', 'gu_fr_50', NULL, 'exito',
    jsonb_build_object('plantilla','GU-FR-50','version','02','recibidas',total,
                       'insertadas',ins,'omitidas',omit,'hojas',por_hoja),
    NULL, NULL);

  RETURN jsonb_build_object('ok', true, 'recibidas', total, 'insertadas', ins,
                            'omitidas', omit, 'hojas', por_hoja);
END;
$$;

REVOKE ALL ON FUNCTION private.importar_gu_fr_50(uuid, jsonb) FROM PUBLIC, anon, authenticated;