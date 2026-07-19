
-- =============================================================================
-- Fase A — Q1 + Q7 · Catálogos canónicos, dependencias, inventario de plantillas
-- Migración idempotente y no destructiva.
-- =============================================================================

-- 1) Extender public.catalogos con columnas opcionales -------------------------
ALTER TABLE public.catalogos
  ADD COLUMN IF NOT EXISTS codigo TEXT,
  ADD COLUMN IF NOT EXISTS orden INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS created_by UUID,
  ADD COLUMN IF NOT EXISTS updated_by UUID;

-- Índice único parcial (solo aplica cuando codigo no es null; no rompe históricos)
CREATE UNIQUE INDEX IF NOT EXISTS catalogos_tipo_codigo_uniq
  ON public.catalogos (tipo, codigo)
  WHERE codigo IS NOT NULL;

-- 2) Nueva tabla: catalogo_dependencias ---------------------------------------
CREATE TABLE IF NOT EXISTS public.catalogo_dependencias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  catalogo_tipo TEXT NOT NULL,
  elemento_id UUID NULL REFERENCES public.catalogos(id) ON DELETE CASCADE,
  modulo TEXT NOT NULL,
  ruta TEXT NULL,
  ventana TEXT NULL,
  formulario TEXT NULL,
  campo TEXT NULL,
  tipo_control TEXT NULL,
  obligatorio BOOLEAN NOT NULL DEFAULT false,
  componente TEXT NULL,
  notas TEXT NULL,
  verificado_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.catalogo_dependencias TO authenticated;
GRANT ALL ON public.catalogo_dependencias TO service_role;

ALTER TABLE public.catalogo_dependencias ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  DROP POLICY IF EXISTS dep_select_auth ON public.catalogo_dependencias;
  DROP POLICY IF EXISTS dep_admin_all ON public.catalogo_dependencias;
END $$;

CREATE POLICY dep_select_auth
  ON public.catalogo_dependencias
  FOR SELECT
  TO authenticated
  USING (public.is_active_member(auth.uid()));

CREATE POLICY dep_admin_all
  ON public.catalogo_dependencias
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS dep_by_tipo ON public.catalogo_dependencias (catalogo_tipo);
CREATE INDEX IF NOT EXISTS dep_by_elemento ON public.catalogo_dependencias (elemento_id);

CREATE OR REPLACE FUNCTION public.trg_catalogo_dependencias_updated()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = 'public' AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS catalogo_dependencias_updated_at ON public.catalogo_dependencias;
CREATE TRIGGER catalogo_dependencias_updated_at
  BEFORE UPDATE ON public.catalogo_dependencias
  FOR EACH ROW EXECUTE FUNCTION public.trg_catalogo_dependencias_updated();

-- 3) Nueva tabla: plantillas_inventario ---------------------------------------
CREATE TABLE IF NOT EXISTS public.plantillas_inventario (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo TEXT NOT NULL UNIQUE,
  nombre TEXT NOT NULL,
  modulo TEXT NOT NULL,
  formato TEXT NOT NULL CHECK (formato IN ('PDF','EXCEL','TEXTO','HTML')),
  origen TEXT NOT NULL CHECK (origen IN ('CODIGO','CODIGO+CONFIG','CONFIG')),
  generador TEXT NULL,
  estado TEXT NOT NULL DEFAULT 'ACTIVA',
  version TEXT NOT NULL DEFAULT '1.0',
  dependencia TEXT NULL,
  editable_nivel TEXT NOT NULL DEFAULT 'SOLO_LECTURA'
    CHECK (editable_nivel IN ('SOLO_LECTURA','PARCIAL','COMPLETA')),
  notas TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.plantillas_inventario TO authenticated;
GRANT ALL ON public.plantillas_inventario TO service_role;

ALTER TABLE public.plantillas_inventario ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  DROP POLICY IF EXISTS plinv_select_auth ON public.plantillas_inventario;
  DROP POLICY IF EXISTS plinv_admin_all ON public.plantillas_inventario;
END $$;

CREATE POLICY plinv_select_auth
  ON public.plantillas_inventario
  FOR SELECT
  TO authenticated
  USING (public.is_active_member(auth.uid()));

CREATE POLICY plinv_admin_all
  ON public.plantillas_inventario
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.trg_plantillas_inventario_updated()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = 'public' AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS plantillas_inventario_updated_at ON public.plantillas_inventario;
CREATE TRIGGER plantillas_inventario_updated_at
  BEFORE UPDATE ON public.plantillas_inventario
  FOR EACH ROW EXECUTE FUNCTION public.trg_plantillas_inventario_updated();

-- 4) Auditoría sanitizada de catálogos y plantillas ---------------------------
CREATE OR REPLACE FUNCTION public.trg_audit_catalogo_plantilla()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_accion TEXT;
  v_id TEXT;
  v_resumen JSONB;
