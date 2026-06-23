-- Aditivo: clasificación de la entidad (EAPB/ERP) en el catálogo.
-- extra3 almacena el "Tipo de entidad" (EPS, ASEGURADORA, ARL, PREPAGADA, NO APLICA).
ALTER TABLE public.catalogos ADD COLUMN IF NOT EXISTS extra3 text;