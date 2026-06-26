CREATE TABLE public.entrega_firmas (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  caso_id uuid NOT NULL,
  tipo_caso text NOT NULL DEFAULT 'remision',
  seguimiento_id uuid,
  token_hash text NOT NULL UNIQUE,
  estado text NOT NULL DEFAULT 'PENDIENTE',
  expira_at timestamptz NOT NULL,
  usuario_genero uuid,
  nombre_usuario text,
  snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  firmante_nombre text,
  firmante_cargo text,
  firmante_empresa text,
  firmante_documento text,
  firmante_telefono text,
  aceptacion boolean NOT NULL DEFAULT false,
  firma_data text,
  firma_ip text,
  firma_user_agent text,
  firmado_at timestamptz,
  codigo_verificacion text,
  pdf_hash text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT entrega_firmas_estado_chk CHECK (estado IN ('PENDIENTE','FIRMADA','VENCIDA','ANULADA'))
);

GRANT SELECT, INSERT, UPDATE ON public.entrega_firmas TO authenticated;
GRANT ALL ON public.entrega_firmas TO service_role;

ALTER TABLE public.entrega_firmas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Miembros activos ven sesiones de firma"
  ON public.entrega_firmas FOR SELECT TO authenticated
  USING (public.is_active_member(auth.uid()));

CREATE POLICY "Miembros activos crean sesiones de firma"
  ON public.entrega_firmas FOR INSERT TO authenticated
  WITH CHECK (public.is_active_member(auth.uid()));

CREATE POLICY "Miembros activos actualizan sesiones de firma"
  ON public.entrega_firmas FOR UPDATE TO authenticated
  USING (public.is_active_member(auth.uid()))
  WITH CHECK (public.is_active_member(auth.uid()));

CREATE INDEX entrega_firmas_caso_idx ON public.entrega_firmas (caso_id);
CREATE INDEX entrega_firmas_estado_idx ON public.entrega_firmas (estado);

CREATE TRIGGER update_entrega_firmas_updated_at
  BEFORE UPDATE ON public.entrega_firmas
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();