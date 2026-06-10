ALTER TABLE public.seguimientos
  ADD COLUMN IF NOT EXISTS estado_solicitud text,
  ADD COLUMN IF NOT EXISTS nombre_contacto text,
  ADD COLUMN IF NOT EXISTS telefono text;