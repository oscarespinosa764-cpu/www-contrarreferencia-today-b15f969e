
-- Etapa 1: extensión de mediciones_indicadores
ALTER TABLE public.mediciones_indicadores
  ADD COLUMN IF NOT EXISTS tipo_medicion text NOT NULL DEFAULT 'MANUAL',
  ADD COLUMN IF NOT EXISTS fuente_medicion text,
  ADD COLUMN IF NOT EXISTS regla_version text NOT NULL DEFAULT 'v1.0',
  ADD COLUMN IF NOT EXISTS total_evaluables integer,
  ADD COLUMN IF NOT EXISTS total_excluidos integer,
  ADD COLUMN IF NOT EXISTS resultado_automatico_conciliacion numeric,
  ADD COLUMN IF NOT EXISTS diferencia_conciliacion numeric,
  ADD COLUMN IF NOT EXISTS nota_metodologica text,
  ADD COLUMN IF NOT EXISTS calculado_at timestamptz,
  ADD COLUMN IF NOT EXISTS calculado_by uuid,
  ADD COLUMN IF NOT EXISTS periodo_inicio date,
  ADD COLUMN IF NOT EXISTS periodo_fin date;

ALTER TABLE public.mediciones_indicadores
  DROP CONSTRAINT IF EXISTS mediciones_tipo_medicion_chk;
ALTER TABLE public.mediciones_indicadores
  ADD CONSTRAINT mediciones_tipo_medicion_chk
  CHECK (tipo_medicion IN ('MANUAL','MANUAL_HISTORICA_IMPORTADA','AUTOMATICA','AUTOMATICA_CONCILIACION','AJUSTE_MANUAL'));

CREATE UNIQUE INDEX IF NOT EXISTS mediciones_uniq_idempotente
  ON public.mediciones_indicadores (indicador_id, periodo, tipo_medicion, regla_version);

-- Etapa 2: indicadores institucionales oficiales
CREATE UNIQUE INDEX IF NOT EXISTS indicadores_codigo_uniq
  ON public.indicadores (codigo);

INSERT INTO public.indicadores (codigo, nombre, tipo, numerador, denominador, meta, unidad, sentido, fuente, responsable, descripcion, activo, archivado)
VALUES
  ('IND-INST-01','OPORTUNIDAD DE RESPUESTA A LA REFERENCIA SOLICITADA','OPORTUNIDAD',
   'Sumatoria de los minutos transcurridos entre la hora de recepción del correo y la hora de primera respuesta',
   'Total de correos electrónicos con solicitud de referencia en el período',
   60,'MINUTOS','MENOR_ES_MEJOR','FICHA TÉCNICA SIG-FR-13 (Excel oficial aprobado)',
   'AUXILIARES DE REFERENCIA / COORDINACIÓN','Ficha institucional aprobada 19/09/2024. Meta final 60 minutos.',true,false),
  ('IND-INST-02','OPORTUNIDAD DE ACEPTACIÓN EN LA RED EN REFERENCIAS DESDE CEDIM','OPORTUNIDAD',
   'Sumatoria de las horas transcurridas entre el inicio del trámite y la aceptación formal',
   'Total de remisiones aceptadas en el período',
   12,'HORAS','MENOR_ES_MEJOR','FICHA TÉCNICA SIG-FR-13 (Excel oficial aprobado)',
   'AUXILIARES DE REFERENCIA / COORDINACIÓN','Ficha institucional aprobada 19/09/2024. Meta final 12 horas.',true,false),
  ('IND-INST-03','PROPORCIÓN DE REFERENCIAS DESDE CEDIM ACEPTADAS','PROPORCION',
   'Número de referencias iniciadas que fueron aceptadas',
   'Total de referencias iniciadas con cierre definido en el período',
   90,'%','MAYOR_ES_MEJOR','FICHA TÉCNICA SIG-FR-13 (Excel oficial aprobado)',
   'AUXILIARES DE REFERENCIA / COORDINACIÓN','REMITIDO=aceptado, SUSPENDIDO=no aceptado terminal, GESTIONANDO=pendiente, ERROR=excluido.',true,false),
  ('IND-INST-04','PROPORCIÓN DE REFERENCIAS RECIBIDAS ACEPTADAS','PROPORCION',
   'Número de referencias recibidas con estado final aceptado',
   'Total de referencias recibidas con cierre definido',
   90,'%','MAYOR_ES_MEJOR','FICHA TÉCNICA SIG-FR-13 (Excel oficial aprobado)',
   'AUXILIARES DE REFERENCIA / COORDINACIÓN','ACEPTADO=num+den; NO ACEPTADO/CANCELADO=den; INGRESADO/AMPLIACION=pendientes.',true,false)
ON CONFLICT (codigo) DO NOTHING;

