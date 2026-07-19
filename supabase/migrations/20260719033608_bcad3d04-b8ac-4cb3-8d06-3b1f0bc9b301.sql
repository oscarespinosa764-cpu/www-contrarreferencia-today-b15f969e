
-- ============================================================
-- Fase 1+2 · Administrador de plantillas
-- ============================================================

-- 1. Extender plantillas_inventario ----------------------------
ALTER TABLE public.plantillas_inventario
  ADD COLUMN IF NOT EXISTS variables_declaradas jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS puntos_uso_codigos text[] NOT NULL DEFAULT ARRAY[]::text[];

-- 2. Extender checklists ---------------------------------------
ALTER TABLE public.checklists
  ADD COLUMN IF NOT EXISTS estado_revision text NOT NULL DEFAULT 'ACTIVA';

-- 3. Tabla puntos_de_uso ---------------------------------------
CREATE TABLE IF NOT EXISTS public.puntos_de_uso (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo text UNIQUE NOT NULL,
  nombre text NOT NULL,
  modulo text NOT NULL,
  ruta text,
  ventana text,
  paso text,
  evento text,
  tipo_salida text NOT NULL,
  variables_disponibles jsonb NOT NULL DEFAULT '[]'::jsonb,
  plantilla_codigo text,
  estado text NOT NULL DEFAULT 'ACTIVO',
  componente_responsable text,
  notas text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.puntos_de_uso TO authenticated;
GRANT ALL ON public.puntos_de_uso TO service_role;

ALTER TABLE public.puntos_de_uso ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pdu_select_active" ON public.puntos_de_uso
  FOR SELECT TO authenticated
  USING (public.is_active_member(auth.uid()));

CREATE POLICY "pdu_admin_all" ON public.puntos_de_uso
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_puntos_de_uso_updated
  BEFORE UPDATE ON public.puntos_de_uso
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4. Tabla plantillas_versiones --------------------------------
CREATE TABLE IF NOT EXISTS public.plantillas_versiones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plantilla_codigo text NOT NULL,
  version integer NOT NULL,
  estado text NOT NULL DEFAULT 'BORRADOR', -- BORRADOR | ACTIVA | ARCHIVADA
  contenido_editable jsonb NOT NULL DEFAULT '{}'::jsonb,
  motivo text,
  creada_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  publicada_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  publicada_at timestamptz,
  archivada_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (plantilla_codigo, version)
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_plantillas_versiones_activa
  ON public.plantillas_versiones (plantilla_codigo)
  WHERE estado = 'ACTIVA';

GRANT SELECT ON public.plantillas_versiones TO authenticated;
GRANT ALL ON public.plantillas_versiones TO service_role;

ALTER TABLE public.plantillas_versiones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pv_select_active" ON public.plantillas_versiones
  FOR SELECT TO authenticated
  USING (public.is_active_member(auth.uid()));

CREATE POLICY "pv_admin_all" ON public.plantillas_versiones
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_plantillas_versiones_updated
  BEFORE UPDATE ON public.plantillas_versiones
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 5. Siembra: nuevas plantillas del inventario -----------------
INSERT INTO public.plantillas_inventario
  (codigo, nombre, modulo, editable_nivel, formato, origen, generador, estado, version, dependencia, notas, contenido_editable, variables_declaradas, puntos_uso_codigos)
VALUES
  ('ENTRANTES_ACEPTACION_HTML',
   'Oficio de aceptación (entrantes)',
   'ENTRANTES', 'PARCIAL', 'HTML', 'CODIGO+CONFIG',
   'src/lib/oficio.ts',
   'ACTIVA', '1.0',
   'Dashboard operativo entrantes → botón Aceptar',
   'Se genera al aceptar un caso entrante. El HTML también se copia al correo.',
   jsonb_build_object(
     'institucion_nombre', 'CEDIM IPS',
     'institucion_nombre_largo', 'Centro de Imágenes Diagnósticas CEDIM IPS',
     'institucion_sede', 'Sede Clínica Gloria Patricia Pinzón',
     'institucion_oficina', 'Oficina de Referencia y Contrarreferencia',
     'institucion_aviso', 'Por favor, no responda a este mensaje.',
     'titulo_aceptacion', 'Caso aceptado'
   ),
   jsonb_build_array(
     jsonb_build_object('codigo','TIPO','nombre','Tipo de respuesta','tipo','string','obligatoria',true,'valor_prueba','ACEP'),
     jsonb_build_object('codigo','CODIGO','nombre','Código de gestión','tipo','string','obligatoria',true,'valor_prueba','ENT-2026-0001'),
     jsonb_build_object('codigo','MENSAJE','nombre','Cuerpo del oficio','tipo','texto','obligatoria',true,'valor_prueba','Se acepta el caso del paciente *PACIENTE DE PRUEBA*.')
   ),
   ARRAY['ENTRANTES_ACEPTACION']),
  ('ENTRANTES_NEGACION_HTML',
   'Oficio de negación (entrantes)',
   'ENTRANTES', 'PARCIAL', 'HTML', 'CODIGO+CONFIG',
   'src/lib/oficio.ts',
   'ACTIVA', '1.0',
   'Dashboard operativo entrantes → botón Negar',
   'Se genera al negar un caso entrante.',
   jsonb_build_object(
     'titulo_negacion', 'Caso negado',
     'aviso_final', 'Por favor, no responda a este mensaje.'
   ),
   jsonb_build_array(
     jsonb_build_object('codigo','CODIGO','nombre','Código de gestión','tipo','string','obligatoria',true,'valor_prueba','ENT-2026-0002'),
     jsonb_build_object('codigo','MENSAJE','nombre','Motivo de la negación','tipo','texto','obligatoria',true,'valor_prueba','No se acepta por *criterio clínico*.')
   ),
   ARRAY['ENTRANTES_NEGACION']),
  ('ENTRANTES_CANCELACION_HTML',
   'Oficio de cancelación (entrantes)',
   'ENTRANTES', 'PARCIAL', 'HTML', 'CODIGO+CONFIG',
   'src/lib/oficio.ts',
   'ACTIVA', '1.0',
   'Dashboard operativo entrantes → botón Cancelar',
   'Se genera al registrar la cancelación de un caso entrante.',
   jsonb_build_object('titulo_cancelacion', 'Cancelación registrada'),
   jsonb_build_array(
     jsonb_build_object('codigo','CODIGO','nombre','Código de gestión','tipo','string','obligatoria',true,'valor_prueba','ENT-2026-0003'),
     jsonb_build_object('codigo','MENSAJE','nombre','Motivo de la cancelación','tipo','texto','obligatoria',true,'valor_prueba','El paciente decide no continuar.')
   ),
   ARRAY['ENTRANTES_CANCELACION']),
  ('ENTRANTES_CRUE_ACEPTACION_HTML',
   'Oficio CRUE · aceptación de direccionamiento',
   'ENTRANTES', 'PARCIAL', 'HTML', 'CODIGO+CONFIG',
   'src/lib/oficio.ts',
   'ACTIVA', '1.0',
   'Dashboard operativo entrantes → respuesta CRUE',
   'Aceptación al direccionamiento del CRUE.',
   jsonb_build_object('titulo_crue_acep', 'Aceptación de direccionamiento CRUE'),
   jsonb_build_array(
     jsonb_build_object('codigo','CODIGO','nombre','Código de gestión','tipo','string','obligatoria',true,'valor_prueba','ENT-2026-0004'),
     jsonb_build_object('codigo','MENSAJE','nombre','Cuerpo del oficio','tipo','texto','obligatoria',true,'valor_prueba','Se acepta el direccionamiento del CRUE.')
   ),
   ARRAY['ENTRANTES_CRUE_ACEPTACION']),
  ('ENTRANTES_CRUE_NEGACION_HTML',
   'Oficio CRUE · negación de direccionamiento',
   'ENTRANTES', 'PARCIAL', 'HTML', 'CODIGO+CONFIG',
   'src/lib/oficio.ts',
   'ACTIVA', '1.0',
   'Dashboard operativo entrantes → respuesta CRUE',
   'Negación al direccionamiento del CRUE.',
   jsonb_build_object('titulo_crue_neg', 'Negación al direccionamiento CRUE'),
   jsonb_build_array(
     jsonb_build_object('codigo','CODIGO','nombre','Código de gestión','tipo','string','obligatoria',true,'valor_prueba','ENT-2026-0005'),
     jsonb_build_object('codigo','MENSAJE','nombre','Motivo de la negación','tipo','texto','obligatoria',true,'valor_prueba','No es posible aceptar el direccionamiento.')
   ),
   ARRAY['ENTRANTES_CRUE_NEGACION'])
ON CONFLICT (codigo) DO NOTHING;

-- 6. Siembra: puntos de uso ------------------------------------
INSERT INTO public.puntos_de_uso
  (codigo, nombre, modulo, ruta, ventana, paso, evento, tipo_salida, plantilla_codigo, componente_responsable, notas)
VALUES
  ('ENTRANTES_ACEPTACION', 'Aceptación de caso entrante',
   'ENTRANTES', '/remisiones', 'Dashboard entrantes', 'Respuesta', 'click Aceptar',
   'HTML', 'ENTRANTES_ACEPTACION_HTML',
   'src/components/rc/resultado-card.tsx', 'HTML mostrado y copiado al correo.'),
  ('ENTRANTES_NEGACION', 'Negación de caso entrante',
   'ENTRANTES', '/remisiones', 'Dashboard entrantes', 'Respuesta', 'click Negar',
   'HTML', 'ENTRANTES_NEGACION_HTML',
   'src/components/rc/resultado-card.tsx', NULL),
  ('ENTRANTES_CANCELACION', 'Cancelación de caso entrante',
   'ENTRANTES', '/remisiones', 'Dashboard entrantes', 'Respuesta', 'click Cancelar',
   'HTML', 'ENTRANTES_CANCELACION_HTML',
   'src/components/rc/resultado-card.tsx', NULL),
  ('ENTRANTES_CRUE_ACEPTACION', 'Aceptación CRUE',
   'ENTRANTES', '/remisiones', 'Dashboard entrantes', 'Respuesta CRUE', 'click Aceptar CRUE',
   'HTML', 'ENTRANTES_CRUE_ACEPTACION_HTML',
   'src/components/rc/resultado-card.tsx', NULL),
  ('ENTRANTES_CRUE_NEGACION', 'Negación CRUE',
   'ENTRANTES', '/remisiones', 'Dashboard entrantes', 'Respuesta CRUE', 'click Negar CRUE',
   'HTML', 'ENTRANTES_CRUE_NEGACION_HTML',
   'src/components/rc/resultado-card.tsx', NULL),
  ('ENTRANTES_BITACORA_PDF', 'Bitácora de entrantes',
   'ENTRANTES', '/remisiones', 'Dashboard entrantes', 'Descargas', 'Exportar bitácora',
   'PDF', 'BITACORA_ENTRANTES',
   'src/lib/bitacora-pdf.ts', NULL),
  ('SALIENTES_REPORTE_GENERAL_PDF', 'Reporte general de salientes',
   'SALIENTES', '/remisiones', 'Dashboard salientes', 'Descargas', 'Exportar reporte general',
   'PDF', 'REPORTE_GENERAL_SALIENTES',
   'src/lib/salientes-export.ts', NULL),
  ('SALIENTES_ENTREGA_DOCUMENTAL_PDF', 'Acta de entrega documental y firma QR',
   'SALIENTES', '/remisiones', 'Dashboard salientes', 'Entrega documental', 'Firma QR ambulancia',
   'PDF', 'ENTREGA_FIRMA_QR',
   'src/lib/entrega-firma-pdf.ts', 'Se genera bajo demanda tras firmar por QR.'),
  ('HISTORIAL_EXPORTACION_XLSX', 'Exportación de historial',
   'HISTORIAL', '/historial', 'Historial de casos', 'Descargas', 'Exportar histórico',
   'XLSX', 'HISTORIAL',
   'src/lib/historial-export.ts', NULL),
  ('CUADRO_TURNO_SOLICITUD_PERMISO_PDF', 'Solicitud de permiso TH-FR-09',
   'CUADRO_TURNO', '/cuadro-turno', 'Solicitudes', 'Generar PDF', 'Descargar TH-FR-09',
   'PDF', 'TH-FR-09',
   'src/lib/solicitud-pdf.ts', NULL),
  ('CUADRO_TURNO_MENSUAL_XLSX', 'Cuadro de turno mensual TH-FR-10',
   'CUADRO_TURNO', '/cuadro-turno', 'Cuadro mensual', 'Descargas', 'Exportar cuadro TH-FR-10',
   'XLSX', 'TH-FR-10',
   'src/lib/cuadro-excel.ts', NULL),
  ('CUADRO_TURNO_AUSENTISMO_XLSX', 'Ausentismo TH-FR-48',
   'CUADRO_TURNO', '/cuadro-turno', 'Ausentismo', 'Descargas', 'Exportar TH-FR-48',
   'XLSX', 'TH-FR-48',
   'src/lib/ausentismo-export.ts', NULL)
ON CONFLICT (codigo) DO NOTHING;

-- 7. Actualizar puntos_uso_codigos en plantillas existentes ----
UPDATE public.plantillas_inventario SET puntos_uso_codigos = ARRAY['ENTRANTES_BITACORA_PDF']
  WHERE codigo = 'BITACORA_ENTRANTES';
UPDATE public.plantillas_inventario SET puntos_uso_codigos = ARRAY['SALIENTES_ENTREGA_DOCUMENTAL_PDF']
  WHERE codigo = 'ENTREGA_FIRMA_QR';
UPDATE public.plantillas_inventario SET puntos_uso_codigos = ARRAY['HISTORIAL_EXPORTACION_XLSX']
  WHERE codigo = 'HISTORIAL';
UPDATE public.plantillas_inventario SET puntos_uso_codigos = ARRAY['SALIENTES_REPORTE_GENERAL_PDF']
  WHERE codigo = 'REPORTE_GENERAL_SALIENTES';
UPDATE public.plantillas_inventario SET puntos_uso_codigos = ARRAY['CUADRO_TURNO_SOLICITUD_PERMISO_PDF']
  WHERE codigo = 'TH-FR-09';
UPDATE public.plantillas_inventario SET puntos_uso_codigos = ARRAY['CUADRO_TURNO_MENSUAL_XLSX']
  WHERE codigo = 'TH-FR-10';
UPDATE public.plantillas_inventario SET puntos_uso_codigos = ARRAY['CUADRO_TURNO_AUSENTISMO_XLSX']
  WHERE codigo = 'TH-FR-48';

-- 8. Ajuste de listas de chequeo actuales ----------------------
UPDATE public.checklists
   SET estado_revision = 'EN_REVISION',
       nombre = 'Salientes · Entrega segura (genérica)'
 WHERE codigo = 'SALIENTES_ENTREGA_SEGURA';

UPDATE public.checklists
   SET estado_revision = 'BORRADOR_EN_REVISION'
 WHERE codigo = 'PHD_RADICACION_VALIDACION';

UPDATE public.checklists
   SET estado_revision = 'BORRADOR_SIN_VINCULAR'
 WHERE codigo = 'TURNO_APERTURA';

-- Despublicar la versión activa de PHD (queda visible pero no bloqueante)
UPDATE public.checklist_versiones cv
   SET estado = 'BORRADOR'
  FROM public.checklists c
 WHERE cv.checklist_id = c.id
   AND c.codigo = 'PHD_RADICACION_VALIDACION'
   AND cv.estado = 'ACTIVA';

-- 9. Semilla de versión inicial en plantillas_versiones --------
INSERT INTO public.plantillas_versiones (plantilla_codigo, version, estado, contenido_editable, motivo)
SELECT codigo, 1, 'ACTIVA', contenido_editable, 'Versión inicial sembrada'
  FROM public.plantillas_inventario
 WHERE NOT EXISTS (
   SELECT 1 FROM public.plantillas_versiones pv WHERE pv.plantilla_codigo = plantillas_inventario.codigo
 );
