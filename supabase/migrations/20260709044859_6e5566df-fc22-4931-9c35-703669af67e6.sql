-- user_signatures: modelo append-only + soft-delete (active=false).
-- Se retira el borrado físico ordinario vía Data API para authenticated.
-- Reversible: recrear la política sig_delete y volver a otorgar DELETE.
DROP POLICY IF EXISTS sig_delete ON public.user_signatures;
REVOKE DELETE, TRUNCATE ON public.user_signatures FROM authenticated;