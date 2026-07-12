ALTER TABLE public.reglas_coordinacion
  ADD COLUMN notificar_externo boolean NOT NULL DEFAULT false,
  ADD COLUMN canales text[] NOT NULL DEFAULT '{}',
  ADD COLUMN requiere_crue boolean NOT NULL DEFAULT false;