-- Etapa 3: backfill oficial Ene-May 2026 (idempotente vía NOT EXISTS)
WITH datos(codigo, periodo, periodo_inicio, periodo_fin, num, den, resultado, semaforo, unidad, meta, nota) AS (
  VALUES
  ('IND-INST-01','2026-01', DATE '2026-01-01', DATE '2026-01-31',  78325::numeric, 1489::numeric,  52.60::numeric, 'VERDE',    'MINUTOS', 60::numeric, 'Sin timestamps históricos: valor oficial importado del Excel.'),
  ('IND-INST-01','2026-02', DATE '2026-02-01', DATE '2026-02-28',  47116,          1339,           35.19,          'VERDE',    'MINUTOS', 60,          'Sin timestamps históricos: valor oficial importado del Excel.'),
  ('IND-INST-01','2026-03', DATE '2026-03-01', DATE '2026-03-31', 456319,          1586,          287.72,          'ROJO',     'MINUTOS', 60,          'Sin timestamps históricos: valor oficial importado del Excel.'),
  ('IND-INST-01','2026-04', DATE '2026-04-01', DATE '2026-04-30',  88588,          1398,           63.37,          'AMARILLO', 'MINUTOS', 60,          'Sin timestamps históricos: valor oficial importado del Excel.'),
  ('IND-INST-01','2026-05', DATE '2026-05-01', DATE '2026-05-31', 158033,          1619,           97.61,          'AMARILLO', 'MINUTOS', 60,          'Sin timestamps históricos: valor oficial importado del Excel.'),
  ('IND-INST-02','2026-01', DATE '2026-01-01', DATE '2026-01-31',   2750,            43,           63.95,          'AMARILLO', 'HORAS',   12,          'Sin timestamps históricos: valor oficial importado del Excel.'),
  ('IND-INST-02','2026-02', DATE '2026-02-01', DATE '2026-02-28',   3008,            95,           31.66,          'AMARILLO', 'HORAS',   12,          'Sin timestamps históricos: valor oficial importado del Excel.'),
  ('IND-INST-02','2026-03', DATE '2026-03-01', DATE '2026-03-31',    973,            61,           15.95,          'AMARILLO', 'HORAS',   12,          'Sin timestamps históricos: valor oficial importado del Excel.'),
  ('IND-INST-02','2026-04', DATE '2026-04-01', DATE '2026-04-30',   1733,            69,           25.12,          'AMARILLO', 'HORAS',   12,          'Sin timestamps históricos: valor oficial importado del Excel.'),
  ('IND-INST-02','2026-05', DATE '2026-05-01', DATE '2026-05-31',   1228,            44,           27.91,          'AMARILLO', 'HORAS',   12,          'Sin timestamps históricos: valor oficial importado del Excel.'),
  ('IND-INST-03','2026-01', DATE '2026-01-01', DATE '2026-01-31',     39,           197,           19.80,          'ROJO',     '%',       90,          'No se aplica exclusión retroactiva por contrato EAPB. Valor oficial importado del Excel.'),
  ('IND-INST-03','2026-02', DATE '2026-02-01', DATE '2026-02-28',     94,           355,           26.48,          'ROJO',     '%',       90,          'No se aplica exclusión retroactiva por contrato EAPB. Valor oficial importado del Excel.'),
  ('IND-INST-03','2026-03', DATE '2026-03-01', DATE '2026-03-31',     60,           238,           25.21,          'ROJO',     '%',       90,          'No se aplica exclusión retroactiva por contrato EAPB. Valor oficial importado del Excel.'),
  ('IND-INST-03','2026-04', DATE '2026-04-01', DATE '2026-04-30',     65,           207,           31.40,          'ROJO',     '%',       90,          'No se aplica exclusión retroactiva por contrato EAPB. Valor oficial importado del Excel.'),
  ('IND-INST-03','2026-05', DATE '2026-05-01', DATE '2026-05-31',     40,           189,           21.16,          'ROJO',     '%',       90,          'No se aplica exclusión retroactiva por contrato EAPB. Valor oficial importado del Excel.'),
  ('IND-INST-04','2026-01', DATE '2026-01-01', DATE '2026-01-31',    180,          1489,           12.09,          'ROJO',     '%',       90,          'No se aplica exclusión retroactiva por contrato EAPB. Valor oficial importado del Excel.'),
  ('IND-INST-04','2026-02', DATE '2026-02-01', DATE '2026-02-28',    150,          1339,           11.20,          'ROJO',     '%',       90,          'No se aplica exclusión retroactiva por contrato EAPB. Valor oficial importado del Excel.'),
  ('IND-INST-04','2026-03', DATE '2026-03-01', DATE '2026-03-31',    180,          1586,           11.35,          'ROJO',     '%',       90,          'No se aplica exclusión retroactiva por contrato EAPB. Valor oficial importado del Excel.'),
  ('IND-INST-04','2026-04', DATE '2026-04-01', DATE '2026-04-30',    113,          1398,            8.08,          'ROJO',     '%',       90,          'No se aplica exclusión retroactiva por contrato EAPB. Valor oficial importado del Excel. Diferencia previa base=1396 vs Excel=1398 pendiente de conciliación automática.'),
  ('IND-INST-04','2026-05', DATE '2026-05-01', DATE '2026-05-31',    106,          1619,            6.55,          'ROJO',     '%',       90,          'No se aplica exclusión retroactiva por contrato EAPB. Valor oficial importado del Excel.')
)
INSERT INTO public.mediciones_indicadores (
  indicador_id, periodo, periodo_inicio, periodo_fin,
  numerador_valor, denominador_valor, resultado, meta, unidad, semaforo,
  tipo_medicion, fuente_medicion, regla_version, nota_metodologica,
  calculado_at, fecha, comentario
)
SELECT
  i.id, d.periodo, d.periodo_inicio, d.periodo_fin,
  d.num, d.den, d.resultado, d.meta, d.unidad, d.semaforo,
  'MANUAL_HISTORICA_IMPORTADA',
  'FICHA TÉCNICA EXCEL APROBADA',
  'v1.0',
  d.nota,
  now(),
  (d.periodo_fin::timestamptz),
  'Backfill oficial desde ficha técnica SIG-FR-13.'
FROM datos d
JOIN public.indicadores i ON i.codigo = d.codigo
WHERE NOT EXISTS (
  SELECT 1 FROM public.mediciones_indicadores m
  WHERE m.indicador_id = i.id
    AND m.periodo = d.periodo
    AND m.tipo_medicion = 'MANUAL_HISTORICA_IMPORTADA'
    AND m.regla_version = 'v1.0'
);
