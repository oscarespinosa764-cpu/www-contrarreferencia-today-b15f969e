
-- =========================================================================
-- Fase 3 — Categorías de catálogos administrables
-- Metadatos de organización. NO toca public.catalogos ni sus elementos.
-- =========================================================================

-- A. Tabla de categorías
CREATE TABLE IF NOT EXISTS public.catalogo_categorias (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  codigo TEXT NOT NULL,
  nombre TEXT NOT NULL,
  descripcion TEXT,
  icono TEXT NOT NULL DEFAULT 'package',
  orden INTEGER NOT NULL DEFAULT 0,
  activo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id),
  CONSTRAINT catalogo_categorias_codigo_key UNIQUE (codigo),
  CONSTRAINT catalogo_categorias_nombre_check CHECK (btrim(nombre) <> ''),
  CONSTRAINT catalogo_categorias_codigo_check CHECK (codigo ~ '^[A-Z0-9_]+$')
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.catalogo_categorias TO authenticated;
GRANT ALL ON public.catalogo_categorias TO service_role;

ALTER TABLE public.catalogo_categorias ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cat_cat_read_auth" ON public.catalogo_categorias
  FOR SELECT TO authenticated
  USING (public.is_active_member(auth.uid()));

CREATE POLICY "cat_cat_write_admin" ON public.catalogo_categorias
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_cat_cat_updated
  BEFORE UPDATE ON public.catalogo_categorias
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- B. Tabla de metadatos de tipos
CREATE TABLE IF NOT EXISTS public.catalogo_tipos (
  tipo TEXT NOT NULL PRIMARY KEY,
  nombre_visible TEXT NOT NULL,
  descripcion TEXT,
  categoria_id UUID NOT NULL REFERENCES public.catalogo_categorias(id) ON DELETE RESTRICT,
  orden INTEGER NOT NULL DEFAULT 0,
  activo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id),
  CONSTRAINT catalogo_tipos_tipo_check CHECK (tipo ~ '^[A-Z0-9_]+$'),
  CONSTRAINT catalogo_tipos_nombre_check CHECK (btrim(nombre_visible) <> '')
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.catalogo_tipos TO authenticated;
GRANT ALL ON public.catalogo_tipos TO service_role;

ALTER TABLE public.catalogo_tipos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cat_tipos_read_auth" ON public.catalogo_tipos
  FOR SELECT TO authenticated
  USING (public.is_active_member(auth.uid()));

CREATE POLICY "cat_tipos_write_admin" ON public.catalogo_tipos
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_cat_tipos_updated
  BEFORE UPDATE ON public.catalogo_tipos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_cat_tipos_categoria ON public.catalogo_tipos(categoria_id);

-- C. Semilla de categorías (idempotente)
INSERT INTO public.catalogo_categorias (codigo, nombre, descripcion, icono, orden)
VALUES
  ('REMISIONES', 'Remisiones', 'IPS, EAPB, especialidades, médicos, trámites y entregas.', 'layers', 10),
  ('AMBULANCIAS', 'Ambulancias', 'Empresas TEP, placas, unidades y unidades requeridas.', 'truck', 20),
  ('MOTIVOS', 'Motivos', 'Motivos de cancelación y negación.', 'ban', 30),
  ('TALENTO_HUMANO', 'Talento Humano', 'Motivos de permiso del cuadro de turno.', 'users', 40),
  ('OTROS', 'Otros', 'Catálogos operativos sin módulo asignado.', 'package', 90)
ON CONFLICT (codigo) DO NOTHING;

-- D. Semilla de metadatos de tipos (idempotente)
-- Mapea el hardcode actual + todos los tipos existentes en public.catalogos
WITH cats AS (
  SELECT codigo, id FROM public.catalogo_categorias
),
hardcode(tipo, nombre_visible, cat_codigo, ord) AS (
  VALUES
    ('IPS', 'IPS / Red', 'REMISIONES', 10),
    ('IPS_LOCAL', 'IPS red local', 'REMISIONES', 20),
    ('DEPARTAMENTO', 'Departamentos', 'REMISIONES', 30),
    ('EAPB', 'EAPB / Aseguradoras', 'REMISIONES', 40),
    ('ESPECIALIDAD', 'Especialidades', 'REMISIONES', 50),
    ('MEDICO', 'Médicos / Profesionales', 'REMISIONES', 60),
    ('REGIMEN', 'Regímenes', 'REMISIONES', 70),
    ('TIPO_TRAMITE', 'Tipos de trámite', 'REMISIONES', 80),
    ('DOC_ENTREGA', 'Documentos de entrega', 'REMISIONES', 90),
    ('EMPRESA_TEP', 'Empresas TEP', 'AMBULANCIAS', 10),
    ('PLACA', 'Placas', 'AMBULANCIAS', 20),
    ('UNIDAD', 'Unidades', 'AMBULANCIAS', 30),
    ('UNIDAD_REQUERIDA', 'Unidades requeridas', 'AMBULANCIAS', 40),
    ('MOTIVO_CANCELACION', 'Motivos de cancelación', 'MOTIVOS', 10),
    ('MOTIVO_NEG', 'Motivos de negación', 'MOTIVOS', 20),
    ('MOTIVO_PERMISO', 'Motivos de permiso', 'TALENTO_HUMANO', 10)
),
tipos_bd AS (
  SELECT DISTINCT tipo FROM public.catalogos
),
todos AS (
  SELECT h.tipo, h.nombre_visible, h.cat_codigo, h.ord
    FROM hardcode h
  UNION
  SELECT t.tipo, t.tipo, 'OTROS', 999
    FROM tipos_bd t
   WHERE NOT EXISTS (SELECT 1 FROM hardcode h WHERE h.tipo = t.tipo)
)
INSERT INTO public.catalogo_tipos (tipo, nombre_visible, categoria_id, orden)
SELECT t.tipo, t.nombre_visible, c.id, t.ord
  FROM todos t
  JOIN cats c ON c.codigo = t.cat_codigo
ON CONFLICT (tipo) DO NOTHING;
