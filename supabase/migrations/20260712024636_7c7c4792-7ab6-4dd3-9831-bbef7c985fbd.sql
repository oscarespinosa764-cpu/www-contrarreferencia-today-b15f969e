CREATE TABLE public.reglas_coordinacion (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  codigo text NOT NULL UNIQUE,
  nombre text NOT NULL,
  descripcion text,
  modulo text NOT NULL DEFAULT 'REMISIONES',
  subventana text NOT NULL DEFAULT 'ENTRANTES',
  evento text,
  condicion text,
  umbral numeric,
  unidad text,
  prioridad text NOT NULL DEFAULT 'MEDIO',
  activo boolean NOT NULL DEFAULT true,
  archivado boolean NOT NULL DEFAULT false,
  orden integer NOT NULL DEFAULT 0,
  es_base boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX reglas_coordinacion_subventana_idx ON public.reglas_coordinacion (subventana);
CREATE INDEX reglas_coordinacion_activo_idx ON public.reglas_coordinacion (activo);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.reglas_coordinacion TO authenticated;
GRANT ALL ON public.reglas_coordinacion TO service_role;

ALTER TABLE public.reglas_coordinacion ENABLE ROW LEVEL SECURITY;

CREATE POLICY "reglas_coord_select_active_members"
  ON public.reglas_coordinacion FOR SELECT TO authenticated
  USING (public.is_active_member(auth.uid()));

CREATE POLICY "reglas_coord_insert_admin"
  ON public.reglas_coordinacion FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "reglas_coord_update_admin"
  ON public.reglas_coordinacion FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "reglas_coord_delete_admin"
  ON public.reglas_coordinacion FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_reglas_coordinacion_updated_at
  BEFORE UPDATE ON public.reglas_coordinacion
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.reglas_coordinacion
  (codigo, nombre, descripcion, modulo, subventana, evento, condicion, umbral, unidad, prioridad, orden, es_base)
VALUES
  ('ALT-ENT-CAN-ANTICIPADA','Cancelación anticipada','Se cancela un cupo cuando todavía quedaba tiempo efectivo de vencimiento.','REMISIONES','ENTRANTES','Cancelación de cupo','Cancelación con tiempo de cupo aún vigente',0,'min','ALTO',1,true),
  ('ALT-ENT-CAN-TARDIA','Cancelación tardía posterior al vencimiento','La cancelación se registra más de 4 horas después del vencimiento efectivo del cupo.','REMISIONES','ENTRANTES','Cancelación de cupo','Cancelación registrada tras el margen de 4 h del vencimiento',4,'horas','ALTO',2,true),
  ('ALT-ENT-INGRESO-TARDIO','Ingreso tardío posterior a cancelación o vencimiento','El personal confirma el ingreso del paciente después de una cancelación o vencimiento (ventana de 24 h).','REMISIONES','ENTRANTES','Confirmación de ingreso','Ingreso confirmado tras cancelación/vencimiento (≤ 24 h)',24,'horas','ALTO',3,true),
  ('ALT-ENT-INGRESO-SIN-REFERENCIA','Ingreso sin proceso de referencia','Ingresa un paciente cuyo caso fue negado, no aceptado o cerrado sin referencia formal.','REMISIONES','ENTRANTES','Confirmación de ingreso','Ingreso posterior a negación / no aceptación',24,'horas','ALTO',4,true),
  ('ALT-ENT-SIN-GESTION-PREVIA','Paciente sin gestión previa de referencia','El paciente llega directamente a CEDIM IPS sin correo, comunicación de la IPS, aceptación, negación ni direccionamiento CRUE: no existía ninguna gestión previa registrada.','REMISIONES','ENTRANTES','Ingreso sin gestión previa','Ingreso registrado sin proceso de referencia previo',NULL,NULL,'ALTO',5,true),
  ('ALT-ENT-CIERRE-SIN-NOTIFICACION','Cierre sin notificación','Una aceptación vencida se cierra administrativamente al crearse una nueva aceptación.','REMISIONES','ENTRANTES','Nueva aceptación sobre cupo vencido','Aceptación anterior vencida no cerrada correctamente',NULL,NULL,'MEDIO',6,true),
  ('ALT-SAL-ALTA-SIN-ACEPTACION','Prioridad alta sin aceptación','Caso de prioridad alta pendiente de aceptación durante más de 12 horas.','REMISIONES','SALIENTES','Caso pendiente de aceptación','Prioridad alta pendiente de aceptación',12,'horas','ALTO',7,true),
  ('ALT-SAL-SIN-SEGUIMIENTO-TURNO','Caso sin seguimiento durante más de un turno','Caso activo sin seguimiento válido durante más de un turno operativo (según Cuadro de Turno).','REMISIONES','SALIENTES','Caso activo sin seguimiento','Sin seguimiento válido por más de un turno',1,'turnos','MEDIO',8,true),
  ('ALT-SAL-ACEPTADO-SIN-AMBULANCIA','Aceptación sin ambulancia coordinada','Aceptación registrada sin ambulancia coordinada durante más de 12 horas.','REMISIONES','SALIENTES','Aceptación registrada','Aceptado sin ambulancia coordinada',12,'horas','MEDIO',9,true),
  ('ALT-SAL-AMBULANCIA-SIN-ARRIBO','Ambulancia coordinada sin arribo o entrega documental','Ambulancia coordinada sin registro de arribo o entrega documental durante más de 8 horas.','REMISIONES','SALIENTES','Ambulancia coordinada','Sin arribo / entrega documental (incluye QR o firma pendiente)',8,'horas','ALTO',10,true);