BEGIN
  IF v_uid IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  v_accion := TG_OP;
  IF TG_OP = 'DELETE' THEN
    v_id := (row_to_json(OLD)::jsonb ->> 'id');
    v_resumen := jsonb_build_object(
      'tipo', row_to_json(OLD)::jsonb -> 'tipo',
      'codigo', row_to_json(OLD)::jsonb -> 'codigo',
      'valor', row_to_json(OLD)::jsonb -> 'valor',
      'activo', row_to_json(OLD)::jsonb -> 'activo'
    );
  ELSE
    v_id := (row_to_json(NEW)::jsonb ->> 'id');
    v_resumen := jsonb_build_object(
      'tipo', row_to_json(NEW)::jsonb -> 'tipo',
      'codigo', row_to_json(NEW)::jsonb -> 'codigo',
      'valor', row_to_json(NEW)::jsonb -> 'valor',
      'activo', row_to_json(NEW)::jsonb -> 'activo'
    );
  END IF;

  PERFORM public.registrar_auditoria_srv(
    v_uid,
    TG_TABLE_NAME || '.' || v_accion,
    'catalogo_plantilla',
    TG_TABLE_NAME,
    v_id,
    'exito',
    v_resumen,
    NULL,
    NULL
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;

REVOKE ALL ON FUNCTION public.trg_audit_catalogo_plantilla() FROM PUBLIC;

DROP TRIGGER IF EXISTS audit_catalogos ON public.catalogos;
CREATE TRIGGER audit_catalogos
  AFTER INSERT OR UPDATE OR DELETE ON public.catalogos
  FOR EACH ROW EXECUTE FUNCTION public.trg_audit_catalogo_plantilla();

DROP TRIGGER IF EXISTS audit_plantillas ON public.plantillas;
CREATE TRIGGER audit_plantillas
  AFTER INSERT OR UPDATE OR DELETE ON public.plantillas
  FOR EACH ROW EXECUTE FUNCTION public.trg_audit_catalogo_plantilla();

DROP TRIGGER IF EXISTS audit_dependencias ON public.catalogo_dependencias;
CREATE TRIGGER audit_dependencias
  AFTER INSERT OR UPDATE OR DELETE ON public.catalogo_dependencias
  FOR EACH ROW EXECUTE FUNCTION public.trg_audit_catalogo_plantilla();

DROP TRIGGER IF EXISTS audit_plantillas_inventario ON public.plantillas_inventario;
CREATE TRIGGER audit_plantillas_inventario
  AFTER INSERT OR UPDATE OR DELETE ON public.plantillas_inventario
  FOR EACH ROW EXECUTE FUNCTION public.trg_audit_catalogo_plantilla();

-- 5) Seeds de los 10 catálogos canónicos --------------------------------------
-- Solo inserta cuando no exista ya un elemento con el mismo (tipo, codigo).
INSERT INTO public.catalogos (tipo, valor, codigo, orden, activo, metadata)
VALUES
  -- TIPO_AMBULANCIA
  ('TIPO_AMBULANCIA','TAB','TAB',10,true,'{"desc":"Ambulancia básica"}'::jsonb),
  ('TIPO_AMBULANCIA','TAM','TAM',20,true,'{"desc":"Ambulancia medicalizada"}'::jsonb),
  ('TIPO_AMBULANCIA','TAM-N','TAM-N',30,true,'{"desc":"Ambulancia medicalizada neonatal"}'::jsonb),
  ('TIPO_AMBULANCIA','AÉREA','AEREA',40,true,'{"desc":"Ambulancia aérea"}'::jsonb),
  -- TIPO_EAPB (tipo de entidad, distinto de la lista de EAPB en sí)
  ('TIPO_EAPB','EPS','EPS',10,true,'{}'::jsonb),
  ('TIPO_EAPB','EAPB','EAPB',20,true,'{}'::jsonb),
  ('TIPO_EAPB','ARL','ARL',30,true,'{}'::jsonb),
  ('TIPO_EAPB','Aseguradora','ASEGURADORA',40,true,'{}'::jsonb),
  ('TIPO_EAPB','Póliza','POLIZA',50,true,'{}'::jsonb),
  ('TIPO_EAPB','SOAT','SOAT',60,true,'{}'::jsonb),
  ('TIPO_EAPB','Particular','PARTICULAR',70,true,'{}'::jsonb),
  ('TIPO_EAPB','Otra','OTRA',99,true,'{}'::jsonb),
  -- TIPO_RECURSO_RED
  ('TIPO_RECURSO_RED','URL','URL',10,true,'{}'::jsonb),
  ('TIPO_RECURSO_RED','Correo','CORREO',20,true,'{}'::jsonb),
  ('TIPO_RECURSO_RED','Teléfono','TELEFONO',30,true,'{}'::jsonb),
  ('TIPO_RECURSO_RED','Texto informativo','TEXTO',40,true,'{}'::jsonb),
  -- MOTIVO_EXENTO_CUPO
  ('MOTIVO_EXENTO_CUPO','Cita médica','CITA_MEDICA',10,true,'{}'::jsonb),
  ('MOTIVO_EXENTO_CUPO','Calamidad','CALAMIDAD',20,true,'{}'::jsonb),
  -- TIPO_INDICADOR
  ('TIPO_INDICADOR','PROPORCION','PROPORCION',10,true,'{}'::jsonb),
  ('TIPO_INDICADOR','OPORTUNIDAD','OPORTUNIDAD',20,true,'{}'::jsonb),
  ('TIPO_INDICADOR','PROMEDIO','PROMEDIO',30,true,'{}'::jsonb),
  -- SEDE (valores reales encontrados en profiles y red_operativa)
  ('SEDE','CEDIM IPS','CEDIM_IPS',10,true,'{"origen":"profiles+red_operativa"}'::jsonb),
  ('SEDE','SEDE PRINCIPAL','SEDE_PRINCIPAL',20,true,'{"origen":"red_operativa"}'::jsonb),
  ('SEDE','SAN VICENTE','SAN_VICENTE',30,true,'{"origen":"red_operativa"}'::jsonb),
  ('SEDE','CLINICA GLORIA PATRICIA PINZÓN','CLINICA_GPP',40,true,'{"origen":"red_operativa"}'::jsonb),
  ('SEDE','CONSULTA ESPECIALIZADA','CONSULTA_ESPECIALIZADA',50,true,'{"origen":"red_operativa"}'::jsonb),
  ('SEDE','SERVICIO DE EMERGENCIAS MEDICAS SEM','SEM',60,true,'{"origen":"red_operativa"}'::jsonb),
  ('SEDE','PRINCIPAL','PRINCIPAL',70,false,'{"origen":"red_operativa","nota":"posible duplicado de SEDE PRINCIPAL, pendiente conciliación manual"}'::jsonb),
  -- CARGO (valores reales de profiles)
  ('CARGO','COORDINADOR DE REFERENCIA Y CONTRARREFERENCIA','COORDINADOR_REFERENCIA',10,true,'{"origen":"profiles"}'::jsonb),
  ('CARGO','AUXILIAR DE REFERENCIA','AUXILIAR_REFERENCIA',20,true,'{"origen":"profiles"}'::jsonb),
  ('CARGO','USUARIO DE PRUEBA','USUARIO_PRUEBA',99,false,'{"origen":"profiles","nota":"no operativo"}'::jsonb),
  -- AREA_CRUE (seed base; los valores reales se conciliarán en fases posteriores)
  ('AREA_CRUE','CRUE Departamental','CRUE_DEPARTAMENTAL',10,true,'{}'::jsonb),
  ('AREA_CRUE','CRUE Distrital','CRUE_DISTRITAL',20,true,'{}'::jsonb),
  ('AREA_CRUE','CRUE Municipal','CRUE_MUNICIPAL',30,true,'{}'::jsonb),
  -- TIPO_NOVEDAD_SALIENTE (seed inicial; los ambiguos quedan pendientes)
  ('TIPO_NOVEDAD_SALIENTE','Cambio de EAPB','CAMBIO_EAPB',10,true,'{}'::jsonb),
  ('TIPO_NOVEDAD_SALIENTE','Cambio de unidad','CAMBIO_UNIDAD',20,true,'{}'::jsonb),
  ('TIPO_NOVEDAD_SALIENTE','Cambio de IPS destino','CAMBIO_IPS_DESTINO',30,true,'{}'::jsonb),
  ('TIPO_NOVEDAD_SALIENTE','Ampliación de justificación','AMPLIACION_JUSTIFICACION',40,true,'{}'::jsonb),
  ('TIPO_NOVEDAD_SALIENTE','Retiro voluntario del paciente','RETIRO_VOLUNTARIO',50,true,'{}'::jsonb),
  -- MOTIVO_CIERRE_ENTRANTE (seed inicial)
  ('MOTIVO_CIERRE_ENTRANTE','Ingreso efectivo','INGRESO_EFECTIVO',10,true,'{}'::jsonb),
  ('MOTIVO_CIERRE_ENTRANTE','Negación de la solicitud','NEGACION',20,true,'{}'::jsonb),
  ('MOTIVO_CIERRE_ENTRANTE','Cancelación por la IPS remitente','CANCELACION_REMITENTE',30,true,'{}'::jsonb),
  ('MOTIVO_CIERRE_ENTRANTE','Cancelación por el paciente','CANCELACION_PACIENTE',40,true,'{}'::jsonb),
  ('MOTIVO_CIERRE_ENTRANTE','Rechazo por criterios clínicos','RECHAZO_CLINICO',50,true,'{}'::jsonb),
  ('MOTIVO_CIERRE_ENTRANTE','Sin cupo disponible','SIN_CUPO',60,true,'{}'::jsonb)
