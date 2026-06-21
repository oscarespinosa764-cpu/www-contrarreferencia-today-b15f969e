-- Trazabilidad ÍNDIGO: columnas aditivas en remisiones (todas nullable)
ALTER TABLE public.remisiones
  ADD COLUMN IF NOT EXISTS eapb text,
  ADD COLUMN IF NOT EXISTS alcance_red text,
  ADD COLUMN IF NOT EXISTS ips_red_local text,
  ADD COLUMN IF NOT EXISTS departamentos_red_nacional text,
  ADD COLUMN IF NOT EXISTS eapb_tiene_plataforma boolean,
  ADD COLUMN IF NOT EXISTS eapb_genera_codigo boolean,
  ADD COLUMN IF NOT EXISTS plataforma_funcionando boolean,
  ADD COLUMN IF NOT EXISTS trazabilidad_indigo text;

-- Seed de catálogos nuevos (no destructivo)
INSERT INTO public.catalogos (tipo, valor, activo)
SELECT v.tipo, v.valor, true
FROM (VALUES
  ('TIPO_TRAMITE', 'Remisión asistencial normal'),
  ('TIPO_TRAMITE', 'Remisión por trámite administrativo cancelable'),
  ('TIPO_TRAMITE', 'Remisión asistencial por SOAT'),
  ('TIPO_TRAMITE', 'Remisión asistencial normal con falla de plataforma'),
  ('IPS_LOCAL', 'Clínica Medilaser Florencia'),
  ('IPS_LOCAL', 'Hospital María Inmaculada Florencia'),
  ('DEPARTAMENTO', 'Huila'),
  ('DEPARTAMENTO', 'Tolima'),
  ('DEPARTAMENTO', 'Cundinamarca'),
  ('DEPARTAMENTO', 'Nariño'),
  ('DEPARTAMENTO', 'Cauca'),
  ('DEPARTAMENTO', 'Valle del Cauca'),
  ('DEPARTAMENTO', 'Atlántico'),
  ('DEPARTAMENTO', 'Antioquia')
) AS v(tipo, valor)
WHERE NOT EXISTS (
  SELECT 1 FROM public.catalogos c WHERE c.tipo = v.tipo AND c.valor = v.valor
);