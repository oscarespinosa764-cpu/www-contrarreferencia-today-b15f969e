-- FASE 5G · A — Ciclo operativo canónico de Referencias Internas.

-- 1) Estado automático: "TRÁMITE COORDINADO" se persiste con el código
--    histórico 'PENDIENTE COORDINACIÓN FECHA Y HORA EXAMEN'.
CREATE OR REPLACE FUNCTION private.seguimientos_ri_estado_apply()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  ts text := upper(coalesce(NEW.tipo_seguimiento, ''));
  d jsonb := NEW.detalles;
  nuevo_estado text := NULL;
  arch boolean := NULL;
  externa_cod text;
  interna_cod text;
  sin_fh boolean;
BEGIN
  IF NEW.tipo_caso IS DISTINCT FROM 'referencia_interna' THEN
    RETURN NEW;
  END IF;

  IF ts IN ('CAMBIO DE UNIDAD', 'OTRO') THEN
    RETURN NEW;
  END IF;

  IF ts IN ('CANCELACIÓN DEL TRÁMITE','CANCELACION DEL TRAMITE') THEN
    nuevo_estado := 'CANCELADO';
    arch := true;
  ELSIF ts IN ('CIERRE POR CULMINACIÓN DE SOLICITUD','CIERRE POR CULMINACION DE SOLICITUD') THEN
    nuevo_estado := 'CERRADO POR CULMINACION DE SOLICITUD';
    arch := true;

  ELSIF ts IN ('TRÁMITE COORDINADO','TRAMITE COORDINADO','EXAMEN COORDINADO')
        OR ts LIKE 'PENDIENTE COORDINAC%EXAMEN' THEN
    nuevo_estado := 'TRAMITE COORDINADO SIN CONFIRMACION AMBULANCIA';
  ELSIF ts IN (
    'CONFIRMACIÓN DE PROGRAMACIÓN DE AMBULANCIA',
    'CONFIRMACION DE PROGRAMACION DE AMBULANCIA',
    'AMBULANCIA COORDINADA',
    'ACTIVACIÓN DE PROVEEDOR CONTRATADO DE TEP',
    'ACTIVACION DE PROVEEDOR CONTRATADO DE TEP'
  ) THEN
    nuevo_estado := 'AMBULANCIA PROGRAMADA';
  ELSIF ts IN (
    'CONFIRMACIÓN DE LLEGADA DE AMBULANCIA',
    'CONFIRMACION DE LLEGADA DE AMBULANCIA'
  ) THEN
    nuevo_estado := 'AMBULANCIA EN SITIO PTE CONFIRMACION REINGRESO';

  ELSIF ts = 'NOVEDADES' AND d IS NOT NULL THEN
    externa_cod := d->>'externa_codigo';
    interna_cod := d->>'interna_codigo';
    sin_fh := coalesce((d->>'sin_nueva_fecha_hora')::boolean, false);
    IF externa_cod = 'DESCOMPENSACION_HEMODINAMICA' THEN
      nuevo_estado := 'PENDIENTE COORDINACION';
    ELSIF externa_cod = 'AMBULANCIA_SIN_DISPONIBILIDAD' THEN
      nuevo_estado := 'TRAMITE COORDINADO SIN CONFIRMACION AMBULANCIA';
    ELSIF interna_cod = 'REPROGRAMACION' THEN
      IF sin_fh THEN
        nuevo_estado := 'PENDIENTE COORDINACION';
      ELSE
        nuevo_estado := 'TRAMITE COORDINADO SIN CONFIRMACION AMBULANCIA';
      END IF;
    ELSE
      RETURN NEW;
    END IF;
  ELSE
    RETURN NEW;
  END IF;

  IF nuevo_estado IS NULL THEN
    RETURN NEW;
  END IF;

  UPDATE public.referencia_interna
     SET estado = nuevo_estado,
         archivado = COALESCE(arch, archivado),
         updated_at = now()
   WHERE id = NEW.caso_id
     AND coalesce(archivado, false) = false;

  RETURN NEW;
END;
$function$;

-- 2) Inicio del ciclo vigente: último evento de reinicio estructurado.
CREATE OR REPLACE FUNCTION private.ri_ciclo_inicio(_caso_id uuid)
 RETURNS timestamptz
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT max(s.created_at)
    FROM public.seguimientos s
   WHERE s.caso_id = _caso_id
     AND upper(s.tipo_seguimiento) = 'NOVEDADES'
     AND (
       (s.detalles->>'externa_codigo') IN ('DESCOMPENSACION_HEMODINAMICA','AMBULANCIA_SIN_DISPONIBILIDAD')
       OR (s.detalles->>'interna_codigo') = 'REPROGRAMACION'
     );
$function$;

REVOKE ALL ON FUNCTION private.ri_ciclo_inicio(uuid) FROM PUBLIC, anon, authenticated;

