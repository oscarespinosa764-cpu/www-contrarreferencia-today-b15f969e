ALTER TABLE public.remisiones
  ADD COLUMN IF NOT EXISTS tipo_documento text,
  ALTER COLUMN fecha_inicio TYPE timestamptz USING fecha_inicio::timestamptz,
  ALTER COLUMN fecha_radicado TYPE timestamptz USING fecha_radicado::timestamptz;