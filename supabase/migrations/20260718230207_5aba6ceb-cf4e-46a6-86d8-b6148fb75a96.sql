CREATE OR REPLACE FUNCTION public.calcular_indicadores_mes(_year integer, _month integer)
 RETURNS TABLE(indicador_codigo text, tipo_medicion text, numerador numeric, denominador numeric, resultado numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_periodo text;
  v_ini date;
  v_fin date;
  v_ind1 uuid;
  v_ind2 uuid;
  v_ind3 uuid;
  v_ind4 uuid;
  v_num numeric;
  v_den numeric;
  v_res numeric;
  v_meta numeric;
  v_tipo text;
  v_existe_oficial boolean;
  v_evaluables int;
BEGIN
  v_periodo := to_char(make_date(_year, _month, 1), 'YYYY-MM');
  v_ini := make_date(_year, _month, 1);
  v_fin := (v_ini + interval '1 month')::date;

  SELECT id INTO v_ind1 FROM public.indicadores WHERE codigo = 'IND-INST-01';
  SELECT id INTO v_ind2 FROM public.indicadores WHERE codigo = 'IND-INST-02';
  SELECT id INTO v_ind3 FROM public.indicadores WHERE codigo = 'IND-INST-03';
  SELECT id INTO v_ind4 FROM public.indicadores WHERE codigo = 'IND-INST-04';

  -- ---------------- Indicador 4 ----------------
  WITH fuente AS (
    SELECT upper(coalesce(estado,'')) AS est
      FROM public.casos_entrantes
     WHERE fecha >= v_ini AND fecha < v_fin
       AND coalesce(archivado,false) = false
       AND (eapb_contratada_snapshot IS NULL OR eapb_contratada_snapshot = true)
    UNION ALL
    SELECT upper(coalesce(estado,'')) AS est
      FROM public.historicos_casos
     WHERE fecha >= v_ini AND fecha < v_fin
       AND coalesce(archivado,false) = false
       AND seccion = 'entrante'
  )
  SELECT COUNT(*) FILTER (WHERE est ~ '(ACEPT|INGRES|REMIT)' AND est !~ '(NO ACEPT|CANCEL|NEGAD|SUSPEND|RECHAZ)'),
         COUNT(*)
    INTO v_num, v_den
    FROM fuente;

  IF v_den > 0 THEN
    v_res := round((v_num::numeric / v_den::numeric) * 100, 2);
    SELECT EXISTS(SELECT 1 FROM public.mediciones_indicadores mi
                   WHERE mi.indicador_id = v_ind4 AND mi.periodo = v_periodo
                     AND mi.tipo_medicion = 'MANUAL_HISTORICA_IMPORTADA') INTO v_existe_oficial;
    v_tipo := CASE WHEN v_existe_oficial THEN 'AUTOMATICA_CONCILIACION' ELSE 'AUTOMATICA' END;
    SELECT meta INTO v_meta FROM public.indicadores WHERE id = v_ind4;

    INSERT INTO public.mediciones_indicadores
      (indicador_id, periodo, periodo_inicio, periodo_fin, tipo_medicion, fuente_medicion,
       numerador_valor, denominador_valor, resultado, meta, unidad,
       total_evaluables, regla_version, calculado_at, nota_metodologica)
    VALUES
      (v_ind4, v_periodo, v_ini, v_fin - 1, v_tipo, 'casos_entrantes+historicos_casos',
       v_num, v_den, v_res, v_meta, '%',
       v_den::int, 'v1.1', now(),
       'Hibrido: casos_entrantes (con snapshot EAPB) + historicos_casos seccion=entrante. ACEPT/INGRES/REMIT = aceptado.')
    ON CONFLICT (indicador_id, periodo, tipo_medicion, regla_version) DO UPDATE
      SET numerador_valor = EXCLUDED.numerador_valor,
          denominador_valor = EXCLUDED.denominador_valor,
          resultado = EXCLUDED.resultado,
          total_evaluables = EXCLUDED.total_evaluables,
          calculado_at = now(),
          nota_metodologica = EXCLUDED.nota_metodologica;

    RETURN QUERY SELECT 'IND-INST-04'::text, v_tipo, v_num, v_den, v_res;
  END IF;

  -- ---------------- Indicador 3 ----------------
  WITH fuente AS (
    SELECT upper(coalesce(estado,'')) AS est
      FROM public.remisiones
     WHERE fecha_inicio >= v_ini AND fecha_inicio < v_fin
       AND coalesce(archivado,false) = false
    UNION ALL
    SELECT upper(coalesce(estado,'')) AS est
      FROM public.historicos_casos
     WHERE fecha >= v_ini AND fecha < v_fin
       AND coalesce(archivado,false) = false
       AND seccion = 'saliente'
  )
  SELECT COUNT(*) FILTER (WHERE est = 'REMITIDO'),
         COUNT(*) FILTER (WHERE est IN ('REMITIDO','SUSPENDIDO','CANCELADO','NEGADO','RECHAZADO'))
    INTO v_num, v_den
    FROM fuente;

  IF v_den > 0 THEN
    v_res := round((v_num::numeric / v_den::numeric) * 100, 2);
    SELECT EXISTS(SELECT 1 FROM public.mediciones_indicadores mi
                   WHERE mi.indicador_id = v_ind3 AND mi.periodo = v_periodo
                     AND mi.tipo_medicion = 'MANUAL_HISTORICA_IMPORTADA') INTO v_existe_oficial;
    v_tipo := CASE WHEN v_existe_oficial THEN 'AUTOMATICA_CONCILIACION' ELSE 'AUTOMATICA' END;
    SELECT meta INTO v_meta FROM public.indicadores WHERE id = v_ind3;

    INSERT INTO public.mediciones_indicadores
      (indicador_id, periodo, periodo_inicio, periodo_fin, tipo_medicion, fuente_medicion,
       numerador_valor, denominador_valor, resultado, meta, unidad,
       total_evaluables, regla_version, calculado_at, nota_metodologica)
    VALUES
      (v_ind3, v_periodo, v_ini, v_fin - 1, v_tipo, 'remisiones+historicos_casos',
       v_num, v_den, v_res, v_meta, '%',
       v_den::int, 'v1.1', now(),
       'Hibrido: remisiones + historicos_casos seccion=saliente. REMITIDO=aceptado; resto=no aceptado.')
    ON CONFLICT (indicador_id, periodo, tipo_medicion, regla_version) DO UPDATE
      SET numerador_valor = EXCLUDED.numerador_valor,
          denominador_valor = EXCLUDED.denominador_valor,
          resultado = EXCLUDED.resultado,
          total_evaluables = EXCLUDED.total_evaluables,
          calculado_at = now(),
          nota_metodologica = EXCLUDED.nota_metodologica;

    RETURN QUERY SELECT 'IND-INST-03'::text, v_tipo, v_num, v_den, v_res;
  END IF;

  -- ---------------- Indicador 1 ----------------
  WITH tiempos AS (
    SELECT ce.id,
           ce.created_at AS t_recep,
           MIN(s.created_at) AS t_resp
      FROM public.casos_entrantes ce
      JOIN public.seguimientos s
        ON s.caso_id = ce.id AND s.tipo_caso = 'entrante'
       AND upper(coalesce(s.estado_solicitud,'')) ~ '(ACEPT|NEGAD|RECHAZ|INGRES)'
     WHERE ce.fecha >= v_ini AND ce.fecha < v_fin
       AND coalesce(ce.archivado,false) = false
     GROUP BY ce.id, ce.created_at
     HAVING MIN(s.created_at) IS NOT NULL
  )
  SELECT COUNT(*), COALESCE(AVG(EXTRACT(EPOCH FROM (t_resp - t_recep))/60.0),0)
    INTO v_evaluables, v_num
    FROM tiempos;

  IF v_evaluables > 0 THEN
    v_res := round(v_num, 2);
    v_den := v_evaluables;
    SELECT EXISTS(SELECT 1 FROM public.mediciones_indicadores mi
                   WHERE mi.indicador_id = v_ind1 AND mi.periodo = v_periodo
                     AND mi.tipo_medicion = 'MANUAL_HISTORICA_IMPORTADA') INTO v_existe_oficial;
    v_tipo := CASE WHEN v_existe_oficial THEN 'AUTOMATICA_CONCILIACION' ELSE 'AUTOMATICA' END;
    SELECT meta INTO v_meta FROM public.indicadores WHERE id = v_ind1;

    INSERT INTO public.mediciones_indicadores
      (indicador_id, periodo, periodo_inicio, periodo_fin, tipo_medicion, fuente_medicion,
       numerador_valor, denominador_valor, resultado, meta, unidad,
       total_evaluables, regla_version, calculado_at, nota_metodologica)
    VALUES
      (v_ind1, v_periodo, v_ini, v_fin - 1, v_tipo, 'casos_entrantes+seguimientos',
       round(v_num,2), v_den, v_res, v_meta, 'MINUTOS',
       v_evaluables, 'v1.1', now(),
       'Solo casos con timestamp real de recepcion y primera respuesta.')
    ON CONFLICT (indicador_id, periodo, tipo_medicion, regla_version) DO UPDATE
      SET numerador_valor = EXCLUDED.numerador_valor,
          denominador_valor = EXCLUDED.denominador_valor,
          resultado = EXCLUDED.resultado,
          total_evaluables = EXCLUDED.total_evaluables,
          calculado_at = now(),
          nota_metodologica = EXCLUDED.nota_metodologica;

    RETURN QUERY SELECT 'IND-INST-01'::text, v_tipo, round(v_num,2), v_den, v_res;
  END IF;

  -- ---------------- Indicador 2 ----------------
  WITH tiempos AS (
    SELECT r.id,
           r.fecha_inicio AS t_sol,
           r.fecha_radicado AS t_acept
      FROM public.remisiones r
     WHERE r.fecha_inicio >= v_ini AND r.fecha_inicio < v_fin
       AND coalesce(r.archivado,false) = false
       AND r.fecha_radicado IS NOT NULL
       AND upper(coalesce(r.estado,'')) = 'REMITIDO'
  )
  SELECT COUNT(*), COALESCE(AVG(EXTRACT(EPOCH FROM (t_acept - t_sol))/3600.0),0)
    INTO v_evaluables, v_num
    FROM tiempos;

  IF v_evaluables > 0 THEN
    v_res := round(v_num, 2);
    v_den := v_evaluables;
    SELECT EXISTS(SELECT 1 FROM public.mediciones_indicadores mi
                   WHERE mi.indicador_id = v_ind2 AND mi.periodo = v_periodo
                     AND mi.tipo_medicion = 'MANUAL_HISTORICA_IMPORTADA') INTO v_existe_oficial;
    v_tipo := CASE WHEN v_existe_oficial THEN 'AUTOMATICA_CONCILIACION' ELSE 'AUTOMATICA' END;
    SELECT meta INTO v_meta FROM public.indicadores WHERE id = v_ind2;

    INSERT INTO public.mediciones_indicadores
      (indicador_id, periodo, periodo_inicio, periodo_fin, tipo_medicion, fuente_medicion,
       numerador_valor, denominador_valor, resultado, meta, unidad,
       total_evaluables, regla_version, calculado_at, nota_metodologica)
    VALUES
      (v_ind2, v_periodo, v_ini, v_fin - 1, v_tipo, 'remisiones',
       round(v_num,2), v_den, v_res, v_meta, 'HORAS',
       v_evaluables, 'v1.1', now(),
       'Solo salientes con fecha_inicio, fecha_radicado y estado REMITIDO.')
    ON CONFLICT (indicador_id, periodo, tipo_medicion, regla_version) DO UPDATE
      SET numerador_valor = EXCLUDED.numerador_valor,
          denominador_valor = EXCLUDED.denominador_valor,
          resultado = EXCLUDED.resultado,
          total_evaluables = EXCLUDED.total_evaluables,
          calculado_at = now(),
          nota_metodologica = EXCLUDED.nota_metodologica;

    RETURN QUERY SELECT 'IND-INST-02'::text, v_tipo, round(v_num,2), v_den, v_res;
  END IF;

  RETURN;
END;
$function$;