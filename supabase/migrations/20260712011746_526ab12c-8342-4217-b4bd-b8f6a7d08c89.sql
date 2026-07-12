
CREATE TABLE public.alertas_coordinacion (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  codigo text NOT NULL,
  nombre text,
  descripcion text,
  modulo text,
  subventana text NOT NULL DEFAULT 'ENTRANTES',
  prioridad text NOT NULL DEFAULT 'MEDIO',
  mensaje text,
  caso_codigo text,
  caso_documento text,
  estado text NOT NULL DEFAULT 'ABIERTA',
  idempotency_key text NOT NULL,
  detalles jsonb,
  evento_at timestamp with time zone NOT NULL DEFAULT now(),
  revisado_por uuid,
  revisado_por_nombre text,
  revisado_at timestamp with time zone,
  gestionado_por uuid,
  gestionado_por_nombre text,
  gestionado_at timestamp with time zone,
  cerrado_por uuid,
  cerrado_por_nombre text,
  cerrado_at timestamp with time zone,
  hallazgo text,
  justificacion text,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX alertas_coordinacion_idempotency_uidx
  ON public.alertas_coordinacion (idempotency_key);
CREATE INDEX alertas_coordinacion_estado_idx ON public.alertas_coordinacion (estado);
CREATE INDEX alertas_coordinacion_codigo_idx ON public.alertas_coordinacion (codigo);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.alertas_coordinacion TO authenticated;
GRANT ALL ON public.alertas_coordinacion TO service_role;

ALTER TABLE public.alertas_coordinacion ENABLE ROW LEVEL SECURITY;

-- Cualquier miembro activo puede ver las alertas de coordinación.
CREATE POLICY "alertas_coord_select_active_members"
  ON public.alertas_coordinacion
  FOR SELECT
  TO authenticated
  USING (public.is_active_member(auth.uid()));

-- Solo administración/coordinación puede crear alertas.
CREATE POLICY "alertas_coord_insert_admin"
  ON public.alertas_coordinacion
  FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Solo administración/coordinación puede actualizar (gestionar ciclo de vida).
CREATE POLICY "alertas_coord_update_admin"
  ON public.alertas_coordinacion
  FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Solo administración/coordinación puede eliminar.
CREATE POLICY "alertas_coord_delete_admin"
  ON public.alertas_coordinacion
  FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_alertas_coordinacion_updated_at
  BEFORE UPDATE ON public.alertas_coordinacion
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
