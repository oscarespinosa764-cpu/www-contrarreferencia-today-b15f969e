
-- =========================================================================
-- F7 · Etapa 1 · PHD/PAD/O2/Especiales
-- =========================================================================

-- 1) Extender domiciliarios con la nueva máquina de estados y campos ciclo
ALTER TABLE public.domiciliarios
  ADD COLUMN IF NOT EXISTS estado_ciclo TEXT,
  ADD COLUMN IF NOT EXISTS radicacion_estado TEXT,
  ADD COLUMN IF NOT EXISTS fecha_aceptacion TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS fecha_prevista_egreso DATE,
  ADD COLUMN IF NOT EXISTS egreso_mismo_dia BOOLEAN,
  ADD COLUMN IF NOT EXISTS fecha_egreso TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS fecha_cierre TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS motivo_cierre TEXT,
  ADD COLUMN IF NOT EXISTS ambulancia_obligatoria BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS fecha_coordinacion_ambulancia TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS proveedor_ambulancia TEXT,
  ADD COLUMN IF NOT EXISTS proveedor TEXT,
  ADD COLUMN IF NOT EXISTS fecha_ultima_evolucion TIMESTAMPTZ;

-- Backfill defensivo: casos existentes sin estado_ciclo -> PENDIENTE ACEPTACIÓN
UPDATE public.domiciliarios
   SET estado_ciclo = 'PENDIENTE ACEPTACION'
 WHERE estado_ciclo IS NULL;

-- 2) Tabla hija de radicaciones (historial)
CREATE TABLE IF NOT EXISTS public.phd_pad_o2_radicaciones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domiciliario_id UUID NOT NULL REFERENCES public.domiciliarios(id) ON DELETE CASCADE,
  eapb TEXT NOT NULL,
  canal TEXT NOT NULL,                 -- CORREO | PLATAFORMA | FISICO
  numero_radicado TEXT,
  fecha_radicacion TIMESTAMPTZ NOT NULL DEFAULT now(),
  soporte_url TEXT,
  observaciones TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_phd_rad_domi ON public.phd_pad_o2_radicaciones(domiciliario_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.phd_pad_o2_radicaciones TO authenticated;
GRANT ALL ON public.phd_pad_o2_radicaciones TO service_role;

ALTER TABLE public.phd_pad_o2_radicaciones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "phd_rad_select_activos"
  ON public.phd_pad_o2_radicaciones
  FOR SELECT
  TO authenticated
  USING (public.is_active_member(auth.uid()));

CREATE POLICY "phd_rad_insert_activos"
  ON public.phd_pad_o2_radicaciones
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_active_member(auth.uid()) AND created_by = auth.uid());

CREATE POLICY "phd_rad_update_activos"
  ON public.phd_pad_o2_radicaciones
  FOR UPDATE
  TO authenticated
  USING (public.is_active_member(auth.uid()))
  WITH CHECK (public.is_active_member(auth.uid()));

CREATE POLICY "phd_rad_delete_admin"
  ON public.phd_pad_o2_radicaciones
  FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_phd_rad_updated_at
  BEFORE UPDATE ON public.phd_pad_o2_radicaciones
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3) Config EAPB extendida en catalogos
ALTER TABLE public.catalogos
  ADD COLUMN IF NOT EXISTS eapb_correo_radicacion TEXT,
  ADD COLUMN IF NOT EXISTS eapb_sla_horas INTEGER,
  ADD COLUMN IF NOT EXISTS eapb_requisitos_radicacion TEXT;

-- 4) Validación de máquina de estados (trigger)
CREATE OR REPLACE FUNCTION public.domi_estado_gating()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  estados_permitidos TEXT[] := ARRAY[
    'PENDIENTE ACEPTACION',
    'ACEPTADO - PENDIENTE EGRESO',
    'ACEPTADO - PENDIENTE COORDINACION DE AMBULANCIA',
    'AMBULANCIA COORDINADA - PENDIENTE EGRESO',
    'CERRADO POR EGRESO',
    'CERRADO POR CANCELACION DEL PROVEEDOR',
    'CERRADO POR CANCELACION DE LA ESPECIALIDAD SOLICITANTE'
  ];
  terminales TEXT[] := ARRAY[
    'CERRADO POR EGRESO',
    'CERRADO POR CANCELACION DEL PROVEEDOR',
    'CERRADO POR CANCELACION DE LA ESPECIALIDAD SOLICITANTE'
  ];
  transiciones_validas TEXT[] := ARRAY[
    'PENDIENTE ACEPTACION->ACEPTADO - PENDIENTE EGRESO',
    'PENDIENTE ACEPTACION->ACEPTADO - PENDIENTE COORDINACION DE AMBULANCIA',
    'ACEPTADO - PENDIENTE EGRESO->ACEPTADO - PENDIENTE COORDINACION DE AMBULANCIA',
    'ACEPTADO - PENDIENTE EGRESO->CERRADO POR EGRESO',
    'ACEPTADO - PENDIENTE COORDINACION DE AMBULANCIA->AMBULANCIA COORDINADA - PENDIENTE EGRESO',
    'AMBULANCIA COORDINADA - PENDIENTE EGRESO->CERRADO POR EGRESO'
  ];
  trans TEXT;
BEGIN
  IF NEW.estado_ciclo IS NULL THEN
    NEW.estado_ciclo := 'PENDIENTE ACEPTACION';
  END IF;

  IF NOT (NEW.estado_ciclo = ANY(estados_permitidos)) THEN
    RAISE EXCEPTION 'Estado_ciclo no válido: %', NEW.estado_ciclo
      USING ERRCODE = 'check_violation';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.estado_ciclo <> 'PENDIENTE ACEPTACION' THEN
      RAISE EXCEPTION 'Todo caso nuevo debe iniciar en PENDIENTE ACEPTACION'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE
  IF OLD.estado_ciclo IS NOT DISTINCT FROM NEW.estado_ciclo THEN
    RETURN NEW;
  END IF;

  IF OLD.estado_ciclo = ANY(terminales) THEN
    RAISE EXCEPTION 'No se puede modificar el estado desde un estado terminal (%).', OLD.estado_ciclo
      USING ERRCODE = 'check_violation';
  END IF;

  -- Cancelaciones permitidas desde cualquier estado activo
  IF NEW.estado_ciclo IN (
       'CERRADO POR CANCELACION DEL PROVEEDOR',
       'CERRADO POR CANCELACION DE LA ESPECIALIDAD SOLICITANTE'
     ) THEN
    RETURN NEW;
  END IF;

  trans := OLD.estado_ciclo || '->' || NEW.estado_ciclo;
  IF NOT (trans = ANY(transiciones_validas)) THEN
    RAISE EXCEPTION 'Transición no permitida: % -> %', OLD.estado_ciclo, NEW.estado_ciclo
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_domi_estado_gating ON public.domiciliarios;
CREATE TRIGGER trg_domi_estado_gating
  BEFORE INSERT OR UPDATE OF estado_ciclo ON public.domiciliarios
  FOR EACH ROW EXECUTE FUNCTION public.domi_estado_gating();
