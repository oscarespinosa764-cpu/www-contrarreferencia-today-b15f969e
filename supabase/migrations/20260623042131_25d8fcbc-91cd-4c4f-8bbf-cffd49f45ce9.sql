-- Catálogo EAPB/ERP: indicadores de generación de radicado por tipo de solicitud especial
ALTER TABLE public.catalogos
  ADD COLUMN IF NOT EXISTS radica_phd boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS radica_pad boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS radica_oxigeno boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS radica_unidad_especial boolean NOT NULL DEFAULT false;

-- PHD/PAD/O2/Especiales
ALTER TABLE public.domiciliarios
  ADD COLUMN IF NOT EXISTS tipo_ambulancia text,
  ADD COLUMN IF NOT EXISTS eapb_tiene_plataforma boolean,
  ADD COLUMN IF NOT EXISTS eapb_genera_codigo boolean,
  ADD COLUMN IF NOT EXISTS plataforma_funcionando boolean,
  ADD COLUMN IF NOT EXISTS ips_receptora text,
  ADD COLUMN IF NOT EXISTS trazabilidad_indigo text,
  ADD COLUMN IF NOT EXISTS tipo_tramite text,
  ADD COLUMN IF NOT EXISTS tipo_solicitud_detalle text;

-- Referencia interna: EAPB / ERP
ALTER TABLE public.referencia_interna
  ADD COLUMN IF NOT EXISTS eapb text;

-- Pendientes: detalles flexibles (tipo de destino, "cuál", evolución pendiente, cumplimiento)
ALTER TABLE public.pendientes
  ADD COLUMN IF NOT EXISTS detalles jsonb;