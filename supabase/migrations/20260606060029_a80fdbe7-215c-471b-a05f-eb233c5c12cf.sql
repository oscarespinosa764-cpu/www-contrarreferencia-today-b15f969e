-- Columnas para trazabilidad del reinicio de evolución por turno
ALTER TABLE public.remisiones ADD COLUMN IF NOT EXISTS evolucion_actualizada_at timestamptz;
ALTER TABLE public.remisiones ADD COLUMN IF NOT EXISTS evolucion_motivo text;
ALTER TABLE public.domiciliarios ADD COLUMN IF NOT EXISTS evolucion_actualizada_at timestamptz;
ALTER TABLE public.domiciliarios ADD COLUMN IF NOT EXISTS evolucion_motivo text;
ALTER TABLE public.referencia_interna ADD COLUMN IF NOT EXISTS evolucion_actualizada_at timestamptz;
ALTER TABLE public.referencia_interna ADD COLUMN IF NOT EXISTS evolucion_motivo text;

-- Vincular pendientes con el caso de origen para automatizar su creación/eliminación
ALTER TABLE public.pendientes ADD COLUMN IF NOT EXISTS caso_id uuid;
ALTER TABLE public.pendientes ADD COLUMN IF NOT EXISTS tipo_caso text;
ALTER TABLE public.pendientes ADD COLUMN IF NOT EXISTS origen text;

-- Registro del cierre/entrega de turno (base del PDF y disparador del reinicio)
CREATE TABLE IF NOT EXISTS public.entregas_turno (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  turno text NOT NULL,
  entrega_por uuid,
  entrega_nombre text,
  recibe_por uuid,
  recibe_nombre text,
  reinicio_evolucion boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.entregas_turno TO authenticated;
GRANT ALL ON public.entregas_turno TO service_role;

ALTER TABLE public.entregas_turno ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Entregas: miembros activos ven"
  ON public.entregas_turno FOR SELECT
  USING (is_active_member(auth.uid()));

CREATE POLICY "Entregas: editores crean"
  ON public.entregas_turno FOR INSERT
  WITH CHECK (can_edit(auth.uid()));

CREATE POLICY "Entregas: editores actualizan"
  ON public.entregas_turno FOR UPDATE
  USING (can_edit(auth.uid()));

CREATE POLICY "Entregas: admin elimina"
  ON public.entregas_turno FOR DELETE
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_entregas_turno_updated_at
  BEFORE UPDATE ON public.entregas_turno
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();