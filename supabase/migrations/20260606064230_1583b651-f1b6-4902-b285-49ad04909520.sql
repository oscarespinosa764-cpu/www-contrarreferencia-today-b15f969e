ALTER TABLE public.referencia_interna
  ADD COLUMN IF NOT EXISTS fecha_inicio timestamptz,
  ADD COLUMN IF NOT EXISTS fecha_radicado timestamptz,
  ADD COLUMN IF NOT EXISTS tipo_documento text,
  ADD COLUMN IF NOT EXISTS tipo_ambulancia text;