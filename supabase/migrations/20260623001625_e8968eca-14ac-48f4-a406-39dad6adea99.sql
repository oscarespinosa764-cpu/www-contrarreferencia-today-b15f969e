-- Campos flexibles para el modal de seguimientos salientes.
-- Aditivo y no destructivo: no se eliminan ni renombran columnas existentes.
ALTER TABLE public.seguimientos
  ADD COLUMN IF NOT EXISTS plantilla_indigo text,
  ADD COLUMN IF NOT EXISTS detalles jsonb;