-- ============ notification_channels ============
CREATE TABLE public.notification_channels (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  channel_type TEXT NOT NULL UNIQUE,
  enabled BOOLEAN NOT NULL DEFAULT false,
  display_name TEXT,
  destination_label TEXT,
  destination_id TEXT,
  bot_token TEXT,
  token_configured BOOLEAN NOT NULL DEFAULT false,
  config_status TEXT NOT NULL DEFAULT 'sin_configurar',
  allowed_alert_types JSONB NOT NULL DEFAULT '[]'::jsonb,
  message_template TEXT,
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_test_at TIMESTAMPTZ,
  last_success_at TIMESTAMPTZ,
  last_error_at TIMESTAMPTZ,
  last_error_message TEXT,
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.notification_channels TO authenticated;
GRANT ALL ON public.notification_channels TO service_role;

ALTER TABLE public.notification_channels ENABLE ROW LEVEL SECURITY;

-- Solo administradores gestionan la configuración de canales (incluye lectura).
CREATE POLICY "Admins gestionan canales" ON public.notification_channels
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_notification_channels_updated_at
  BEFORE UPDATE ON public.notification_channels
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ notification_logs ============
CREATE TABLE public.notification_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  channel_type TEXT NOT NULL,
  alert_type TEXT,
  module TEXT,
  reference_id TEXT,
  recipient TEXT,
  message_preview TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  error_message TEXT,
  attempts INTEGER NOT NULL DEFAULT 1,
  sent_at TIMESTAMPTZ,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.notification_logs TO authenticated;
GRANT ALL ON public.notification_logs TO service_role;

ALTER TABLE public.notification_logs ENABLE ROW LEVEL SECURITY;

-- Solo administradores leen el historial completo.
CREATE POLICY "Admins leen historial" ON public.notification_logs
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Cualquier usuario activo puede registrar un envío (eventos disparados por operativos).
CREATE POLICY "Miembros activos registran envios" ON public.notification_logs
  FOR INSERT TO authenticated
  WITH CHECK (public.is_active_member(auth.uid()));

CREATE INDEX idx_notification_logs_dedup
  ON public.notification_logs (channel_type, alert_type, reference_id, created_at DESC);
