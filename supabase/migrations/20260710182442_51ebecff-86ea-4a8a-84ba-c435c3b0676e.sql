ALTER TABLE public.catalogos
  ADD COLUMN IF NOT EXISTS seguimientos_en_plataforma boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.catalogos.seguimientos_en_plataforma IS
  'Solo EAPB: indica si los SEGUIMIENTOS (evoluciones) se registran en la plataforma de la entidad. Independiente de extra1 (tiene plataforma para radicar) y extra2 (genera radicado). Default false = NO.';