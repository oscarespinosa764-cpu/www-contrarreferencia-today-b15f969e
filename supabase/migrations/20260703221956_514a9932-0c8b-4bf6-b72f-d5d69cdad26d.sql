-- El token nunca debe poder leerse desde el cliente (ni siquiera por admins).
-- Solo el rol de servicio (funciones backend) puede leerlo para enviar.
REVOKE SELECT (bot_token) ON public.notification_channels FROM authenticated;
