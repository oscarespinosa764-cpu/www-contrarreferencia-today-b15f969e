CREATE TABLE public.especialidades_historial (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  caso_id uuid NOT NULL,
  tabla text NOT NULL DEFAULT 'remisiones',
  tipo_caso text,
  especialidad text NOT NULL,
  action text NOT NULL CHECK (action IN ('ADDED','CLOSED','REACTIVATED')),
  previous_status text,
  new_status text,
  motivo text,
  seguimiento_id uuid,
  changed_by uuid,
  changed_by_name text,
  effective_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.especialidades_historial TO authenticated;
GRANT ALL ON public.especialidades_historial TO service_role;

ALTER TABLE public.especialidades_historial ENABLE ROW LEVEL SECURITY;

CREATE POLICY "EspHist: miembros activos ven"
  ON public.especialidades_historial FOR SELECT
  TO authenticated
  USING (is_active_member(auth.uid()));

CREATE POLICY "EspHist: editores crean"
  ON public.especialidades_historial FOR INSERT
  TO authenticated
  WITH CHECK (can_edit(auth.uid()));

CREATE POLICY "EspHist: admin elimina"
  ON public.especialidades_historial FOR DELETE
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX idx_esp_hist_caso ON public.especialidades_historial (caso_id, effective_at DESC);