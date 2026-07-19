
-- ============================================================
-- FASE B · Q0 + Q2 + Q4 + Q5 + Q6 (soporte de datos)
-- ============================================================

-- ---- Q2: SEED de 12 puntos de dictado ---------------------
INSERT INTO public.voice_dictation_config
  (key, modulo, ventana, subventana, nombre_campo, selector, tipo_campo, modo_insercion, idioma, activo, roles_permitidos, texto_ayuda)
VALUES
  ('salientes.seguimiento.observaciones','Remisiones salientes','Dashboard Operativo Salientes','Seguimiento','Observaciones','[data-dictation-key="salientes.seguimiento.observaciones"]','textarea','append','es-CO',true,ARRAY['admin','operativa'],'Dictado clínico. Revise antes de guardar.'),
  ('salientes.seguimiento.plantilla_indigo','Remisiones salientes','Dashboard Operativo Salientes','Seguimiento','Plantilla Índigo','[data-dictation-key="salientes.seguimiento.plantilla_indigo"]','textarea','append','es-CO',true,ARRAY['admin','operativa'],NULL),
  ('salientes.seguimiento.motivo_pendiente','Remisiones salientes','Dashboard Operativo Salientes','Seguimiento','Motivo del pendiente','[data-dictation-key="salientes.seguimiento.motivo_pendiente"]','textarea','append','es-CO',true,ARRAY['admin','operativa'],NULL),
  ('phd.seguimiento.observaciones','PHD / PAD / O2 / Especiales','Dashboard Operativo','Seguimiento','Observaciones','[data-dictation-key="phd.seguimiento.observaciones"]','textarea','append','es-CO',true,ARRAY['admin','operativa'],NULL),
  ('phd.seguimiento.plantilla_indigo','PHD / PAD / O2 / Especiales','Dashboard Operativo','Seguimiento','Plantilla Índigo','[data-dictation-key="phd.seguimiento.plantilla_indigo"]','textarea','append','es-CO',true,ARRAY['admin','operativa'],NULL),
  ('referencia_interna.seguimiento.observaciones','Referencias internas','Dashboard Operativo','Seguimiento','Observaciones','[data-dictation-key="referencia_interna.seguimiento.observaciones"]','textarea','append','es-CO',true,ARRAY['admin','operativa'],NULL),
  ('pendientes.seguimiento.observaciones','Pendientes','Dashboard Operativo','Seguimiento','Observaciones','[data-dictation-key="pendientes.seguimiento.observaciones"]','textarea','append','es-CO',true,ARRAY['admin','operativa'],NULL),
  ('salientes.nuevo.justificacion','Remisiones salientes','Nuevo registro','Datos clínicos','Justificación de remisión','[data-dictation-key="salientes.nuevo.justificacion"]','textarea','append','es-CO',true,ARRAY['admin','operativa'],NULL),
  ('salientes.nuevo.observaciones','Remisiones salientes','Nuevo registro','Datos clínicos','Observaciones','[data-dictation-key="salientes.nuevo.observaciones"]','textarea','append','es-CO',true,ARRAY['admin','operativa'],NULL),
  ('reglas.aviso.mensaje','Reglas y Alertas','Reglas y Alertas','Aviso manual','Mensaje del aviso','[data-dictation-key="reglas.aviso.mensaje"]','textarea','append','es-CO',true,ARRAY['admin','operativa'],NULL),
  ('red.novedades','Red / Disponibilidad IPS','Red / Disponibilidad IPS','Registro IPS','Novedades','[data-dictation-key="red.novedades"]','textarea','append','es-CO',true,ARRAY['admin','operativa'],NULL),
  ('red.observaciones','Red / Disponibilidad IPS','Red / Disponibilidad IPS','Registro IPS','Observaciones generales','[data-dictation-key="red.observaciones"]','textarea','append','es-CO',true,ARRAY['admin','operativa'],NULL)
ON CONFLICT (key) DO NOTHING;

-- ---- Q0: conciliar SEDE / CARGO duplicados ----------------
DELETE FROM public.catalogos WHERE tipo='SEDE'  AND upper(btrim(valor))='PRINCIPAL' AND activo=false;
DELETE FROM public.catalogos WHERE tipo='CARGO' AND upper(btrim(valor))='USUARIO DE PRUEBA' AND activo=false;

-- ---- Q5: contenido editable de plantillas del inventario --
ALTER TABLE public.plantillas_inventario
  ADD COLUMN IF NOT EXISTS contenido_editable jsonb NOT NULL DEFAULT '{}'::jsonb;

