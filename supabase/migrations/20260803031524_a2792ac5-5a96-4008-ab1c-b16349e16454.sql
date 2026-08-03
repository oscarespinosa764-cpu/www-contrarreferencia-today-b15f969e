CREATE TABLE IF NOT EXISTS public.gu_fr_50_import_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  modulo text NOT NULL,
  fingerprint text NOT NULL,
  case_id uuid,
  import_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT gu_fr_50_ledger_unico UNIQUE (modulo, fingerprint)
);

GRANT ALL ON public.gu_fr_50_import_ledger TO service_role;
ALTER TABLE public.gu_fr_50_import_ledger ENABLE ROW LEVEL SECURITY;
-- Fail-closed: sin políticas. Sólo accesible por funciones SECURITY DEFINER y service_role.

CREATE OR REPLACE FUNCTION private.importar_gu_fr_50(_actor uuid, _lote jsonb, _import_id uuid DEFAULT gen_random_uuid())
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  r jsonb;
  ins int := 0; omit int := 0; total int := 0; amb int := 0;
  por_hoja jsonb := '{}'::jsonb;
  hoja_ins int; hoja_omit int;
  d text; f timestamptz; fp text; led uuid; nuevo uuid;
BEGIN
  IF _actor IS NULL OR NOT public.is_active_member(_actor) THEN
    RAISE EXCEPTION 'IMPORT_NO_AUTORIZADO';
  END IF;
  IF NOT public.has_role(_actor, 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'IMPORT_SOLO_ADMIN';
  END IF;

  -- ENTRANTES
  hoja_ins := 0; hoja_omit := 0;
  FOR r IN SELECT * FROM jsonb_array_elements(COALESCE(_lote->'ENTRANTES', '[]'::jsonb))
           ORDER BY (value->>'_fp') LOOP
    total := total + 1;
    d := NULLIF(r->>'documento',''); f := NULLIF(r->>'fecha_envio','')::timestamptz;
    fp := NULLIF(r->>'_fp','');
    IF fp IS NULL THEN amb := amb + 1; hoja_omit := hoja_omit + 1; CONTINUE; END IF;
    INSERT INTO public.gu_fr_50_import_ledger (modulo, fingerprint, import_id)
    VALUES ('ENTRANTES', fp, _import_id)
    ON CONFLICT (modulo, fingerprint) DO NOTHING
    RETURNING id INTO led;
    IF led IS NULL THEN hoja_omit := hoja_omit + 1; CONTINUE; END IF;
    INSERT INTO public.casos_entrantes
      (tipo, documento, nombres, ips, especialidad, unidad, eapb, aseguramiento, estado, fecha, detalle, created_by)
    VALUES ('REMISION', d, NULLIF(r->>'paciente',''), NULLIF(r->>'ips_remite',''),
            NULLIF(r->>'especialidad',''), NULLIF(r->>'unidad',''), NULLIF(r->>'eapb',''),
            NULLIF(r->>'eapb',''), NULLIF(r->>'estado',''), f, NULLIF(r->>'justificacion',''), _actor)
    RETURNING id INTO nuevo;
    UPDATE public.gu_fr_50_import_ledger SET case_id = nuevo WHERE id = led;
    hoja_ins := hoja_ins + 1;
  END LOOP;
  ins := ins + hoja_ins; omit := omit + hoja_omit;
  por_hoja := por_hoja || jsonb_build_object('ENTRANTES', jsonb_build_object('insertadas', hoja_ins, 'omitidas', hoja_omit));

  -- SALIENTES
  hoja_ins := 0; hoja_omit := 0;
  FOR r IN SELECT * FROM jsonb_array_elements(COALESCE(_lote->'SALIENTES', '[]'::jsonb))
           ORDER BY (value->>'_fp') LOOP
    total := total + 1;
    d := NULLIF(r->>'documento',''); f := NULLIF(r->>'fecha_solicitud','')::timestamptz;
    fp := NULLIF(r->>'_fp','');
    IF fp IS NULL THEN amb := amb + 1; hoja_omit := hoja_omit + 1; CONTINUE; END IF;
    INSERT INTO public.gu_fr_50_import_ledger (modulo, fingerprint, import_id)
    VALUES ('SALIENTES', fp, _import_id)
    ON CONFLICT (modulo, fingerprint) DO NOTHING
    RETURNING id INTO led;
    IF led IS NULL THEN hoja_omit := hoja_omit + 1; CONTINUE; END IF;
    INSERT INTO public.remisiones
      (paciente, documento, edad, eapb, asegurador, regimen, servicio, remision_por, cie10,
       especificacion, ips_receptora, estado, tipo_ambulancia, prestador_traslado,
       observaciones, fecha_inicio, created_by)
    VALUES (NULLIF(r->>'paciente',''), d, NULLIF(r->>'edad',''), NULLIF(r->>'eapb',''),
            NULLIF(r->>'eapb',''), NULLIF(r->>'regimen',''), NULLIF(r->>'servicio_remite',''),
            NULLIF(r->>'motivo_remision',''), NULLIF(r->>'cie10',''), NULLIF(r->>'cie10_descripcion',''),
            NULLIF(r->>'ips_receptora',''), COALESCE(NULLIF(r->>'estado_actual',''),'EN GESTION'),
            NULLIF(r->>'tipo_ambulancia',''), NULLIF(r->>'empresa_traslado',''),
            NULLIF(r->>'observaciones',''), f, _actor)
    RETURNING id INTO nuevo;
    UPDATE public.gu_fr_50_import_ledger SET case_id = nuevo WHERE id = led;
    hoja_ins := hoja_ins + 1;
  END LOOP;
  ins := ins + hoja_ins; omit := omit + hoja_omit;
  por_hoja := por_hoja || jsonb_build_object('SALIENTES', jsonb_build_object('insertadas', hoja_ins, 'omitidas', hoja_omit));

  -- ATENCION DOMICILIARIA
  hoja_ins := 0; hoja_omit := 0;
  FOR r IN SELECT * FROM jsonb_array_elements(COALESCE(_lote->'ATENCION DOMICILIARIA', '[]'::jsonb))
           ORDER BY (value->>'_fp') LOOP
    total := total + 1;
    d := NULLIF(r->>'documento',''); f := NULLIF(r->>'fecha_solicitud','')::timestamptz;
    fp := NULLIF(r->>'_fp','');
    IF fp IS NULL THEN amb := amb + 1; hoja_omit := hoja_omit + 1; CONTINUE; END IF;
    INSERT INTO public.gu_fr_50_import_ledger (modulo, fingerprint, import_id)
    VALUES ('ATENCION DOMICILIARIA', fp, _import_id)
    ON CONFLICT (modulo, fingerprint) DO NOTHING
    RETURNING id INTO led;
    IF led IS NULL THEN hoja_omit := hoja_omit + 1; CONTINUE; END IF;
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
            NULLIF(r->>'observaciones',''), f, f, _actor)
    RETURNING id INTO nuevo;
    UPDATE public.gu_fr_50_import_ledger SET case_id = nuevo WHERE id = led;
    hoja_ins := hoja_ins + 1;
  END LOOP;
  ins := ins + hoja_ins; omit := omit + hoja_omit;
  por_hoja := por_hoja || jsonb_build_object('ATENCION DOMICILIARIA', jsonb_build_object('insertadas', hoja_ins, 'omitidas', hoja_omit));

  -- REFERENCIAS INTERNAS
  hoja_ins := 0; hoja_omit := 0;
  FOR r IN SELECT * FROM jsonb_array_elements(COALESCE(_lote->'REFERENCIAS INTERNAS', '[]'::jsonb))
           ORDER BY (value->>'_fp') LOOP
    total := total + 1;
    d := NULLIF(r->>'documento',''); f := NULLIF(r->>'fecha_solicitud','')::timestamptz;
    fp := NULLIF(r->>'_fp','');
    IF fp IS NULL THEN amb := amb + 1; hoja_omit := hoja_omit + 1; CONTINUE; END IF;
    INSERT INTO public.gu_fr_50_import_ledger (modulo, fingerprint, import_id)
    VALUES ('REFERENCIAS INTERNAS', fp, _import_id)
    ON CONFLICT (modulo, fingerprint) DO NOTHING
    RETURNING id INTO led;
    IF led IS NULL THEN hoja_omit := hoja_omit + 1; CONTINUE; END IF;
    INSERT INTO public.referencia_interna
      (tipo_solicitud, servicio, proveedor_prestador, paciente, documento, eapb, estado,
       observaciones, tipo_ambulancia, fecha, fecha_inicio, created_by)
    VALUES (NULLIF(r->>'vx_examen',''), NULLIF(r->>'especialidad_solicitante',''),
            NULLIF(r->>'ips_acepta',''), NULLIF(r->>'paciente',''), d, NULLIF(r->>'entidad',''),
            'EN GESTION', NULLIF(r->>'observacion',''), NULLIF(r->>'tipo_ambulancia',''),
            f, f, _actor)
    RETURNING id INTO nuevo;
    UPDATE public.gu_fr_50_import_ledger SET case_id = nuevo WHERE id = led;
    hoja_ins := hoja_ins + 1;
  END LOOP;
  ins := ins + hoja_ins; omit := omit + hoja_omit;
  por_hoja := por_hoja || jsonb_build_object('REFERENCIAS INTERNAS', jsonb_build_object('insertadas', hoja_ins, 'omitidas', hoja_omit));

  PERFORM public.registrar_auditoria_srv(
    _actor, 'GU_FR_50_IMPORT_SUCCESS', 'importaciones', 'gu_fr_50', _import_id::text, 'exito',
    jsonb_build_object('plantilla','GU-FR-50','version','02','import_id',_import_id,
                       'recibidas',total,'insertadas',ins,'omitidas',omit,
                       'ambiguas',amb,'actualizadas',0,'hojas',por_hoja),
    NULL, NULL);

  RETURN jsonb_build_object('ok', true, 'import_id', _import_id, 'recibidas', total,
                            'insertadas', ins, 'omitidas', omit, 'ambiguas', amb,
                            'hojas', por_hoja);
END;
$function$;

REVOKE ALL ON FUNCTION private.importar_gu_fr_50(uuid, jsonb, uuid) FROM PUBLIC, anon, authenticated;