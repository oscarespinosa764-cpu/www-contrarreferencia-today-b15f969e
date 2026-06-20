REVOKE EXECUTE ON FUNCTION public.registrar_auditoria(text, text, text, text, text, jsonb, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.registrar_auditoria(text, text, text, text, text, jsonb, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.registrar_auditoria(text, text, text, text, text, jsonb, text, text) TO authenticated;