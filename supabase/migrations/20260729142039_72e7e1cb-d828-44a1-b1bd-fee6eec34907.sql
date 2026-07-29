-- Fase 5C · Bloque B3.1 — Reclasificación de DESCOMPENSACIÓN HEMODINÁMICA
-- como novedad EXTERNA y reinicio del ciclo operativo de Referencias Internas.

-- 1) Trigger de validación: mueve DESCOMPENSACION_HEMODINAMICA de INTERNA a
--    EXTERNA en la allowlist de creación nueva. Los históricos no se modifican
--    (el trigger es BEFORE INSERT, no aplica a filas existentes).
CREATE OR REPLACE FUNCTION private.seguimientos_ri_novedades_validate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  tipo text := upper(coalesce(NEW.tipo_seguimiento, ''));
  d jsonb := NEW.detalles;
  cats jsonb;
  motivos jsonb;
  arr_len int;
  interna_cod text;
  externa_cod text;
  pacfam text;
  ri_evento text;
  cual text;
  fh text;
BEGIN
  IF NEW.tipo_caso IS DISTINCT FROM 'referencia_interna' THEN
    RETURN NEW;
  END IF;
  IF tipo NOT IN ('OTRO', 'NOVEDADES') THEN
    RETURN NEW;
  END IF;
  IF d IS NULL OR jsonb_typeof(d) <> 'object' THEN
    RAISE EXCEPTION 'Detalles requeridos para % en Referencia Interna', tipo
      USING ERRCODE = 'check_violation';
  END IF;

  IF tipo = 'OTRO' THEN
    ri_evento := d->>'ri_evento';
    IF ri_evento IS DISTINCT FROM 'OTRO' THEN
      RAISE EXCEPTION 'ri_evento inválido para OTRO' USING ERRCODE = 'check_violation';
    END IF;
    cual := btrim(coalesce(d->>'cual', ''));
    IF length(cual) < 3 OR length(cual) > 200 THEN
      RAISE EXCEPTION 'Campo ¿CUÁL? debe tener entre 3 y 200 caracteres' USING ERRCODE = 'check_violation';
    END IF;
    IF length(coalesce(d->>'observaciones', '')) > 1000 THEN
      RAISE EXCEPTION 'Observaciones exceden 1000 caracteres' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  -- NOVEDADES
  ri_evento := d->>'ri_evento';
  IF ri_evento IS DISTINCT FROM 'NOVEDADES' THEN
    RAISE EXCEPTION 'ri_evento inválido para NOVEDADES' USING ERRCODE = 'check_violation';
  END IF;

  cats := d->'categorias';
  IF cats IS NULL OR jsonb_typeof(cats) <> 'array' THEN
    RAISE EXCEPTION 'categorias debe ser un arreglo' USING ERRCODE = 'check_violation';
  END IF;
  arr_len := jsonb_array_length(cats);
  IF arr_len < 1 OR arr_len > 2 THEN
    RAISE EXCEPTION 'Debe seleccionar al menos INTERNA o EXTERNA' USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements_text(cats) v
    WHERE v NOT IN ('INTERNA','EXTERNA')
  ) THEN
    RAISE EXCEPTION 'categoria no permitida' USING ERRCODE = 'check_violation';
  END IF;

  interna_cod := d->>'interna_codigo';
  externa_cod := d->>'externa_codigo';
  pacfam := d->>'paciente_familiar_motivo';

  IF cats ? 'INTERNA' THEN
    -- B3.1: DESCOMPENSACION_HEMODINAMICA sale de la allowlist INTERNA.
    IF interna_cod IS NULL OR interna_cod NOT IN (
      'EQUIPO_FALLA','REPROGRAMACION','NO_DISPONIBILIDAD_TECNICO'
    ) THEN
      RAISE EXCEPTION 'interna_codigo no permitido' USING ERRCODE = 'check_violation';
    END IF;
    IF interna_cod = 'REPROGRAMACION' THEN
      motivos := d->'reprogramacion_motivos';
      IF motivos IS NULL OR jsonb_typeof(motivos) <> 'array' OR jsonb_array_length(motivos) < 1 THEN
        RAISE EXCEPTION 'reprogramacion_motivos requerido' USING ERRCODE = 'check_violation';
      END IF;
      IF EXISTS (
        SELECT 1 FROM jsonb_array_elements_text(motivos) v
        WHERE v NOT IN ('RETRASO_AGENDA','IMPOSIBILIDAD_TOMA_EXAMEN_PREVIO')
      ) THEN
        RAISE EXCEPTION 'motivo de reprogramacion no permitido' USING ERRCODE = 'check_violation';
      END IF;
      fh := d->>'fecha_hora_reprogramada';
      IF fh IS NOT NULL AND fh <> '' THEN
        BEGIN
          PERFORM fh::timestamptz;
        EXCEPTION WHEN others THEN
          RAISE EXCEPTION 'fecha_hora_reprogramada inválida' USING ERRCODE = 'check_violation';
        END;
      END IF;
    END IF;
  ELSE
    IF interna_cod IS NOT NULL THEN
      RAISE EXCEPTION 'interna_codigo presente sin categoria INTERNA' USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF cats ? 'EXTERNA' THEN
    -- B3.1: DESCOMPENSACION_HEMODINAMICA se admite en la allowlist EXTERNA.
    IF externa_cod IS NULL OR externa_cod NOT IN (
      'AMBULANCIA_SIN_DISPONIBILIDAD','RED_NO_CONTRATADA','NO_ACEPTACION_PACIENTE_FAMILIAR','DESCOMPENSACION_HEMODINAMICA'
    ) THEN
      RAISE EXCEPTION 'externa_codigo no permitido' USING ERRCODE = 'check_violation';
    END IF;
    IF externa_cod = 'NO_ACEPTACION_PACIENTE_FAMILIAR' THEN
      IF pacfam IS NULL OR pacfam NOT IN (
        'ADULTO_MAYOR_SIN_ACOMPANANTE','FAMILIAR_NO_PERMITE_TRASLADO'
      ) THEN
        RAISE EXCEPTION 'paciente_familiar_motivo requerido y de la lista' USING ERRCODE = 'check_violation';
      END IF;
    ELSE
      IF pacfam IS NOT NULL THEN
        RAISE EXCEPTION 'paciente_familiar_motivo solo aplica a NO_ACEPTACION_PACIENTE_FAMILIAR' USING ERRCODE = 'check_violation';
      END IF;
    END IF;
  ELSE
    IF externa_cod IS NOT NULL THEN
      RAISE EXCEPTION 'externa_codigo presente sin categoria EXTERNA' USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF length(coalesce(d->>'observaciones', '')) > 1000 THEN
    RAISE EXCEPTION 'Observaciones exceden 1000 caracteres' USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$function$;

