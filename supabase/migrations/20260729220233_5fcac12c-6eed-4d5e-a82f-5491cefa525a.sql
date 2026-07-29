CREATE OR REPLACE FUNCTION private.domi_estado_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  -- Solo el motor server-authoritative (funciones SECURITY DEFINER, propietario
  -- postgres) o el rol de servidor pueden mover estado_ciclo/archivado.
  IF current_user IN ('authenticated', 'anon')
     AND (NEW.estado_ciclo IS DISTINCT FROM OLD.estado_ciclo
          OR NEW.archivado IS DISTINCT FROM OLD.archivado) THEN
    RAISE EXCEPTION 'El estado del ciclo y el archivado son automáticos: registre el evento en Seguimiento.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;

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
     AND current_user IN ('authenticated', 'anon')
     AND upper(coalesce(NEW.detalles->>'evento','')) = ANY(criticos) THEN
    RAISE EXCEPTION 'Este evento del ciclo debe registrarse por la vía oficial de Seguimiento.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;