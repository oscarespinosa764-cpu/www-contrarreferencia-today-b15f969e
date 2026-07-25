-- 1) Deduplicar: conservar el registro más antiguo por (user_id, version).
DELETE FROM public.consentimientos c
USING public.consentimientos c2
WHERE c.user_id = c2.user_id
  AND c.version = c2.version
  AND c.created_at > c2.created_at;

-- 2) Índice único que garantiza idempotencia y habilita ON CONFLICT.
CREATE UNIQUE INDEX IF NOT EXISTS consentimientos_user_version_uidx
  ON public.consentimientos(user_id, version);

-- 3) Grants explícitos (defensivos; RLS ya restringe por auth.uid()).
GRANT SELECT, INSERT ON public.consentimientos TO authenticated;
GRANT ALL ON public.consentimientos TO service_role;