-- Función que decide si el próximo tipo de seguimiento está permitido para un caso de Referencia Interna.
CREATE OR REPLACE FUNCTION private.ri_paso_permitido(
  _caso_id uuid,
  _tipo_solicitud text,
  _proximo_tipo text
) RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  ts   text := upper(coalesce(_tipo_solicitud, ''));
  prox text := upper(coalesce(_proximo_tipo, ''));
  esEspecial boolean;
  ultimo text;
BEGIN
  -- CAMBIO DE UNIDAD siempre permitido (seguimiento independiente).
  IF prox = 'CAMBIO DE UNIDAD' THEN
    RETURN TRUE;
  END IF;

  esEspecial := ts IN (
    'URGENCIAS VITALES',
    'REMISIONES ESPECIALES',
    'EVACUACION DE SEDES AMBULATORIAS',
    'EVACUACIÓN DE SEDES AMBULATORIAS'
  );

  -- Último tipo registrado (excluye CAMBIO DE UNIDAD que no marca puntero).
  SELECT upper(s.tipo_seguimiento) INTO ultimo
    FROM public.seguimientos s
   WHERE s.caso_id = _caso_id
     AND upper(s.tipo_seguimiento) <> 'CAMBIO DE UNIDAD'
   ORDER BY s.created_at DESC
   LIMIT 1;

  IF esEspecial THEN
    -- Secuencia especial: TEP → COORDINADA → CULMINACION
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
    -- Secuencia general: PENDIENTE → COORDINADO → PROG AMB → LLEGADA AMB → CULMINACION
    IF ultimo IS NULL THEN
      RETURN prox IN (
        'PENDIENTE COORDINACIÓN FECHA Y HORA EXAMEN',
        'PENDIENTE COORDINACION FECHA Y HORA EXAMEN',
        'PENDIENTE COORDINACIÓN FECHA Y HORA DE EXAMEN',
        'PENDIENTE COORDINACION FECHA Y HORA DE EXAMEN'
      );
    ELSIF ultimo LIKE 'PENDIENTE COORDINAC%EXAMEN' THEN
      RETURN prox = 'EXAMEN COORDINADO';
    ELSIF ultimo = 'EXAMEN COORDINADO' THEN
      RETURN prox IN (
        'CONFIRMACIÓN DE PROGRAMACIÓN DE AMBULANCIA',
        'CONFIRMACION DE PROGRAMACION DE AMBULANCIA'
      );
    ELSIF ultimo LIKE 'CONFIRMACI%N DE PROGRAMACI%N DE AMBULANCIA' THEN
      RETURN prox IN (
        'CONFIRMACIÓN DE LLEGADA DE AMBULANCIA',
        'CONFIRMACION DE LLEGADA DE AMBULANCIA'
      );
    ELSIF ultimo LIKE 'CONFIRMACI%N DE LLEGADA DE AMBULANCIA' THEN
      RETURN prox = 'CULMINACIÓN DE SOLICITUD' OR prox = 'CULMINACION DE SOLICITUD';
    ELSE
      RETURN FALSE;
    END IF;
  END IF;
END;
$$;

-- Trigger BEFORE INSERT: valida gating solo para casos de referencia_interna.
CREATE OR REPLACE FUNCTION public.seguimientos_ri_gating()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  ts text;
BEGIN
  -- Solo aplica a Referencia Interna. Otras tablas no se validan aquí.
  IF NEW.caso_tabla IS DISTINCT FROM 'referencia_interna' THEN
    RETURN NEW;
  END IF;

  SELECT tipo_solicitud INTO ts
    FROM public.referencia_interna
   WHERE id = NEW.caso_id;

  IF ts IS NULL THEN
    RETURN NEW;
  END IF;

  IF NOT private.ri_paso_permitido(NEW.caso_id, ts, NEW.tipo_seguimiento) THEN
    RAISE EXCEPTION 'El seguimiento "%" no está permitido en este momento para la secuencia de Referencia Interna. Registre primero el paso previo.',
      NEW.tipo_seguimiento
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_seguimientos_ri_gating ON public.seguimientos;
CREATE TRIGGER trg_seguimientos_ri_gating
BEFORE INSERT ON public.seguimientos
FOR EACH ROW EXECUTE FUNCTION public.seguimientos_ri_gating();

REVOKE ALL ON FUNCTION public.seguimientos_ri_gating() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.ri_paso_permitido(uuid, text, text) FROM PUBLIC, anon, authenticated;