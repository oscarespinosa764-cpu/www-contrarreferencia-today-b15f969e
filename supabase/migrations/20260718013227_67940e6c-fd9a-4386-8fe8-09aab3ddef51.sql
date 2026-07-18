SELECT cron.unschedule('evaluar-alertas-coordinacion-salientes');
SELECT cron.schedule(
  'evaluar-alertas-coordinacion-salientes',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://project--62729df4-edf5-41fe-9a4a-6aa29fbd642b.lovable.app/api/public/hooks/evaluar-alertas-coordinacion',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'email_queue_service_role_key'
      )
    ),
    body := '{}'::jsonb
  ) as request_id;
  $$
);