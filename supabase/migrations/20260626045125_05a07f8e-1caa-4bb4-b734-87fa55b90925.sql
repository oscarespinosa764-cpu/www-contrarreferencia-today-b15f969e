-- Revocar ejecución directa de las funciones de auditoría a usuarios autenticados/anónimos.
-- Esto evita que cualquier miembro activo inserte entradas arbitrarias llamando la RPC directamente.
REVOKE ALL ON FUNCTION private.registrar_auditoria(text, text, text, text, text, jsonb, text, text) FROM authenticated;
REVOKE ALL ON FUNCTION private.registrar_auditoria(text, text, text, text, text, jsonb, text, text) FROM anon;
REVOKE ALL ON FUNCTION private.registrar_auditoria(text, text, text, text, text, jsonb, text, text) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.registrar_auditoria(text, text, text, text, text, jsonb, text, text) FROM authenticated;
REVOKE ALL ON FUNCTION public.registrar_auditoria(text, text, text, text, text, jsonb, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.registrar_auditoria(text, text, text, text, text, jsonb, text, text) FROM PUBLIC;

-- La función de servidor permanece exclusiva del rol de servicio.
REVOKE ALL ON FUNCTION public.registrar_auditoria_srv(uuid, text, text, text, text, text, jsonb, text, text) FROM authenticated;
REVOKE ALL ON FUNCTION public.registrar_auditoria_srv(uuid, text, text, text, text, text, jsonb, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.registrar_auditoria_srv(uuid, text, text, text, text, text, jsonb, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.registrar_auditoria_srv(uuid, text, text, text, text, text, jsonb, text, text) TO service_role;