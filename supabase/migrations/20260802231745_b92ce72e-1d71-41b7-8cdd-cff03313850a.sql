CREATE OR REPLACE FUNCTION public.calcular_indicadores_parcial(_ini date, _fin timestamptz)
RETURNS TABLE(out_codigo text, out_num numeric, out_den numeric, out_res numeric, out_unidad text, out_casos integer, out_fuente text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_num numeric;
  v_den numeric;
  v_ev int;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_active_member(auth.uid()) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  -- IND-INST-04 : proporcion de referencias recibidas aceptadas
  WITH fuente AS (
    SELECT upper(coalesce(estado,'')) AS est
      FROM public.casos_entrantes
     WHERE fecha >= _ini AND fecha < _fin
       AND coalesce(archivado,false) = false
       AND (eapb_contratada_snapshot IS NULL OR eapb_contratada_snapshot = true)
    UNION ALL
    SELECT upper(coalesce(estado,'')) AS est
      FROM public.historicos_casos
     WHERE fecha >= _ini AND fecha < _fin
       AND coalesce(archivado,false) = false
       AND seccion = 'entrante'
  )
  SELECT COUNT(*) FILTER (WHERE est ~ '(ACEPT|INGRES|REMIT)' AND est !~ '(NO ACEPT|CANCEL|NEGAD|SUSPEND|RECHAZ)'),
         COUNT(*)
    INTO v_num, v_den FROM fuente;
  out_codigo := 'IND-INST-04';
  out_num := v_num; out_den := v_den;
  out_res := CASE WHEN v_den > 0 THEN round((v_num/v_den)*100, 2) ELSE NULL END;
  out_unidad := '%'; out_casos := v_den::int;
  out_fuente := 'casos_entrantes+historicos_casos';
  RETURN NEXT;

  -- IND-INST-03 : proporcion de referencias desde CEDIM aceptadas
  WITH fuente AS (
    SELECT upper(coalesce(estado,'')) AS est
      FROM public.remisiones
     WHERE fecha_inicio >= _ini AND fecha_inicio < _fin
       AND coalesce(archivado,false) = false
    UNION ALL
    SELECT upper(coalesce(estado,'')) AS est
      FROM public.historicos_casos
     WHERE fecha >= _ini AND fecha < _fin
       AND coalesce(archivado,false) = false
       AND seccion = 'saliente'
  )
  SELECT COUNT(*) FILTER (WHERE est = 'REMITIDO'),
         COUNT(*) FILTER (WHERE est IN ('REMITIDO','SUSPENDIDO','CANCELADO','NEGADO','RECHAZADO'))
    INTO v_num, v_den FROM fuente;
  out_codigo := 'IND-INST-03';
  out_num := v_num; out_den := v_den;
  out_res := CASE WHEN v_den > 0 THEN round((v_num/v_den)*100, 2) ELSE NULL END;
  out_unidad := '%'; out_casos := v_den::int;
  out_fuente := 'remisiones+historicos_casos';
  RETURN NEXT;

  -- IND-INST-01 : oportunidad de respuesta (minutos)
  WITH tiempos AS (
    SELECT ce.id, ce.created_at AS t_recep, MIN(s.created_at) AS t_resp
      FROM public.casos_entrantes ce
      JOIN public.seguimientos s
        ON s.caso_id = ce.id AND s.tipo_caso = 'entrante'
       AND upper(coalesce(s.estado_solicitud,'')) ~ '(ACEPT|NEGAD|RECHAZ|INGRES)'
     WHERE ce.fecha >= _ini AND ce.fecha < _fin
       AND coalesce(ce.archivado,false) = false
     GROUP BY ce.id, ce.created_at
     HAVING MIN(s.created_at) IS NOT NULL
  )
  SELECT COUNT(*), COALESCE(AVG(EXTRACT(EPOCH FROM (t_resp - t_recep))/60.0),0)
    INTO v_ev, v_num FROM tiempos;
  out_codigo := 'IND-INST-01';
  out_num := CASE WHEN v_ev > 0 THEN round(v_num,2) ELSE NULL END;
  out_den := v_ev;
  out_res := CASE WHEN v_ev > 0 THEN round(v_num,2) ELSE NULL END;
  out_unidad := 'MINUTOS'; out_casos := v_ev;
  out_fuente := 'casos_entrantes+seguimientos';
  RETURN NEXT;

  -- IND-INST-02 : oportunidad de aceptacion en la red (horas)
  WITH tiempos AS (
    SELECT r.id, r.fecha_inicio AS t_sol, r.fecha_radicado AS t_acept
      FROM public.remisiones r
     WHERE r.fecha_inicio >= _ini AND r.fecha_inicio < _fin
       AND coalesce(r.archivado,false) = false
       AND r.fecha_radicado IS NOT NULL
       AND upper(coalesce(r.estado,'')) = 'REMITIDO'
  )
  SELECT COUNT(*), COALESCE(AVG(EXTRACT(EPOCH FROM (t_acept - t_sol))/3600.0),0)
    INTO v_ev, v_num FROM tiempos;
  out_codigo := 'IND-INST-02';
  out_num := CASE WHEN v_ev > 0 THEN round(v_num,2) ELSE NULL END;
  out_den := v_ev;
  out_res := CASE WHEN v_ev > 0 THEN round(v_num,2) ELSE NULL END;
  out_unidad := 'HORAS'; out_casos := v_ev;
  out_fuente := 'remisiones';
  RETURN NEXT;

  RETURN;
END;
$function$;

REVOKE ALL ON FUNCTION public.calcular_indicadores_parcial(date, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.calcular_indicadores_parcial(date, timestamptz) TO authenticated, service_role;