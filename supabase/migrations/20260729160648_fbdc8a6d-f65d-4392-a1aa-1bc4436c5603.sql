-- ============================================================================
-- FASE 5C · B1.2B — Server-authoritative RI state application.
-- El cliente inserta el seguimiento; este trigger calcula y escribe el estado
-- canónico oficial de referencia_interna en la misma transacción. Los guards
-- BEFORE INSERT ya validan el payload; este AFTER INSERT no confía en el
-- cliente para el estado.
-- ============================================================================
CREATE OR REPLACE FUNCTION private.seguimientos_ri_estado_apply()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
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

  -- Acciones que conservan estado (no tocan el caso).
  IF ts IN ('CAMBIO DE UNIDAD', 'OTRO') THEN
    RETURN NEW;
  END IF;

  -- Terminales.
  IF ts IN ('CANCELACIÓN DEL TRÁMITE','CANCELACION DEL TRAMITE') THEN
    nuevo_estado := 'CANCELADO';
    arch := true;
  ELSIF ts IN ('CIERRE POR CULMINACIÓN DE SOLICITUD','CIERRE POR CULMINACION DE SOLICITUD') THEN
    nuevo_estado := 'CERRADO POR CULMINACION DE SOLICITUD';
    arch := true;

  -- Pasos principales del ciclo.
  ELSIF ts IN ('TRÁMITE COORDINADO','TRAMITE COORDINADO','EXAMEN COORDINADO') THEN
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

  -- NOVEDADES: solo algunos códigos alteran el estado.
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
      -- EQUIPO_FALLA / NO_DISPONIBILIDAD_TECNICO / RED_NO_CONTRATADA / NO_ACEPTACION histórico
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
$$;

DROP TRIGGER IF EXISTS trg_seguimientos_ri_estado ON public.seguimientos;
CREATE TRIGGER trg_seguimientos_ri_estado
  AFTER INSERT ON public.seguimientos
  FOR EACH ROW EXECUTE FUNCTION private.seguimientos_ri_estado_apply();