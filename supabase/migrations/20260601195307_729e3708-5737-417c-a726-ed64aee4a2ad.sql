-- These helpers are required by RLS policies (all scoped to authenticated),
-- so remove public/anon execute rights and grant only to authenticated.
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_edit(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_active_member(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_edit(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_active_member(uuid) TO authenticated;