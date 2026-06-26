ALTER TABLE public.red_operativa
  ADD COLUMN IF NOT EXISTS tipo_red text,
  ADD COLUMN IF NOT EXISTS disponible_para_remisiones boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS jornada text,
  ADD COLUMN IF NOT EXISTS horario text,
  ADD COLUMN IF NOT EXISTS novedad_disponibilidad text,
  ADD COLUMN IF NOT EXISTS fecha_actualizacion_disponibilidad timestamptz,
  ADD COLUMN IF NOT EXISTS usuario_actualizacion uuid,
  ADD COLUMN IF NOT EXISTS codigo_principal text,
  ADD COLUMN IF NOT EXISTS codigo_alterno text,
  ADD COLUMN IF NOT EXISTS contacto_principal text,
  ADD COLUMN IF NOT EXISTS direccion text,
  ADD COLUMN IF NOT EXISTS tipo_apoyo text,
  ADD COLUMN IF NOT EXISTS sede text,
  ADD COLUMN IF NOT EXISTS relaciones_red jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS codigos_apoyo jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Asigna un tipo de red seguro a registros previos sin clasificar.
UPDATE public.red_operativa
  SET tipo_red = 'ips_departamental'
  WHERE tipo_red IS NULL;

-- Carga inicial NO destructiva desde el catálogo de IPS existente.
INSERT INTO public.red_operativa
  (entidad, ciudad, departamento, telefono, tipo_red, estado, disponible_para_remisiones, archivado)
SELECT
  c.valor,
  NULLIF(trim(split_part(split_part(c.extra1, ';', 1), ' - ', 1)), ''),
  NULLIF(trim(split_part(split_part(c.extra1, ';', 1), ' - ', 2)), ''),
  c.extra2,
  'ips_departamental',
  CASE WHEN c.activo THEN 'activo' ELSE 'inactivo' END,
  COALESCE(c.activo, false),
  false
FROM public.catalogos c
WHERE c.tipo ILIKE 'ips'
  AND NOT EXISTS (
    SELECT 1 FROM public.red_operativa r
    WHERE lower(coalesce(r.entidad, '')) = lower(c.valor)
  );