-- ==========================================================
-- Fase 12 · Etapa 2 — Piloto FRM_RED_OPERATIVA_EDIT
-- Infraestructura mínima de formularios configurables
-- ==========================================================

-- 1. Definiciones
CREATE TABLE IF NOT EXISTS public.formularios_definiciones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo TEXT UNIQUE NOT NULL,
  nombre TEXT NOT NULL,
  descripcion TEXT,
  modulo TEXT NOT NULL,
  ruta TEXT NOT NULL,
  componente TEXT NOT NULL,
  activo BOOLEAN NOT NULL DEFAULT true,
  version_publicada_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID
);

GRANT SELECT, INSERT, UPDATE ON public.formularios_definiciones TO authenticated;
GRANT ALL ON public.formularios_definiciones TO service_role;

ALTER TABLE public.formularios_definiciones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "def_select_active_members" ON public.formularios_definiciones;
CREATE POLICY "def_select_active_members"
  ON public.formularios_definiciones FOR SELECT
  TO authenticated
  USING (public.is_active_member(auth.uid()));

DROP POLICY IF EXISTS "def_write_admin" ON public.formularios_definiciones;
CREATE POLICY "def_write_admin"
  ON public.formularios_definiciones FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 2. Versiones
CREATE TABLE IF NOT EXISTS public.formularios_versiones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  formulario_id UUID NOT NULL REFERENCES public.formularios_definiciones(id) ON DELETE CASCADE,
  numero_version INTEGER NOT NULL,
  estado TEXT NOT NULL CHECK (estado IN ('BORRADOR','ACTIVA','ARCHIVADA')),
  schema_config JSONB NOT NULL,
  motivo_cambio TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID,
  published_at TIMESTAMPTZ,
  published_by UUID,
  archived_at TIMESTAMPTZ,
  archived_by UUID,
  UNIQUE (formulario_id, numero_version)
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_form_ver_una_activa
  ON public.formularios_versiones(formulario_id)
  WHERE estado = 'ACTIVA';

CREATE UNIQUE INDEX IF NOT EXISTS ux_form_ver_un_borrador
  ON public.formularios_versiones(formulario_id)
  WHERE estado = 'BORRADOR';

-- FK para version_publicada_id (después de crear la tabla referida)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_def_version_publicada'
  ) THEN
    ALTER TABLE public.formularios_definiciones
      ADD CONSTRAINT fk_def_version_publicada
      FOREIGN KEY (version_publicada_id)
      REFERENCES public.formularios_versiones(id) ON DELETE SET NULL;
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE ON public.formularios_versiones TO authenticated;
GRANT ALL ON public.formularios_versiones TO service_role;

ALTER TABLE public.formularios_versiones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ver_select_activa_runtime" ON public.formularios_versiones;
CREATE POLICY "ver_select_activa_runtime"
  ON public.formularios_versiones FOR SELECT
  TO authenticated
  USING (estado = 'ACTIVA' AND public.is_active_member(auth.uid()));

DROP POLICY IF EXISTS "ver_select_admin" ON public.formularios_versiones;
CREATE POLICY "ver_select_admin"
  ON public.formularios_versiones FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "ver_write_admin" ON public.formularios_versiones;
CREATE POLICY "ver_write_admin"
  ON public.formularios_versiones FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Triggers updated_at (idempotentes)
DROP TRIGGER IF EXISTS trg_form_def_updated ON public.formularios_definiciones;
CREATE TRIGGER trg_form_def_updated
  BEFORE UPDATE ON public.formularios_definiciones
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_form_ver_updated ON public.formularios_versiones;
CREATE TRIGGER trg_form_ver_updated
  BEFORE UPDATE ON public.formularios_versiones
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. Seed idempotente FRM_RED_OPERATIVA_EDIT v1 ACTIVA
DO $$
DECLARE
  v_def_id UUID;
  v_ver_id UUID;
BEGIN
  INSERT INTO public.formularios_definiciones (codigo, nombre, descripcion, modulo, ruta, componente)
  VALUES (
    'FRM_RED_OPERATIVA_EDIT',
    'Red operativa — alta y edición',
    'Formulario administrable de alta y edición de red y disponibilidad. Solo permite personalizar presentación (etiquetas, ayuda, orden, secciones, ancho y visibilidad de campos opcionales). No modifica datos, validaciones ni catálogos.',
    'red_operativa',
    '/red-ips',
    'RedFormDialog'
  )
  ON CONFLICT (codigo) DO NOTHING;

  SELECT id INTO v_def_id
    FROM public.formularios_definiciones
   WHERE codigo = 'FRM_RED_OPERATIVA_EDIT';

  -- Si aún no hay versiones para esta definición, crear v1 ACTIVA con
  -- configuración vacía. El loader del cliente aplica defaults del
  -- registro técnico, reproduciendo exactamente el formulario anterior.
  IF NOT EXISTS (
    SELECT 1 FROM public.formularios_versiones WHERE formulario_id = v_def_id
  ) THEN
    INSERT INTO public.formularios_versiones
      (formulario_id, numero_version, estado, schema_config, published_at)
    VALUES
      (v_def_id, 1, 'ACTIVA',
       jsonb_build_object('schema_version', 1, 'sections', '[]'::jsonb, 'fields', '[]'::jsonb),
       now())
    RETURNING id INTO v_ver_id;

    UPDATE public.formularios_definiciones
       SET version_publicada_id = v_ver_id
     WHERE id = v_def_id;
  END IF;
END $$;