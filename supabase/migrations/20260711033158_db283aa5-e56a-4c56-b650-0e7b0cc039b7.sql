-- Idempotencia de INGRESO: un cupo (cod_ref) solo puede tener un evento de ingreso.
-- Un segundo intento de confirmar ingreso será rechazado por la base de datos.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_ingreso_por_cupo
  ON public.casos_entrantes (cod_ref)
  WHERE tipo = 'ING' AND cod_ref IS NOT NULL;