-- ============================================================================
-- Migración ADITIVA — Red/IPS + Cuadro de Turno (no destructiva)
-- No elimina datos, no toca login, roles ni RLS existentes.
-- ============================================================================

-- 1) RED OPERATIVA: campos adicionales para IPS / Ambulancias / Jornadas / Códigos TEP
ALTER TABLE public.red_operativa
  ADD COLUMN IF NOT EXISTS nit text,
  ADD COLUMN IF NOT EXISTS cargo_contacto text,
  ADD COLUMN IF NOT EXISTS eapb_aseguradoras text,
  ADD COLUMN IF NOT EXISTS ambito text,               -- 'caqueta' | 'nacional'
  ADD COLUMN IF NOT EXISTS empresa_tep text,
  ADD COLUMN IF NOT EXISTS cups_descripcion text,
  ADD COLUMN IF NOT EXISTS vigencia_desde date,
  ADD COLUMN IF NOT EXISTS vigencia_hasta date,
  ADD COLUMN IF NOT EXISTS recorrido text;

-- 2) SHIFT TYPES: catálogo enriquecido de turnos predefinidos
ALTER TABLE public.shift_types
  ADD COLUMN IF NOT EXISTS abbr text,
  ADD COLUMN IF NOT EXISTS icon text,
  ADD COLUMN IF NOT EXISTS sums_hours boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'laboral',
  ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 100;

-- 3) MIEMBROS DEL CUADRO: unidad funcional
ALTER TABLE public.shift_schedule_members
  ADD COLUMN IF NOT EXISTS unidad_funcional text;

-- 4) DÍAS DEL CUADRO: unidad funcional aplicada por plantilla (opcional)
ALTER TABLE public.shift_schedule_days
  ADD COLUMN IF NOT EXISTS unidad_funcional text;