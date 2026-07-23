
-- Fix: la función usaba auth.uid() para excluir al solicitante y validar sesión,
-- pero al invocarse desde el wrapper server con service_role auth.uid() es NULL,
-- por lo que devolvía 0 filas. Se recibe el _requester desde el wrapper (que ya
-- verifica sesión + is_active_member) y se elimina la dependencia de auth.uid().
CREATE OR REPLACE FUNCTION public.get_directorio_activos(_requester uuid DEFAULT NULL)
 RETURNS TABLE(user_id uuid, nombre text, cargo text, sede text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT p.user_id, p.nombre, p.cargo, p.sede
  FROM public.profiles p
  JOIN public.user_roles r ON r.user_id = p.user_id
  WHERE p.activo = true
    AND COALESCE(p.es_cuenta_prueba, false) = false
    AND COALESCE(p.es_cuenta_sistema, false) = false
    AND (_requester IS NULL OR p.user_id <> _requester)
  ORDER BY p.nombre;
$function$;

-- Mantener el Finding 0029 cerrado: solo service_role puede ejecutar.
REVOKE ALL ON FUNCTION public.get_directorio_activos() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_directorio_activos(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_directorio_activos(uuid) TO service_role;
