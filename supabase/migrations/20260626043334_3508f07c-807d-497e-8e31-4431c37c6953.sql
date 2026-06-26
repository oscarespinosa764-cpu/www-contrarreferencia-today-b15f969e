CREATE TABLE public.voice_dictation_config (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  modulo TEXT NOT NULL DEFAULT '',
  ventana TEXT NOT NULL DEFAULT '',
  subventana TEXT NOT NULL DEFAULT '',
  nombre_campo TEXT NOT NULL DEFAULT '',
  selector TEXT,
  tipo_campo TEXT NOT NULL DEFAULT 'textarea',
  modo_insercion TEXT NOT NULL DEFAULT 'append',
  idioma TEXT NOT NULL DEFAULT 'es-CO',
  activo BOOLEAN NOT NULL DEFAULT true,
  roles_permitidos TEXT[] NOT NULL DEFAULT ARRAY['admin','operativa']::text[],
  texto_ayuda TEXT,
  creado_por UUID,
  actualizado_por UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.voice_dictation_config TO authenticated;
GRANT ALL ON public.voice_dictation_config TO service_role;

ALTER TABLE public.voice_dictation_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Miembros activos pueden ver configuracion de dictado"
  ON public.voice_dictation_config FOR SELECT
  TO authenticated
  USING (public.is_active_member(auth.uid()));

CREATE POLICY "Solo admin crea puntos de dictado"
  ON public.voice_dictation_config FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Solo admin edita puntos de dictado"
  ON public.voice_dictation_config FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Solo admin elimina puntos de dictado"
  ON public.voice_dictation_config FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_voice_dictation_config_updated_at
  BEFORE UPDATE ON public.voice_dictation_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.voice_dictation_config
  (key, modulo, ventana, subventana, nombre_campo, selector, tipo_campo, modo_insercion, idioma, activo, roles_permitidos)
VALUES
  ('salientes.seguimiento.observaciones', 'Remisiones salientes', 'Dashboard Operativo Salientes', 'Seguimiento', 'Observaciones', '[data-dictation-key="salientes.seguimiento.observaciones"]', 'textarea', 'append', 'es-CO', true, ARRAY['admin','operativa']::text[]),
  ('salientes.seguimiento.plantilla_indigo', 'Remisiones salientes', 'Dashboard Operativo Salientes', 'Seguimiento', 'Plantilla Índigo', '[data-dictation-key="salientes.seguimiento.plantilla_indigo"]', 'textarea', 'append', 'es-CO', true, ARRAY['admin','operativa']::text[]),
  ('salientes.seguimiento.motivo_pendiente', 'Remisiones salientes', 'Dashboard Operativo Salientes', 'Seguimiento', 'Motivo del pendiente', '[data-dictation-key="salientes.seguimiento.motivo_pendiente"]', 'textarea', 'append', 'es-CO', true, ARRAY['admin','operativa']::text[]),
  ('phd.seguimiento.observaciones', 'PHD / PAD / O2 / Especiales', 'Dashboard Operativo', 'Seguimiento', 'Observaciones', '[data-dictation-key="phd.seguimiento.observaciones"]', 'textarea', 'append', 'es-CO', true, ARRAY['admin','operativa']::text[]),
  ('phd.seguimiento.plantilla_indigo', 'PHD / PAD / O2 / Especiales', 'Dashboard Operativo', 'Seguimiento', 'Plantilla Índigo', '[data-dictation-key="phd.seguimiento.plantilla_indigo"]', 'textarea', 'append', 'es-CO', true, ARRAY['admin','operativa']::text[]),
  ('referencia_interna.seguimiento.observaciones', 'Referencias internas', 'Dashboard Operativo', 'Seguimiento', 'Observaciones', '[data-dictation-key="referencia_interna.seguimiento.observaciones"]', 'textarea', 'append', 'es-CO', true, ARRAY['admin','operativa']::text[]),
  ('pendientes.seguimiento.observaciones', 'Pendientes', 'Dashboard Operativo', 'Seguimiento', 'Observaciones', '[data-dictation-key="pendientes.seguimiento.observaciones"]', 'textarea', 'append', 'es-CO', true, ARRAY['admin','operativa']::text[]),
  ('salientes.nuevo.justificacion', 'Remisiones salientes', 'Nuevo registro', 'Datos clínicos', 'Justificación de remisión', '[data-dictation-key="salientes.nuevo.justificacion"]', 'textarea', 'append', 'es-CO', true, ARRAY['admin','operativa']::text[]),
  ('salientes.nuevo.observaciones', 'Remisiones salientes', 'Nuevo registro', 'Datos clínicos', 'Observaciones', '[data-dictation-key="salientes.nuevo.observaciones"]', 'textarea', 'append', 'es-CO', true, ARRAY['admin','operativa']::text[]),
  ('reglas.aviso.mensaje', 'Reglas y Alertas', 'Reglas y Alertas', 'Aviso manual', 'Mensaje del aviso', '[data-dictation-key="reglas.aviso.mensaje"]', 'textarea', 'append', 'es-CO', true, ARRAY['admin','operativa']::text[]),
  ('reglas.regla.mensaje', 'Reglas y Alertas', 'Reglas y Alertas', 'Regla operativa', 'Mensaje del aviso', '[data-dictation-key="reglas.regla.mensaje"]', 'textarea', 'append', 'es-CO', true, ARRAY['admin','operativa']::text[]),
  ('reglas.regla.accion', 'Reglas y Alertas', 'Reglas y Alertas', 'Regla operativa', 'Acción sugerida', '[data-dictation-key="reglas.regla.accion"]', 'textarea', 'append', 'es-CO', true, ARRAY['admin','operativa']::text[]),
  ('red.novedades', 'Red / Disponibilidad IPS', 'Red / Disponibilidad IPS', 'Registro IPS', 'Novedades', '[data-dictation-key="red.novedades"]', 'textarea', 'append', 'es-CO', true, ARRAY['admin','operativa']::text[]),
  ('red.observaciones', 'Red / Disponibilidad IPS', 'Red / Disponibilidad IPS', 'Registro IPS', 'Observaciones generales', '[data-dictation-key="red.observaciones"]', 'textarea', 'append', 'es-CO', true, ARRAY['admin','operativa']::text[])
ON CONFLICT (key) DO NOTHING;