-- 3) Allowlist de eventos: derivada del estado canónico + ciclo vigente.
CREATE OR REPLACE FUNCTION private.ri_paso_permitido(_caso_id uuid, _tipo_solicitud text, _proximo_tipo text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  ts   text := upper(coalesce(_tipo_solicitud, ''));
  prox text := upper(coalesce(_proximo_tipo, ''));
  esEspecial boolean;
  ultimo text;
  reset_at timestamptz;
  est text;
BEGIN
  IF prox = 'EXAMEN COORDINADO' THEN
    RETURN FALSE;
  END IF;

  -- Acciones transversales (no secuenciales).
  IF prox IN ('CAMBIO DE UNIDAD','OTRO','NOVEDADES',
              'CANCELACIÓN DEL TRÁMITE','CANCELACION DEL TRAMITE') THEN
    RETURN TRUE;
  END IF;

  esEspecial := ts IN (
    'URGENCIAS VITALES',
    'REMISIONES ESPECIALES',
    'EVACUACION DE SEDES AMBULATORIAS',
    'EVACUACIÓN DE SEDES AMBULATORIAS'
  );

  reset_at := private.ri_ciclo_inicio(_caso_id);

  IF esEspecial THEN
    SELECT upper(s.tipo_seguimiento) INTO ultimo
      FROM public.seguimientos s
     WHERE s.caso_id = _caso_id
       AND upper(s.tipo_seguimiento) NOT IN ('CAMBIO DE UNIDAD', 'OTRO', 'NOVEDADES')
       AND (reset_at IS NULL OR s.created_at > reset_at)
     ORDER BY s.created_at DESC
     LIMIT 1;

    IF ultimo IS NULL THEN
      RETURN prox IN ('ACTIVACION DE PROVEEDOR CONTRATADO DE TEP',
                      'ACTIVACIÓN DE PROVEEDOR CONTRATADO DE TEP');
    ELSIF ultimo IN ('ACTIVACION DE PROVEEDOR CONTRATADO DE TEP',
                     'ACTIVACIÓN DE PROVEEDOR CONTRATADO DE TEP') THEN
      RETURN prox = 'AMBULANCIA COORDINADA';
    ELSIF ultimo = 'AMBULANCIA COORDINADA' THEN
      RETURN prox IN ('CIERRE POR CULMINACIÓN DE SOLICITUD','CIERRE POR CULMINACION DE SOLICITUD');
    ELSE
      RETURN FALSE;
    END IF;
  END IF;

  -- Ruta estándar: el estado canónico manda.
  SELECT upper(btrim(coalesce(ri.estado,''))) INTO est
    FROM public.referencia_interna ri
   WHERE ri.id = _caso_id;

  IF est IN ('CERRADO POR CULMINACION DE SOLICITUD','CANCELADO') THEN
    RETURN FALSE;
  END IF;

  IF est IS NULL OR est = '' OR est = 'ACTIVO' OR est = 'PENDIENTE COORDINACION'
     OR est = 'PENDIENTE COORDINACIÓN' THEN
    RETURN prox LIKE 'PENDIENTE COORDINAC%EXAMEN'
        OR prox IN ('TRÁMITE COORDINADO','TRAMITE COORDINADO');
  ELSIF est LIKE 'TRAMITE COORDINADO%' OR est LIKE 'TRÁMITE COORDINADO%' THEN
    RETURN prox IN ('CONFIRMACIÓN DE PROGRAMACIÓN DE AMBULANCIA',
                    'CONFIRMACION DE PROGRAMACION DE AMBULANCIA');
  ELSIF est = 'AMBULANCIA PROGRAMADA' THEN
    IF prox IN ('CONFIRMACIÓN DE LLEGADA DE AMBULANCIA','CONFIRMACION DE LLEGADA DE AMBULANCIA') THEN
      -- La firma QR debe pertenecer al ciclo vigente.
      RETURN EXISTS (
        SELECT 1 FROM public.entrega_firmas ef
         WHERE ef.caso_id = _caso_id
           AND ef.tipo_caso = 'referencia_interna'
           AND ef.estado = 'FIRMADA'
           AND (reset_at IS NULL OR ef.firmado_at > reset_at)
      );
    END IF;
    RETURN FALSE;
  ELSIF est LIKE 'AMBULANCIA EN SITIO%' THEN
    RETURN prox IN ('CIERRE POR CULMINACIÓN DE SOLICITUD','CIERRE POR CULMINACION DE SOLICITUD');
  END IF;

  RETURN FALSE;
END;
$function$;

-- 4) Programación de ambulancia: empresa obligatoria y tipo canónico inmutable.
CREATE OR REPLACE FUNCTION private.seguimientos_ri_prog_amb_validate()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  ts text := upper(coalesce(NEW.tipo_seguimiento, ''));
  d jsonb := coalesce(NEW.detalles, '{}'::jsonb);
  empresa text;
  tipo_canon text;
BEGIN
  IF NEW.tipo_caso IS DISTINCT FROM 'referencia_interna' THEN
    RETURN NEW;
  END IF;
  IF ts NOT IN ('CONFIRMACIÓN DE PROGRAMACIÓN DE AMBULANCIA',
                'CONFIRMACION DE PROGRAMACION DE AMBULANCIA') THEN
    RETURN NEW;
  END IF;

  empresa := btrim(coalesce(d->>'empresa_ambulancia_nombre', ''));
  IF length(empresa) < 3 OR length(empresa) > 160 THEN
    RAISE EXCEPTION 'Empresa de ambulancia requerida (3-160 caracteres)'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT btrim(coalesce(ri.tipo_ambulancia, '')) INTO tipo_canon
    FROM public.referencia_interna ri
   WHERE ri.id = NEW.caso_id;

  -- El tipo de ambulancia proviene exclusivamente de la creación del caso.
  NEW.detalles := d
    || jsonb_build_object('empresa_ambulancia_nombre', empresa)
    || jsonb_build_object('tipo_ambulancia', nullif(tipo_canon, ''));

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_seguimientos_ri_prog_amb_validate ON public.seguimientos;
CREATE TRIGGER trg_seguimientos_ri_prog_amb_validate
BEFORE INSERT ON public.seguimientos
FOR EACH ROW EXECUTE FUNCTION private.seguimientos_ri_prog_amb_validate();