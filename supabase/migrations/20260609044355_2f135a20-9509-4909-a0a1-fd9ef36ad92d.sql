ALTER TABLE public.indicadores
  ADD COLUMN IF NOT EXISTS codigo text,
  ADD COLUMN IF NOT EXISTS descripcion text,
  ADD COLUMN IF NOT EXISTS responsable text;

ALTER TABLE public.mediciones_indicadores
  ADD COLUMN IF NOT EXISTS periodo text,
  ADD COLUMN IF NOT EXISTS meta numeric,
  ADD COLUMN IF NOT EXISTS unidad text,
  ADD COLUMN IF NOT EXISTS comentario text;

INSERT INTO public.indicadores
  (codigo, nombre, tipo, descripcion, numerador, denominador, meta, unidad, sentido, fuente, responsable, activo, archivado)
SELECT v.codigo, v.nombre, v.tipo, v.descripcion, v.numerador, v.denominador, v.meta, v.unidad, v.sentido, v.fuente, v.responsable, true, false
FROM (VALUES
  ('IND-OPR-001','Promedio de tiempo de respuesta de las referencias solicitadas','OPORTUNIDAD','Horas promedio transcurridas entre solicitud y respuesta.','Suma de horas de respuesta','Total de referencias con respuesta',12::numeric,'HORAS','MENOR_ES_MEJOR','Bitacora operativa','Coordinacion de referencia'),
  ('IND-OPR-002','Oportunidad entre aceptacion y traslado efectivo','OPORTUNIDAD','Horas promedio entre aceptacion y salida efectiva del paciente.','Suma de horas entre aceptacion y traslado','Total de referencias trasladadas',12::numeric,'HORAS','MENOR_ES_MEJOR','Bitacora operativa','Coordinacion de referencia'),
  ('IND-OPR-003','Oportunidad de aceptacion en la red','OPORTUNIDAD','Horas promedio para lograr aceptacion en la red.','Suma de horas hasta aceptacion','Total de referencias aceptadas',12::numeric,'HORAS','MENOR_ES_MEJOR','Bitacora operativa','Coordinacion de referencia'),
  ('IND-PRO-001','Proporcion de referencias pertinentes','PROPORCION','Porcentaje de referencias que cumplen pertinencia del servicio.','Referencias pertinentes','Total de referencias evaluadas',95::numeric,'%','MAYOR_ES_MEJOR','Bitacora operativa','Coordinacion de referencia'),
  ('IND-PRO-002','Proporcion de referencias recibidas aceptadas','PROPORCION','Porcentaje de referencias recibidas que fueron aceptadas.','Referencias recibidas aceptadas','Total de referencias recibidas',80::numeric,'%','MAYOR_ES_MEJOR','Bitacora operativa','Coordinacion de referencia'),
  ('IND-PRO-003','Proporcion de referencias aceptadas','PROPORCION','Porcentaje de referencias propias aceptadas por la red.','Referencias aceptadas','Total de referencias gestionadas',80::numeric,'%','MAYOR_ES_MEJOR','Bitacora operativa','Coordinacion de referencia'),
  ('IND-PRO-004','Proporcion de referencias a menor complejidad','PROPORCION','Porcentaje de referencias enviadas a menor complejidad.','Referencias a menor complejidad','Total de referencias',90::numeric,'%','MAYOR_ES_MEJOR','Bitacora operativa','Coordinacion de referencia')
) AS v(codigo, nombre, tipo, descripcion, numerador, denominador, meta, unidad, sentido, fuente, responsable)
WHERE NOT EXISTS (SELECT 1 FROM public.indicadores i WHERE i.codigo = v.codigo);