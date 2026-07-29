CREATE OR REPLACE FUNCTION private.ri_paso_permitido(_caso_id uuid, _tipo_solicitud text, _proximo_tipo text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  ts   text := upper(coalesce(_tipo_solicitud, ''));
  prox text := upper(coalesce(_proximo_tipo, ''));
  esEspecial boolean;
  ultimo text;
BEGIN
  -- B1: EXAMEN COORDINADO ya no se acepta como paso nuevo (histórico se conserva en lectura).
  IF prox = 'EXAMEN COORDINADO' THEN
    RETURN FALSE;
  END IF;

  -- Acciones transversales siempre permitidas (independientes de la secuencia):
  IF prox = 'CAMBIO DE UNIDAD'
     OR prox = 'CIERRE POR CULMINACIÓN DE SOLICITUD'
     OR prox = 'CIERRE POR CULMINACION DE SOLICITUD'
     OR prox = 'CANCELACIÓN DEL TRÁMITE'
     OR prox = 'CANCELACION DEL TRAMITE' THEN
    RETURN TRUE;
  END IF;

  esEspecial := ts IN (
    'URGENCIAS VITALES',
    'REMISIONES ESPECIALES',
    'EVACUACION DE SEDES AMBULATORIAS',
    'EVACUACIÓN DE SEDES AMBULATORIAS'
  );

  SELECT upper(s.tipo_seguimiento) INTO ultimo
    FROM public.seguimientos s
   WHERE s.caso_id = _caso_id
     AND upper(s.tipo_seguimiento) <> 'CAMBIO DE UNIDAD'
   ORDER BY s.created_at DESC
   LIMIT 1;

  IF esEspecial THEN
    IF ultimo IS NULL THEN
      RETURN prox = 'ACTIVACION DE PROVEEDOR CONTRATADO DE TEP'
          OR prox = 'ACTIVACIÓN DE PROVEEDOR CONTRATADO DE TEP';
    ELSIF ultimo IN ('ACTIVACION DE PROVEEDOR CONTRATADO DE TEP',
                     'ACTIVACIÓN DE PROVEEDOR CONTRATADO DE TEP') THEN
      RETURN prox = 'AMBULANCIA COORDINADA';
    ELSIF ultimo = 'AMBULANCIA COORDINADA' THEN
      RETURN prox = 'CULMINACIÓN DE SOLICITUD' OR prox = 'CULMINACION DE SOLICITUD';
    ELSE
      RETURN FALSE;
    END IF;
  ELSE
    IF ultimo IS NULL THEN
      RETURN prox IN (
        'PENDIENTE COORDINACIÓN FECHA Y HORA EXAMEN',
        'PENDIENTE COORDINACION FECHA Y HORA EXAMEN',
        'PENDIENTE COORDINACIÓN FECHA Y HORA DE EXAMEN',
        'PENDIENTE COORDINACION FECHA Y HORA DE EXAMEN'
      );
    ELSIF ultimo LIKE 'PENDIENTE COORDINAC%EXAMEN' THEN
      -- B1: tras TRÁMITE COORDINADO se salta directamente a PROGRAMACIÓN.
      RETURN prox IN (
        'CONFIRMACIÓN DE PROGRAMACIÓN DE AMBULANCIA',
        'CONFIRMACION DE PROGRAMACION DE AMBULANCIA'
      );
    ELSIF ultimo = 'EXAMEN COORDINADO' THEN
      -- Ruta histórica: casos que ya tienen EXAMEN COORDINADO siguen a PROGRAMACIÓN.
      RETURN prox IN (
        'CONFIRMACIÓN DE PROGRAMACIÓN DE AMBULANCIA',
        'CONFIRMACION DE PROGRAMACION DE AMBULANCIA'
      );
    ELSIF ultimo LIKE 'CONFIRMACI%N DE PROGRAMACI%N DE AMBULANCIA' THEN
      IF prox IN (
        'CONFIRMACIÓN DE LLEGADA DE AMBULANCIA',
        'CONFIRMACION DE LLEGADA DE AMBULANCIA'
      ) THEN
        -- B1: la llegada solo se registra si existe firma FIRMADA vinculada al caso.
        RETURN EXISTS (
          SELECT 1 FROM public.entrega_firmas ef
           WHERE ef.caso_id = _caso_id
             AND ef.tipo_caso = 'referencia_interna'
             AND ef.estado = 'FIRMADA'
        );
      END IF;
      RETURN FALSE;
    ELSIF ultimo LIKE 'CONFIRMACI%N DE LLEGADA DE AMBULANCIA' THEN
      RETURN prox = 'CULMINACIÓN DE SOLICITUD' OR prox = 'CULMINACION DE SOLICITUD';
    ELSE
      RETURN FALSE;
    END IF;
  END IF;
END;
$function$;