ON CONFLICT (tipo, codigo) WHERE codigo IS NOT NULL DO NOTHING;

-- Rellena codigo/orden en filas antiguas de tipos migrados donde aún es NULL,
-- usando la primera coincidencia por valor. No sobreescribe códigos existentes.
UPDATE public.catalogos c
   SET codigo = upper(regexp_replace(c.valor, '[^A-Za-z0-9]+', '_', 'g'))
 WHERE c.codigo IS NULL
   AND c.tipo IN (
     'TIPO_AMBULANCIA','TIPO_EAPB','TIPO_RECURSO_RED','MOTIVO_EXENTO_CUPO',
     'TIPO_INDICADOR','SEDE','CARGO','AREA_CRUE',
     'TIPO_NOVEDAD_SALIENTE','MOTIVO_CIERRE_ENTRANTE'
   );

-- 6) Seed de dependencias determinísticas conocidas ---------------------------
INSERT INTO public.catalogo_dependencias
  (catalogo_tipo, modulo, ruta, ventana, formulario, campo, tipo_control, obligatorio, componente, notas)
VALUES
  ('TIPO_AMBULANCIA','Red / Disponibilidad IPS','/red-ips','Registro IPS','red-form-dialog','tipo_ambulancia','select',false,'src/components/red/red-form-dialog.tsx','Selector de tipos de ambulancia'),
  ('TIPO_AMBULANCIA','Remisiones salientes','/remisiones','Nuevo/seguimiento','remisiones','tipo_ambulancia','select',false,'src/components/remisiones/*','Fuente canónica para ambulancia'),
  ('TIPO_AMBULANCIA','PHD/PAD/O2','/remisiones','Ciclo domiciliario','phd-ciclo-panel','tipo_ambulancia','select',false,'src/components/remisiones/phd-ciclo-panel.tsx',NULL),
  ('TIPO_EAPB','Red / Disponibilidad IPS','/red-ips','Registro IPS','red-form-dialog','tipo_eapb','select',false,'src/components/red/red-form-dialog.tsx','Clasificación de la entidad'),
  ('TIPO_RECURSO_RED','Red / Disponibilidad IPS','/red-ips','Registro IPS','red-form-dialog','tipo_recurso','select',false,'src/components/red/red-form-dialog.tsx','Tipo del recurso publicado'),
  ('EAPB','Remisiones entrantes','/casos','Nuevo registro','nuevo-registro-dialog','eapb','autocomplete',true,'src/components/rc/registrar-wizard.tsx','Fuente única de EAPB'),
  ('EAPB','Remisiones salientes','/remisiones','Nuevo/seguimiento','remisiones','eapb','autocomplete',true,'src/components/remisiones/*',NULL),
  ('IPS','Remisiones salientes','/remisiones','Nuevo registro','remisiones','ips_destino','autocomplete',true,'src/components/remisiones/*',NULL),
  ('ESPECIALIDAD','Remisiones salientes','/remisiones','Nuevo registro','remisiones','especialidad','autocomplete',true,'src/components/remisiones/*',NULL),
  ('MOTIVO_EXENTO_CUPO','Cuadro de turno','/cuadro-turno','Solicitudes y ausentismo','solicitud-form-dialog','motivo_exento','select',false,'src/components/cuadro-turno/solicitud-form-dialog.tsx','Motivos que eximen del cupo mensual'),
  ('MOTIVO_PERMISO','Cuadro de turno','/cuadro-turno','Solicitudes y ausentismo','solicitud-form-dialog','motivo','select',true,'src/components/cuadro-turno/solicitud-form-dialog.tsx','Ya consumido desde catalogos (tipo=MOTIVO_PERMISO)'),
  ('TIPO_INDICADOR','Indicadores','/indicadores','Ficha de indicador','indicadores-datos','tipo_indicador','select',true,'src/components/coordinacion/indicadores-datos.tsx',NULL),
  ('SEDE','Usuarios','/control-mando','Usuarios','usuarios-panel','sede','select',false,'src/components/coordinacion/usuarios-panel.tsx','Sede del funcionario'),
  ('CARGO','Usuarios','/control-mando','Usuarios','usuarios-panel','cargo','select',false,'src/components/coordinacion/usuarios-panel.tsx','Cargo del funcionario'),
  ('AREA_CRUE','Referencias entrantes','/casos','Seguimiento','seguimiento-dialog','area_crue','select',false,'src/components/remisiones/seguimiento-dialog.tsx',NULL),
  ('TIPO_NOVEDAD_SALIENTE','Remisiones salientes','/remisiones','Seguimiento','seguimiento-dialog','tipo_novedad','select',false,'src/components/remisiones/seguimiento-dialog.tsx',NULL),
  ('MOTIVO_CIERRE_ENTRANTE','Remisiones entrantes','/casos','Seguimiento','seguimiento-dialog','motivo_cierre','select',false,'src/components/remisiones/seguimiento-dialog.tsx',NULL)