UPDATE public.plantillas_inventario
   SET contenido_editable = jsonb_build_object(
     'encabezado_titulo','REPORTE GENERAL DE SALIENTES',
     'encabezado_subtitulo','Centro de Referencia y Contrarreferencia',
     'pie_leyenda','Documento generado automáticamente. Uso interno.',
     'incluye_seccion_phd', true,
     'incluye_seccion_negaciones', true
   )
 WHERE codigo = 'REPORTE_GENERAL_SALIENTES' AND (contenido_editable = '{}'::jsonb OR contenido_editable IS NULL);

UPDATE public.plantillas_inventario
   SET contenido_editable = jsonb_build_object(
     'encabezado_titulo','SOLICITUD DE PERMISO / CAMBIO DE TURNO',
     'encabezado_codigo','TH-FR-09',
     'pie_leyenda','El presente documento es una constancia interna.'
   )
 WHERE codigo = 'TH-FR-09' AND (contenido_editable = '{}'::jsonb OR contenido_editable IS NULL);

-- ---- Q4: motor de listas de chequeo -----------------------
CREATE TABLE IF NOT EXISTS public.checklists (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo       text NOT NULL UNIQUE,
  nombre       text NOT NULL,
  modulo       text NOT NULL,
  activo       boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.checklists TO authenticated;
GRANT ALL    ON public.checklists TO service_role;
ALTER TABLE public.checklists ENABLE ROW LEVEL SECURITY;

CREATE POLICY "chk_select" ON public.checklists FOR SELECT TO authenticated
  USING (public.is_active_member(auth.uid()));
CREATE POLICY "chk_admin_all" ON public.checklists FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE IF NOT EXISTS public.checklist_versiones (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  checklist_id uuid NOT NULL REFERENCES public.checklists(id) ON DELETE CASCADE,
  version      integer NOT NULL,
  estado       text NOT NULL DEFAULT 'BORRADOR' CHECK (estado IN ('BORRADOR','ACTIVA','ARCHIVADA')),
  items        jsonb NOT NULL DEFAULT '[]'::jsonb,
  notas        text,
  created_by   uuid,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (checklist_id, version)
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_checklist_una_activa
  ON public.checklist_versiones (checklist_id) WHERE estado='ACTIVA';

GRANT SELECT ON public.checklist_versiones TO authenticated;
GRANT ALL    ON public.checklist_versiones TO service_role;
ALTER TABLE public.checklist_versiones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "chkv_select" ON public.checklist_versiones FOR SELECT TO authenticated
  USING (public.is_active_member(auth.uid()));
CREATE POLICY "chkv_admin_all" ON public.checklist_versiones FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE IF NOT EXISTS public.checklist_respuestas (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id     uuid NOT NULL REFERENCES public.checklist_versiones(id),
  checklist_codigo text NOT NULL,
  caso_id        uuid,
  caso_tipo      text,
  respuestas     jsonb NOT NULL DEFAULT '[]'::jsonb,
  observaciones  text,
  usuario_id     uuid,
  usuario_nombre text,
  created_at     timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.checklist_respuestas TO authenticated;
GRANT ALL ON public.checklist_respuestas TO service_role;
ALTER TABLE public.checklist_respuestas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "chkr_select_activos" ON public.checklist_respuestas FOR SELECT TO authenticated
  USING (public.is_active_member(auth.uid()));
CREATE POLICY "chkr_insert_activos" ON public.checklist_respuestas FOR INSERT TO authenticated
  WITH CHECK (public.is_active_member(auth.uid()) AND usuario_id = auth.uid());

CREATE TRIGGER trg_upd_checklists BEFORE UPDATE ON public.checklists
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_upd_checklist_versiones BEFORE UPDATE ON public.checklist_versiones
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed base
INSERT INTO public.checklists (codigo, nombre, modulo)
VALUES ('SALIENTES_ENTREGA_SEGURA','Salientes · Entrega segura','salientes')
ON CONFLICT (codigo) DO NOTHING;

INSERT INTO public.checklist_versiones (checklist_id, version, estado, items, notas)
SELECT c.id, 1, 'BORRADOR',
  '[
    {"id":"i1","texto":"Paciente identificado y consciente del traslado","requerido":true},
    {"id":"i2","texto":"Historia clínica y órdenes vigentes anexas","requerido":true},
    {"id":"i3","texto":"Consentimiento informado firmado","requerido":true},
    {"id":"i4","texto":"IPS receptora confirma aceptación (con nombre y hora)","requerido":true},
    {"id":"i5","texto":"Ambulancia/medio de transporte coordinado","requerido":true},
    {"id":"i6","texto":"Familia informada del traslado","requerido":false}
   ]'::jsonb,
  'Versión inicial. Editar en Control de Mando → Listas de chequeo.'
FROM public.checklists c
WHERE c.codigo = 'SALIENTES_ENTREGA_SEGURA'
  AND NOT EXISTS (SELECT 1 FROM public.checklist_versiones v WHERE v.checklist_id = c.id);