-- 2) Gating server-side: la novedad EXTERNA "DESCOMPENSACIÓN HEMODINÁMICA"
--    actúa como evento de reinicio del ciclo. El "último paso secuencial" se
--    calcula considerando solo eventos POSTERIORES al último reinicio; si no
--    hay ninguno posterior, el próximo paso permitido vuelve al inicio.
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
BEGIN
  IF prox = 'EXAMEN COORDINADO' THEN
    RETURN FALSE;
  END IF;

  IF prox = 'CAMBIO DE UNIDAD'
     OR prox = 'CIERRE POR CULMINACIÓN DE SOLICITUD'
     OR prox = 'CIERRE POR CULMINACION DE SOLICITUD'
     OR prox = 'CANCELACIÓN DEL TRÁMITE'
     OR prox = 'CANCELACION DEL TRAMITE'
     OR prox = 'OTRO'
     OR prox = 'NOVEDADES' THEN
    RETURN TRUE;
  END IF;

  esEspecial := ts IN (
    'URGENCIAS VITALES',
    'REMISIONES ESPECIALES',
    'EVACUACION DE SEDES AMBULATORIAS',
    'EVACUACIÓN DE SEDES AMBULATORIAS'
  );

  -- Último evento de reinicio: NOVEDADES con externa DESCOMPENSACION_HEMODINAMICA.
  SELECT max(s.created_at) INTO reset_at
    FROM public.seguimientos s
   WHERE s.caso_id = _caso_id
     AND upper(s.tipo_seguimiento) = 'NOVEDADES'
     AND (s.detalles->>'externa_codigo') = 'DESCOMPENSACION_HEMODINAMICA';

  -- Último paso secuencial POSTERIOR al reinicio (si lo hay).
  SELECT upper(s.tipo_seguimiento) INTO ultimo
    FROM public.seguimientos s
   WHERE s.caso_id = _caso_id
     AND upper(s.tipo_seguimiento) NOT IN ('CAMBIO DE UNIDAD', 'OTRO', 'NOVEDADES')
     AND (reset_at IS NULL OR s.created_at > reset_at)
   ORDER BY s.created_at DESC
   LIMIT 1;

  IF esEspecial THEN
    IF ultimo IS NULL THEN
      RETURN prox = 'ACTIVACION DE PROVEEDOR CONTRATADO DE TEP'
          OR prox = 'ACTIVACIÓN DE PROVEEDOR CONTRATADO DE TEP';
    ELSIF ultimo IN ('ACTIVACION DE PROVEEDOR CONTRATADO DE TEP',
                     'ACTIVACIÓN DE PROVEEDOR CONTRATADO DE TEP') THEN
      RETURN prox = 'AMBULANCIA COORDINADA';
    ELSIF ultimo = 'AMBULANCIA COORDINADA' THEN
      RETURN prox = 'CULMINACIÓN DE SOLICITUD' OR prox = 'CULMINACION DE SOLICITUD';
    ELSE
      RETURN FALSE;
    END IF;
  ELSE
    IF ultimo IS NULL THEN
      RETURN prox IN (
        'PENDIENTE COORDINACIÓN FECHA Y HORA EXAMEN',
        'PENDIENTE COORDINACION FECHA Y HORA EXAMEN',
        'PENDIENTE COORDINACIÓN FECHA Y HORA DE EXAMEN',
        'PENDIENTE COORDINACION FECHA Y HORA DE EXAMEN'
      );
    ELSIF ultimo LIKE 'PENDIENTE COORDINAC%EXAMEN' THEN
      RETURN prox IN (
        'CONFIRMACIÓN DE PROGRAMACIÓN DE AMBULANCIA',
        'CONFIRMACION DE PROGRAMACION DE AMBULANCIA'
      );
    ELSIF ultimo = 'EXAMEN COORDINADO' THEN
      RETURN prox IN (
        'CONFIRMACIÓN DE PROGRAMACIÓN DE AMBULANCIA',
        'CONFIRMACION DE PROGRAMACION DE AMBULANCIA'
      );
    ELSIF ultimo LIKE 'CONFIRMACI%N DE PROGRAMACI%N DE AMBULANCIA' THEN
      IF prox IN (
        'CONFIRMACIÓN DE LLEGADA DE AMBULANCIA',
        'CONFIRMACION DE LLEGADA DE AMBULANCIA'
      ) THEN
        -- La firma QR debe pertenecer al ciclo vigente (posterior al reinicio).
        RETURN EXISTS (
          SELECT 1 FROM public.entrega_firmas ef
           WHERE ef.caso_id = _caso_id
             AND ef.tipo_caso = 'referencia_interna'
             AND ef.estado = 'FIRMADA'
             AND (reset_at IS NULL OR ef.firmado_at > reset_at)
        );
      END IF;
      RETURN FALSE;
    ELSIF ultimo LIKE 'CONFIRMACI%N DE LLEGADA DE AMBULANCIA' THEN
      RETURN prox IN (
        'CIERRE POR CULMINACIÓN DE SOLICITUD',
        'CIERRE POR CULMINACION DE SOLICITUD'
      );
    ELSE
      RETURN FALSE;
    END IF;
  END IF;
END;
$function$;