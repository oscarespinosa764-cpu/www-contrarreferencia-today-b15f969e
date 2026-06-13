ALTER TABLE public.plantillas
  ADD COLUMN IF NOT EXISTS pasos text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS condicion text;