ON CONFLICT DO NOTHING;

-- 7) Inventario de las 7 plantillas de código ---------------------------------
INSERT INTO public.plantillas_inventario
  (codigo, nombre, modulo, formato, origen, generador, estado, version, dependencia, editable_nivel, notas)
VALUES
  ('REPORTE_GENERAL_SALIENTES','Reporte general de salientes','Remisiones salientes','PDF','CODIGO+CONFIG','src/lib/salientes-export.ts','ACTIVA','1.0','Salientes → Exportar reporte','PARCIAL','Encabezado, columnas y pie serán editables en la fase de plantillas'),
  ('TH-FR-09','Solicitud de permiso / cambio de turno','Cuadro de turno','PDF','CODIGO+CONFIG','src/lib/solicitud-pdf.ts','ACTIVA','1.0','Cuadro de turno → Solicitudes → Generar PDF','PARCIAL','Encabezado, firmas y bloques serán editables en la fase de plantillas'),
  ('TH-FR-10','Cuadro de turno mensual','Cuadro de turno','EXCEL','CODIGO','src/lib/cuadro-excel.ts','ACTIVA','1.0','Cuadro de turno → Exportar Excel','SOLO_LECTURA','DISEÑO ADMINISTRABLE PENDIENTE DE DESARROLLO'),
  ('TH-FR-48','Reporte de ausentismo','Cuadro de turno','EXCEL','CODIGO','src/lib/ausentismo-export.ts','ACTIVA','1.0','Cuadro de turno → Ausentismo → Exportar','SOLO_LECTURA','DISEÑO ADMINISTRABLE PENDIENTE DE DESARROLLO'),
  ('HISTORIAL','Historial de casos','Historial','EXCEL','CODIGO','src/lib/historial-export.ts','ACTIVA','1.0','Historial → Exportar','SOLO_LECTURA','DISEÑO ADMINISTRABLE PENDIENTE DE DESARROLLO'),
  ('BITACORA_ENTRANTES','Bitácora de entrantes','Remisiones entrantes','PDF','CODIGO','src/lib/bitacora-pdf.ts','ACTIVA','1.0','Entrantes → Bitácora','SOLO_LECTURA','DISEÑO ADMINISTRABLE PENDIENTE DE DESARROLLO'),
  ('ENTREGA_FIRMA_QR','Entrega firmada por QR','Remisiones','PDF','CODIGO','src/lib/entrega-firma-pdf.ts','ACTIVA','1.0','Entrega documental → Firma QR','SOLO_LECTURA','DISEÑO ADMINISTRABLE PENDIENTE DE DESARROLLO')
ON CONFLICT (codigo) DO NOTHING;
