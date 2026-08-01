CREATE OR REPLACE FUNCTION private.seguimientos_contactos_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_canales text[];
  v_det jsonb;
  v_par record;
  v_blk jsonb;
  v_c jsonb;
  v_tipo text;
  v_tipos text[] := ARRAY['FAMILIAR_PACIENTE','EAPB','CRUE','IPS','FUNCIONARIO_SERVICIO'];
  v_serv text[] := ARRAY['URGENCIAS','HOSPITALIZACION','QUIROFANO','UCI','ADMISIONES_FACTURACION',
                         'RESONANCIAS','TOMOGRAFIA','RAYOS_X','AGENDAMIENTO','OTRO'];
  v_sel text[];
  v_n int;
BEGIN
  IF NEW.detalles IS NULL OR jsonb_typeof(NEW.detalles->'canales_gestion') <> 'array' THEN
    RETURN NEW;
  END IF;

  SELECT array_agg(upper(btrim(x))) INTO v_canales
    FROM jsonb_array_elements_text(NEW.detalles->'canales_gestion') AS t(x);
  v_canales := coalesce(v_canales, '{}'::text[]);
  v_det := coalesce(NEW.detalles->'detalle_canal', '{}'::jsonb);

  FOR v_par IN
    SELECT * FROM (VALUES
      ('contacto_telefonico','CONTACTO_TELEFONICO'),
      ('mensajeria_whatsapp','MENSAJERIA_INSTANTANEA_WHATSAPP')
    ) AS t(clave, canal)
  LOOP
    v_blk := v_det->v_par.clave;
    IF v_blk IS NULL OR jsonb_typeof(v_blk) <> 'object' THEN
      CONTINUE;
    END IF;

    IF NOT (v_par.canal = ANY(v_canales)) THEN
      RAISE EXCEPTION 'Datos de contacto sin el canal de gestión correspondiente.'
        USING ERRCODE = 'check_violation';
    END IF;

    IF jsonb_typeof(v_blk->'contactos') <> 'array' THEN
      RAISE EXCEPTION 'Seleccione con quién se realizó el contacto.'
        USING ERRCODE = 'check_violation';
    END IF;

    SELECT array_agg(upper(btrim(coalesce(c->>'tipo','')))) INTO v_sel
      FROM jsonb_array_elements(v_blk->'contactos') AS c;
    v_sel := coalesce(v_sel, '{}'::text[]);
    v_n := coalesce(array_length(v_sel, 1), 0);

    IF v_n = 0 THEN
      RAISE EXCEPTION 'Seleccione con quién se realizó el contacto.'
        USING ERRCODE = 'check_violation';
    END IF;
    IF v_n > 3 THEN
      RAISE EXCEPTION 'Puede seleccionar máximo 3 tipos de contacto.'
        USING ERRCODE = 'check_violation';
    END IF;
    IF (SELECT count(DISTINCT x) FROM unnest(v_sel) x) <> v_n THEN
      RAISE EXCEPTION 'Hay tipos de contacto duplicados.'
        USING ERRCODE = 'check_violation';
    END IF;
    IF EXISTS (SELECT 1 FROM unnest(v_sel) x WHERE NOT (x = ANY(v_tipos))) THEN
      RAISE EXCEPTION 'Tipo de contacto no válido.'
        USING ERRCODE = 'check_violation';
    END IF;

    FOR v_c IN SELECT c FROM jsonb_array_elements(v_blk->'contactos') AS c
    LOOP
      v_tipo := upper(btrim(coalesce(v_c->>'tipo','')));
      IF v_tipo = 'FUNCIONARIO_SERVICIO' THEN
        IF length(btrim(coalesce(v_c->>'nombre_apellido',''))) < 3
           OR length(btrim(coalesce(v_c->>'nombre_apellido',''))) > 160
           OR coalesce(v_c->>'nombre_apellido','') LIKE '%<%' THEN
          RAISE EXCEPTION 'Funcionario y/o servicio: nombre del funcionario no válido.'
            USING ERRCODE = 'check_violation';
        END IF;
        IF length(btrim(coalesce(v_c->>'cargo',''))) < 2
           OR length(btrim(coalesce(v_c->>'cargo',''))) > 160
           OR coalesce(v_c->>'cargo','') LIKE '%<%' THEN
          RAISE EXCEPTION 'Funcionario y/o servicio: cargo del funcionario no válido.'
            USING ERRCODE = 'check_violation';
        END IF;
        IF NOT (upper(btrim(coalesce(v_c->>'servicio_codigo',''))) = ANY(v_serv)) THEN
          RAISE EXCEPTION 'Funcionario y/o servicio: servicio no válido.'
            USING ERRCODE = 'check_violation';
        END IF;
        IF upper(btrim(coalesce(v_c->>'servicio_codigo',''))) = 'OTRO' THEN
          IF length(btrim(coalesce(v_c->>'servicio_otro',''))) < 2
             OR length(btrim(coalesce(v_c->>'servicio_otro',''))) > 100
             OR coalesce(v_c->>'servicio_otro','') LIKE '%<%' THEN
            RAISE EXCEPTION 'Funcionario y/o servicio: indique ¿cuál servicio?'
              USING ERRCODE = 'check_violation';
          END IF;
        ELSIF btrim(coalesce(v_c->>'servicio_otro','')) <> '' THEN
          RAISE EXCEPTION 'Funcionario y/o servicio: dato de servicio no visible.'
            USING ERRCODE = 'check_violation';
        END IF;
      END IF;
    END LOOP;
  END LOOP;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS zz_seguimientos_contactos_guard ON public.seguimientos;
CREATE TRIGGER zz_seguimientos_contactos_guard
  BEFORE INSERT OR UPDATE ON public.seguimientos
  FOR EACH ROW EXECUTE FUNCTION private.seguimientos_contactos_guard();

REVOKE ALL ON FUNCTION private.seguimientos_contactos_guard() FROM PUBLIC, anon, authenticated;