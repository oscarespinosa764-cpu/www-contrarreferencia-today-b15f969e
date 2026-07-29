-- Guard 1: nadie escribe estado_ciclo/archivado de domiciliarios directamente.
-- Las funciones canónicas son SECURITY DEFINER (current_user = owner <> session_user).
CREATE OR REPLACE FUNCTION private.domi_estado_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF current_user = session_user
     AND (NEW.estado_ciclo IS DISTINCT FROM OLD.estado_ciclo
          OR NEW.archivado IS DISTINCT FROM OLD.archivado) THEN
    RAISE EXCEPTION 'El estado del ciclo y el archivado son automáticos: registre el evento en Seguimiento.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_domi_estado_guard ON public.domiciliarios;
CREATE TRIGGER trg_domi_estado_guard
BEFORE UPDATE ON public.domiciliarios
FOR EACH ROW EXECUTE FUNCTION private.domi_estado_guard();

-- Guard 2: los eventos críticos del ciclo solo pueden entrar por
-- public.registrar_evento_phd (SECURITY DEFINER).
CREATE OR REPLACE FUNCTION private.domi_seguimiento_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  criticos text[] := ARRAY[
    'ACEPTACION_PROVEEDOR',
    'CONFIRMACION_ENTREGA_OXIGENO',
    'AMBULANCIA_COORDINADA',
    'CONFIRMACION_LLEGADA_AMBULANCIA',
    'CIERRE_POR_EGRESO',
    'CANCELACION_PROVEEDOR',
    'CANCELACION_ESPECIALIDAD'
  ];
BEGIN
  IF NEW.tipo_caso = 'domiciliario'
     AND current_user = session_user
     AND upper(coalesce(NEW.detalles->>'evento','')) = ANY(criticos) THEN
    RAISE EXCEPTION 'Este evento del ciclo debe registrarse por la vía oficial de Seguimiento.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_domi_seguimiento_guard ON public.seguimientos;
CREATE TRIGGER trg_domi_seguimiento_guard
BEFORE INSERT ON public.seguimientos
FOR EACH ROW EXECUTE FUNCTION private.domi_seguimiento_guard();

REVOKE EXECUTE ON FUNCTION private.domi_estado_guard() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION private.domi_seguimiento_guard() FROM PUBLIC, anon, authenticated;