CREATE INDEX IF NOT EXISTS idx_historicos_casos_activos_recientes
  ON public.historicos_casos (archivado, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_historicos_casos_seccion
  ON public.historicos_casos (seccion) WHERE archivado = false;

CREATE INDEX IF NOT EXISTS idx_historicos_casos_documento
  ON public.historicos_casos (documento) WHERE archivado = false;