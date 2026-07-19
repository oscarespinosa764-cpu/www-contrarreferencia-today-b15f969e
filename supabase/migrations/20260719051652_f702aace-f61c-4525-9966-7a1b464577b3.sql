-- Extiende entrega_firmas con los nuevos campos capturados en la página pública de firma QR.
-- No destructiva, additive-only. No cambia RLS ni políticas existentes.

ALTER TABLE public.entrega_firmas
  ADD COLUMN IF NOT EXISTS responsable_nombre TEXT,
  ADD COLUMN IF NOT EXISTS responsable_cargo TEXT,
  ADD COLUMN IF NOT EXISTS firmante_es_responsable BOOLEAN,
  ADD COLUMN IF NOT EXISTS tipo_ambulancia TEXT,
  ADD COLUMN IF NOT EXISTS empresa_declarada TEXT,
  ADD COLUMN IF NOT EXISTS empresa_declarada_motivo TEXT;

-- Actualiza el trigger de guarda para permitir escritura server-side (auth.uid IS NULL)
-- de estos nuevos campos por parte del flujo de firma QR anónimo. La lógica actual ya
-- exime a operaciones sin sesión, así que no requiere cambios adicionales al trigger.
