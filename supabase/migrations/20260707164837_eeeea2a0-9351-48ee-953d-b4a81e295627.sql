-- Ampliación aditiva de red_operativa para nuevos directorios (externos e interno CEDIM).
-- No destructivo: solo agrega columnas nuevas; reutiliza las existentes donde aplica.
ALTER TABLE public.red_operativa
  ADD COLUMN IF NOT EXISTS telefonos_alternos text,
  ADD COLUMN IF NOT EXISTS correos_alternos text,
  ADD COLUMN IF NOT EXISTS indicativo text,
  ADD COLUMN IF NOT EXISTS cobertura text,
  ADD COLUMN IF NOT EXISTS opcion_menu text,
  ADD COLUMN IF NOT EXISTS orden_visualizacion integer,
  ADD COLUMN IF NOT EXISTS tipo_recurso text,
  ADD COLUMN IF NOT EXISTS descripcion text;