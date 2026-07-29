-- Fase 5D · Bloque A — Sincronización server-authoritative del ciclo de
-- PHD / PAD / O2 / Especiales (public.domiciliarios).
--
-- Causa raíz: `avanzarEstadoCiclo` escribía `estado_ciclo` pero nunca
-- `archivado`, `fecha_cierre` ni `estado`. El listado activo filtra por
-- `archivado = false` y las tarjetas agrupan por `estado`, por lo que un caso
-- CERRADO POR EGRESO seguía visible como "PENDIENTE ACEPTACION".

CREATE OR REPLACE FUNCTION private.domi_estado_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  terminales TEXT[] := ARRAY[
    'CERRADO POR EGRESO',
    'CERRADO POR CANCELACION DEL PROVEEDOR',
    'CERRADO POR CANCELACION DE LA ESPECIALIDAD SOLICITANTE'
  ];
  es_terminal BOOLEAN;
BEGIN
  IF NEW.estado_ciclo IS NULL THEN
    NEW.estado_ciclo := 'PENDIENTE ACEPTACION';
  END IF;

  es_terminal := NEW.estado_ciclo = ANY(terminales);

  -- El estado visible del caso SIEMPRE refleja el estado del ciclo.
  NEW.estado := NEW.estado_ciclo;

  IF es_terminal THEN
    NEW.archivado := TRUE;
    IF NEW.fecha_cierre IS NULL THEN
      NEW.fecha_cierre := now();
    END IF;
    IF NEW.estado_ciclo = 'CERRADO POR EGRESO' AND NEW.fecha_egreso IS NULL THEN
      NEW.fecha_egreso := now();
    END IF;
    IF NEW.estado_ciclo <> 'CERRADO POR EGRESO' AND NEW.motivo_cierre IS NULL THEN
      NEW.motivo_cierre := NEW.estado_ciclo;
    END IF;
  ELSE
    -- Reactivación administrativa: el caso vuelve al listado activo.
    IF TG_OP = 'UPDATE'
       AND OLD.estado_ciclo IS DISTINCT FROM NEW.estado_ciclo
       AND OLD.estado_ciclo = ANY(terminales) THEN
      NEW.archivado := FALSE;
      NEW.fecha_cierre := NULL;
      NEW.motivo_cierre := NULL;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.domi_estado_sync() FROM PUBLIC, anon, authenticated;

-- El nombre 'zz_' garantiza que se ejecuta DESPUÉS de trg_domi_estado_gating
-- (PostgreSQL dispara los triggers del mismo evento en orden alfabético).
DROP TRIGGER IF EXISTS zz_domi_estado_sync ON public.domiciliarios;
CREATE TRIGGER zz_domi_estado_sync
BEFORE INSERT OR UPDATE ON public.domiciliarios
FOR EACH ROW EXECUTE FUNCTION private.domi_estado_sync();

-- Backfill idempotente: casos ya cerrados que seguían activos.
UPDATE public.domiciliarios
   SET archivado    = TRUE,
       estado       = estado_ciclo,
       fecha_cierre = COALESCE(fecha_cierre, updated_at, now()),
       fecha_egreso = CASE
                        WHEN estado_ciclo = 'CERRADO POR EGRESO'
                        THEN COALESCE(fecha_egreso, updated_at, now())
                        ELSE fecha_egreso
                      END
 WHERE estado_ciclo IN (
         'CERRADO POR EGRESO',
         'CERRADO POR CANCELACION DEL PROVEEDOR',
         'CERRADO POR CANCELACION DE LA ESPECIALIDAD SOLICITANTE'
       )
   AND COALESCE(archivado, FALSE) = FALSE;

-- Backfill: casos activos cuyo `estado` visible estaba desincronizado.
UPDATE public.domiciliarios
   SET estado = estado_ciclo
 WHERE COALESCE(archivado, FALSE) = FALSE
   AND estado IS DISTINCT FROM estado_ciclo;