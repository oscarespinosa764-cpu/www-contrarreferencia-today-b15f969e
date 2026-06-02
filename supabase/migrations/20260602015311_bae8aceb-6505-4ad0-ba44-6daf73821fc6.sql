-- =========================================================
-- DOMICILIARIOS (PHD / PAD / O2 / Especiales)
-- =========================================================
CREATE TABLE public.domiciliarios (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tipo_solicitud text,
  unidad_especial text,
  paciente text,
  documento text,
  ips text,
  estado text,
  prioridad text,
  detalle text,
  observaciones text,
  evolucion text,
  evolucion_detalle text,
  fecha date,
  archivado boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.domiciliarios TO authenticated;
GRANT ALL ON public.domiciliarios TO service_role;
ALTER TABLE public.domiciliarios ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Domiciliarios: miembros activos ven" ON public.domiciliarios FOR SELECT TO authenticated USING (is_active_member(auth.uid()));
CREATE POLICY "Domiciliarios: editores crean" ON public.domiciliarios FOR INSERT TO authenticated WITH CHECK (can_edit(auth.uid()));
CREATE POLICY "Domiciliarios: editores actualizan" ON public.domiciliarios FOR UPDATE TO authenticated USING (can_edit(auth.uid()));
CREATE POLICY "Domiciliarios: admin elimina" ON public.domiciliarios FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE TRIGGER trg_domiciliarios_updated BEFORE UPDATE ON public.domiciliarios FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================
-- REFERENCIA INTERNA
-- =========================================================
CREATE TABLE public.referencia_interna (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tipo_solicitud text,
  servicio text,
  proveedor_prestador text,
  paciente text,
  documento text,
  estado text,
  prioridad text,
  observaciones text,
  evolucion text,
  evolucion_detalle text,
  fecha date,
  archivado boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.referencia_interna TO authenticated;
GRANT ALL ON public.referencia_interna TO service_role;
ALTER TABLE public.referencia_interna ENABLE ROW LEVEL SECURITY;
CREATE POLICY "RefInterna: miembros activos ven" ON public.referencia_interna FOR SELECT TO authenticated USING (is_active_member(auth.uid()));
CREATE POLICY "RefInterna: editores crean" ON public.referencia_interna FOR INSERT TO authenticated WITH CHECK (can_edit(auth.uid()));
CREATE POLICY "RefInterna: editores actualizan" ON public.referencia_interna FOR UPDATE TO authenticated USING (can_edit(auth.uid()));
CREATE POLICY "RefInterna: admin elimina" ON public.referencia_interna FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE TRIGGER trg_refinterna_updated BEFORE UPDATE ON public.referencia_interna FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================
-- PENDIENTES
-- =========================================================
CREATE TABLE public.pendientes (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tipo_pendiente text,
  ips_area text,
  paciente_asunto text,
  prioridad text,
  estado text,
  observacion_entrega text,
  fecha date,
  archivado boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pendientes TO authenticated;
GRANT ALL ON public.pendientes TO service_role;
ALTER TABLE public.pendientes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Pendientes: miembros activos ven" ON public.pendientes FOR SELECT TO authenticated USING (is_active_member(auth.uid()));
CREATE POLICY "Pendientes: editores crean" ON public.pendientes FOR INSERT TO authenticated WITH CHECK (can_edit(auth.uid()));
CREATE POLICY "Pendientes: editores actualizan" ON public.pendientes FOR UPDATE TO authenticated USING (can_edit(auth.uid()));
CREATE POLICY "Pendientes: admin elimina" ON public.pendientes FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE TRIGGER trg_pendientes_updated BEFORE UPDATE ON public.pendientes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================
-- AVISOS OPERATIVOS
-- =========================================================
CREATE TABLE public.avisos (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  mensaje text,
  estado text DEFAULT 'ACTIVO',
  prioridad text,
  modulo text,
  fecha_inicio timestamptz,
  fecha_final timestamptz,
  archivado boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.avisos TO authenticated;
GRANT ALL ON public.avisos TO service_role;
ALTER TABLE public.avisos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Avisos: miembros activos ven" ON public.avisos FOR SELECT TO authenticated USING (is_active_member(auth.uid()));
CREATE POLICY "Avisos: editores crean" ON public.avisos FOR INSERT TO authenticated WITH CHECK (can_edit(auth.uid()));
CREATE POLICY "Avisos: editores actualizan" ON public.avisos FOR UPDATE TO authenticated USING (can_edit(auth.uid()));
CREATE POLICY "Avisos: admin elimina" ON public.avisos FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE TRIGGER trg_avisos_updated BEFORE UPDATE ON public.avisos FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================
-- REGLAS OPERATIVAS
-- =========================================================
CREATE TABLE public.reglas_operativas (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nombre text,
  modulo text,
  tipo_condicion text,
  campo text,
  valor text,
  horas numeric,
  nivel text,
  mensaje text,
  accion text,
  activo boolean NOT NULL DEFAULT true,
  archivado boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reglas_operativas TO authenticated;
GRANT ALL ON public.reglas_operativas TO service_role;
ALTER TABLE public.reglas_operativas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Reglas: miembros activos ven" ON public.reglas_operativas FOR SELECT TO authenticated USING (is_active_member(auth.uid()));
CREATE POLICY "Reglas: editores crean" ON public.reglas_operativas FOR INSERT TO authenticated WITH CHECK (can_edit(auth.uid()));
CREATE POLICY "Reglas: editores actualizan" ON public.reglas_operativas FOR UPDATE TO authenticated USING (can_edit(auth.uid()));
CREATE POLICY "Reglas: admin elimina" ON public.reglas_operativas FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE TRIGGER trg_reglas_updated BEFORE UPDATE ON public.reglas_operativas FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================
-- COORDINACION (alertas administrativas)
-- =========================================================
CREATE TABLE public.coordinacion (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tipo text,
  estado text DEFAULT 'ABIERTA',
  fecha_alerta timestamptz DEFAULT now(),
  caso_id uuid,
  paciente text,
  documento text,
  detalle text,
  archivado boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.coordinacion TO authenticated;
GRANT ALL ON public.coordinacion TO service_role;
ALTER TABLE public.coordinacion ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Coordinacion: miembros activos ven" ON public.coordinacion FOR SELECT TO authenticated USING (is_active_member(auth.uid()));
CREATE POLICY "Coordinacion: editores crean" ON public.coordinacion FOR INSERT TO authenticated WITH CHECK (can_edit(auth.uid()));
CREATE POLICY "Coordinacion: editores actualizan" ON public.coordinacion FOR UPDATE TO authenticated USING (can_edit(auth.uid()));
CREATE POLICY "Coordinacion: admin elimina" ON public.coordinacion FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE TRIGGER trg_coordinacion_updated BEFORE UPDATE ON public.coordinacion FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================
-- INDICADORES
-- =========================================================
CREATE TABLE public.indicadores (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nombre text,
  tipo text,
  numerador text,
  denominador text,
  meta numeric,
  unidad text,
  sentido text,
  fuente text,
  activo boolean NOT NULL DEFAULT true,
  archivado boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.indicadores TO authenticated;
GRANT ALL ON public.indicadores TO service_role;
ALTER TABLE public.indicadores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Indicadores: miembros activos ven" ON public.indicadores FOR SELECT TO authenticated USING (is_active_member(auth.uid()));
CREATE POLICY "Indicadores: editores crean" ON public.indicadores FOR INSERT TO authenticated WITH CHECK (can_edit(auth.uid()));
CREATE POLICY "Indicadores: editores actualizan" ON public.indicadores FOR UPDATE TO authenticated USING (can_edit(auth.uid()));
CREATE POLICY "Indicadores: admin elimina" ON public.indicadores FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE TRIGGER trg_indicadores_updated BEFORE UPDATE ON public.indicadores FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================
-- MEDICIONES DE INDICADORES
-- =========================================================
CREATE TABLE public.mediciones_indicadores (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  indicador_id uuid NOT NULL REFERENCES public.indicadores(id) ON DELETE CASCADE,
  numerador_valor numeric,
  denominador_valor numeric,
  resultado numeric,
  semaforo text,
  fecha timestamptz DEFAULT now(),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mediciones_indicadores TO authenticated;
GRANT ALL ON public.mediciones_indicadores TO service_role;
ALTER TABLE public.mediciones_indicadores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Mediciones: miembros activos ven" ON public.mediciones_indicadores FOR SELECT TO authenticated USING (is_active_member(auth.uid()));
CREATE POLICY "Mediciones: editores crean" ON public.mediciones_indicadores FOR INSERT TO authenticated WITH CHECK (can_edit(auth.uid()));
CREATE POLICY "Mediciones: editores actualizan" ON public.mediciones_indicadores FOR UPDATE TO authenticated USING (can_edit(auth.uid()));
CREATE POLICY "Mediciones: admin elimina" ON public.mediciones_indicadores FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE INDEX idx_mediciones_indicador ON public.mediciones_indicadores(indicador_id);
CREATE TRIGGER trg_mediciones_updated BEFORE UPDATE ON public.mediciones_indicadores FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================
-- RED OPERATIVA (directorio)
-- =========================================================
CREATE TABLE public.red_operativa (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  categoria text,
  subcategoria text,
  entidad text,
  eps text,
  ips text,
  departamento text,
  ciudad text,
  servicio_especialidad text,
  tipo_contacto text,
  contacto text,
  link text,
  telefono text,
  correo text,
  tipo_ambulancia text,
  cups text,
  fecha_inicio date,
  fecha_final date,
  medico text,
  rondas text,
  observaciones text,
  estado text,
  archivado boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.red_operativa TO authenticated;
GRANT ALL ON public.red_operativa TO service_role;
ALTER TABLE public.red_operativa ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Red: miembros activos ven" ON public.red_operativa FOR SELECT TO authenticated USING (is_active_member(auth.uid()));
CREATE POLICY "Red: editores crean" ON public.red_operativa FOR INSERT TO authenticated WITH CHECK (can_edit(auth.uid()));
CREATE POLICY "Red: editores actualizan" ON public.red_operativa FOR UPDATE TO authenticated USING (can_edit(auth.uid()));
CREATE POLICY "Red: admin elimina" ON public.red_operativa FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE TRIGGER trg_red_updated BEFORE UPDATE ON public.red_operativa FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================
-- PLANTILLAS
-- =========================================================
CREATE TABLE public.plantillas (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  indicativo text,
  categoria text,
  subcategoria text,
  nombre text,
  mensaje text,
  variables text,
  activo boolean NOT NULL DEFAULT true,
  archivado boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.plantillas TO authenticated;
GRANT ALL ON public.plantillas TO service_role;
ALTER TABLE public.plantillas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Plantillas: miembros activos ven" ON public.plantillas FOR SELECT TO authenticated USING (is_active_member(auth.uid()));
CREATE POLICY "Plantillas: editores crean" ON public.plantillas FOR INSERT TO authenticated WITH CHECK (can_edit(auth.uid()));
CREATE POLICY "Plantillas: editores actualizan" ON public.plantillas FOR UPDATE TO authenticated USING (can_edit(auth.uid()));
CREATE POLICY "Plantillas: admin elimina" ON public.plantillas FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE TRIGGER trg_plantillas_updated BEFORE UPDATE ON public.plantillas FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================
-- TURNOS
-- =========================================================
CREATE TABLE public.turnos (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  turno text,
  entrega text,
  recibe text,
  pendientes_generales text,
  rango_turno text,
  usuario_inicio text,
  fecha_guardado timestamptz DEFAULT now(),
  activo boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.turnos TO authenticated;
GRANT ALL ON public.turnos TO service_role;
ALTER TABLE public.turnos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Turnos: miembros activos ven" ON public.turnos FOR SELECT TO authenticated USING (is_active_member(auth.uid()));
CREATE POLICY "Turnos: editores crean" ON public.turnos FOR INSERT TO authenticated WITH CHECK (can_edit(auth.uid()));
CREATE POLICY "Turnos: editores actualizan" ON public.turnos FOR UPDATE TO authenticated USING (can_edit(auth.uid()));
CREATE POLICY "Turnos: admin elimina" ON public.turnos FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE TRIGGER trg_turnos_updated BEFORE UPDATE ON public.turnos FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================
-- HISTORIAL DE TURNOS (snapshot)
-- =========================================================
CREATE TABLE public.historial_turnos (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  turno text,
  entrega text,
  recibe text,
  rango_turno text,
  snapshot jsonb,
  usuario_inicio text,
  fecha_guardado timestamptz DEFAULT now(),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.historial_turnos TO authenticated;
GRANT ALL ON public.historial_turnos TO service_role;
ALTER TABLE public.historial_turnos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "HistTurnos: miembros activos ven" ON public.historial_turnos FOR SELECT TO authenticated USING (is_active_member(auth.uid()));
CREATE POLICY "HistTurnos: editores crean" ON public.historial_turnos FOR INSERT TO authenticated WITH CHECK (can_edit(auth.uid()));
CREATE POLICY "HistTurnos: admin elimina" ON public.historial_turnos FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE TRIGGER trg_historial_turnos_updated BEFORE UPDATE ON public.historial_turnos FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================
-- HISTORICOS DE CASOS
-- =========================================================
CREATE TABLE public.historicos_casos (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  seccion text,
  tipo_caso text,
  fuente_hoja text,
  fuente_archivo text,
  radicado text,
  paciente text,
  documento text,
  ips text,
  estado text,
  asegurador text,
  fecha date,
  detalle text,
  datos jsonb,
  archivado boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.historicos_casos TO authenticated;
GRANT ALL ON public.historicos_casos TO service_role;
ALTER TABLE public.historicos_casos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Historicos: miembros activos ven" ON public.historicos_casos FOR SELECT TO authenticated USING (is_active_member(auth.uid()));
CREATE POLICY "Historicos: editores crean" ON public.historicos_casos FOR INSERT TO authenticated WITH CHECK (can_edit(auth.uid()));
CREATE POLICY "Historicos: editores actualizan" ON public.historicos_casos FOR UPDATE TO authenticated USING (can_edit(auth.uid()));
CREATE POLICY "Historicos: admin elimina" ON public.historicos_casos FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE TRIGGER trg_historicos_updated BEFORE UPDATE ON public.historicos_casos FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================
-- CONTROL DE MANDO (auditoria, inmutable)
-- =========================================================
CREATE TABLE public.control_mando (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  fecha timestamptz NOT NULL DEFAULT now(),
  usuario uuid,
  nombre_usuario text,
  rol text,
  accion text,
  modulo text,
  registro_id text,
  detalle text,
  sesion_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.control_mando TO authenticated;
GRANT ALL ON public.control_mando TO service_role;
ALTER TABLE public.control_mando ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ControlMando: admin ve" ON public.control_mando FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "ControlMando: miembros activos registran" ON public.control_mando FOR INSERT TO authenticated WITH CHECK (is_active_member(auth.uid()));
CREATE INDEX idx_control_mando_fecha ON public.control_mando(fecha DESC);