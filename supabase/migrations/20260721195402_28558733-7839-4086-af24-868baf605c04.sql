
-- 1) notification_channels: multi-destino por canal_type
ALTER TABLE public.notification_channels
  DROP CONSTRAINT IF EXISTS notification_channels_channel_type_key;

ALTER TABLE public.notification_channels
  ADD COLUMN IF NOT EXISTS chat_type text,
  ADD COLUMN IF NOT EXISTS chat_title text,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS allowed_priorities jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS allowed_modules jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS schedule jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS silent boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS link_url text;

-- Índice compuesto para lookups de despacho
CREATE INDEX IF NOT EXISTS idx_notification_channels_type_enabled
  ON public.notification_channels(channel_type, enabled);

-- Unicidad de destino por (channel_type + destination_id) — evita duplicar el mismo chat_id
CREATE UNIQUE INDEX IF NOT EXISTS uq_notification_channels_type_dest
  ON public.notification_channels(channel_type, destination_id)
  WHERE destination_id IS NOT NULL;

-- 2) notification_logs: idempotencia y reintentos
ALTER TABLE public.notification_logs
  ADD COLUMN IF NOT EXISTS idempotency_key text,
  ADD COLUMN IF NOT EXISTS next_retry_at timestamptz,
  ADD COLUMN IF NOT EXISTS channel_id uuid REFERENCES public.notification_channels(id) ON DELETE SET NULL;

-- Idempotencia real: una única fila 'sent' por clave
CREATE UNIQUE INDEX IF NOT EXISTS uq_notification_logs_idempotency_sent
  ON public.notification_logs(idempotency_key)
  WHERE status = 'sent' AND idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_notification_logs_retry
  ON public.notification_logs(next_retry_at)
  WHERE status = 'retry';

CREATE INDEX IF NOT EXISTS idx_notification_logs_channel_ref
  ON public.notification_logs(channel_type, reference_id, alert_type);
