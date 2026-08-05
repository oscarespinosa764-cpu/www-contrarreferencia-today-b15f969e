-- FASE 11 · B.1 — Datos canónicos de ENTRANTES
ALTER TABLE public.casos_entrantes
  ADD COLUMN IF NOT EXISTS fecha_envio_remision timestamptz,
  ADD COLUMN IF NOT EXISTS remision_hora_conocida boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ciudad_remitente text,
  ADD COLUMN IF NOT EXISTS departamento_remitente text,
  ADD COLUMN IF NOT EXISTS edad_valor integer,
  ADD COLUMN IF NOT EXISTS edad_unidad text,
  ADD COLUMN IF NOT EXISTS especialidad_remision text,
  ADD COLUMN IF NOT EXISTS cie10_codigo text,
  ADD COLUMN IF NOT EXISTS cie10_descripcion text,
  ADD COLUMN IF NOT EXISTS clasificacion_solicitud text,
  ADD COLUMN IF NOT EXISTS motivo_negacion text,
  ADD COLUMN IF NOT EXISTS especialidad_negacion text,
  ADD COLUMN IF NOT EXISTS justificacion_decision text,
  ADD COLUMN IF NOT EXISTS codigo_crue text,
  ADD COLUMN IF NOT EXISTS justificacion_crue text,
  ADD COLUMN IF NOT EXISTS modalidad_ingreso text,
  ADD COLUMN IF NOT EXISTS fecha_hora_ingreso timestamptz,
  ADD COLUMN IF NOT EXISTS unidad_prevista text,
  ADD COLUMN IF NOT EXISTS unidad_real text,
  ADD COLUMN IF NOT EXISTS ingreso_confirmado boolean,
  ADD COLUMN IF NOT EXISTS justificacion_confirmacion text,
  ADD COLUMN IF NOT EXISTS tipo_ambulancia text,
  ADD COLUMN IF NOT EXISTS empresa_tep text,
  ADD COLUMN IF NOT EXISTS placa_vehiculo text,
  ADD COLUMN IF NOT EXISTS profesional_tep_nombre text,
  ADD COLUMN IF NOT EXISTS profesional_tep_cargo text,
  ADD COLUMN IF NOT EXISTS profesional_receptor_nombre text,
  ADD COLUMN IF NOT EXISTS profesional_receptor_cargo text;

-- Allowlist de valores canónicos (fail-closed).
ALTER TABLE public.casos_entrantes DROP CONSTRAINT IF EXISTS casos_entrantes_clasificacion_chk;
ALTER TABLE public.casos_entrantes ADD CONSTRAINT casos_entrantes_clasificacion_chk
  CHECK (clasificacion_solicitud IS NULL OR clasificacion_solicitud IN
    ('ACEPTADO','NEGADO','DIRECCIONAMIENTO_CRUE','INGRESO_SIN_GESTION_PREVIA_REFERENCIA'));

ALTER TABLE public.casos_entrantes DROP CONSTRAINT IF EXISTS casos_entrantes_edad_unidad_chk;
ALTER TABLE public.casos_entrantes ADD CONSTRAINT casos_entrantes_edad_unidad_chk
  CHECK (edad_unidad IS NULL OR edad_unidad IN ('AÑOS','MESES','DIAS'));

ALTER TABLE public.casos_entrantes DROP CONSTRAINT IF EXISTS casos_entrantes_edad_valor_chk;
ALTER TABLE public.casos_entrantes ADD CONSTRAINT casos_entrantes_edad_valor_chk
  CHECK (edad_valor IS NULL OR (edad_valor >= 0 AND edad_valor <= 130));

ALTER TABLE public.casos_entrantes DROP CONSTRAINT IF EXISTS casos_entrantes_modalidad_ingreso_chk;
ALTER TABLE public.casos_entrantes ADD CONSTRAINT casos_entrantes_modalidad_ingreso_chk
  CHECK (modalidad_ingreso IS NULL OR modalidad_ingreso IN
    ('NORMAL_POR_ACEPTACION','INGRESO_TARDIO','DIRECCIONAMIENTO_CRUE',
     'INGRESO_POSTERIOR_A_NEGACION','SIN_GESTION_PREVIA_REFERENCIA'));

-- Clasificación server-authoritative: nunca se confía en el valor del cliente.
CREATE OR REPLACE FUNCTION private.casos_entrantes_clasificacion_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_tipo text := upper(coalesce(NEW.tipo, ''));
  v_padre text;
BEGIN
  IF v_tipo = 'ACEP' THEN
    NEW.clasificacion_solicitud := 'ACEPTADO';
  ELSIF v_tipo = 'NEG' THEN
    NEW.clasificacion_solicitud := 'NEGADO';
  ELSIF v_tipo = 'SIN_GESTION' THEN
    NEW.clasificacion_solicitud := 'INGRESO_SIN_GESTION_PREVIA_REFERENCIA';
  ELSIF v_tipo LIKE 'CRUE%' THEN
    -- Precedencia: una decisión explícita previa del mismo paciente prevalece.
    SELECT upper(c.tipo) INTO v_padre
      FROM public.casos_entrantes c
     WHERE c.documento IS NOT NULL
       AND c.documento = NEW.documento
       AND upper(c.tipo) IN ('ACEP','NEG')
       AND c.id <> NEW.id
     ORDER BY c.created_at DESC
     LIMIT 1;
    IF v_padre = 'ACEP' THEN
      NEW.clasificacion_solicitud := 'ACEPTADO';
    ELSIF v_padre = 'NEG' THEN
      NEW.clasificacion_solicitud := 'NEGADO';
    ELSE
      NEW.clasificacion_solicitud := 'DIRECCIONAMIENTO_CRUE';
    END IF;
  ELSE
    -- Eventos derivados (ING, CAN, AMP...): heredan la del caso padre.
    IF NEW.cod_ref IS NOT NULL THEN
      SELECT c.clasificacion_solicitud INTO NEW.clasificacion_solicitud
        FROM public.casos_entrantes c
       WHERE c.codigo = NEW.cod_ref
       LIMIT 1;
    ELSE
      NEW.clasificacion_solicitud := NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS a_casos_entrantes_clasificacion ON public.casos_entrantes;
CREATE TRIGGER a_casos_entrantes_clasificacion
BEFORE INSERT OR UPDATE ON public.casos_entrantes
FOR EACH ROW EXECUTE FUNCTION private.casos_entrantes_clasificacion_guard();

-- Backfill determinístico (solo desde el tipo real del evento; nada inferido).
UPDATE public.casos_entrantes SET clasificacion_solicitud = 'ACEPTADO'
 WHERE clasificacion_solicitud IS NULL AND upper(tipo) = 'ACEP';
UPDATE public.casos_entrantes SET clasificacion_solicitud = 'NEGADO'
 WHERE clasificacion_solicitud IS NULL AND upper(tipo) = 'NEG';
UPDATE public.casos_entrantes SET clasificacion_solicitud = 'INGRESO_SIN_GESTION_PREVIA_REFERENCIA'
 WHERE clasificacion_solicitud IS NULL AND upper(tipo) = 'SIN_GESTION';
UPDATE public.casos_entrantes SET clasificacion_solicitud = 'DIRECCIONAMIENTO_CRUE'
 WHERE clasificacion_solicitud IS NULL AND upper(tipo) LIKE 'CRUE%';

-- Datos ya persistidos (sin inventar): código CRUE y TEP del flujo sin gestión previa.
UPDATE public.casos_entrantes
   SET codigo_crue = coalesce(codigo_crue, nullif(metadata->>'codigo_crue','')),
       justificacion_crue = coalesce(justificacion_crue, nullif(metadata->>'observaciones',''))
 WHERE upper(tipo) LIKE 'CRUE%' AND metadata IS NOT NULL;

UPDATE public.casos_entrantes
   SET codigo_crue = coalesce(codigo_crue, nullif(metadata#>>'{crue,codigo_crue}','')),
       tipo_ambulancia = coalesce(tipo_ambulancia, nullif(metadata#>>'{traslado,tipo_ambulancia}','')),
       empresa_tep = coalesce(empresa_tep, nullif(metadata#>>'{traslado,empresa}','')),
       placa_vehiculo = coalesce(placa_vehiculo, nullif(metadata#>>'{traslado,placa}','')),
       profesional_tep_nombre = coalesce(profesional_tep_nombre, nullif(metadata#>>'{traslado,tripulante}','')),
       profesional_tep_cargo = coalesce(profesional_tep_cargo, nullif(metadata#>>'{traslado,cargo}','')),
       unidad_real = coalesce(unidad_real, nullif(metadata#>>'{ingreso,unidad}','')),
       ingreso_confirmado = coalesce(ingreso_confirmado, true),
       modalidad_ingreso = coalesce(modalidad_ingreso, 'SIN_GESTION_PREVIA_REFERENCIA')
 WHERE upper(tipo) = 'SIN_GESTION' AND metadata IS NOT NULL;

UPDATE public.casos_entrantes
   SET ingreso_confirmado = true,
       unidad_real = coalesce(unidad_real, unidad)
 WHERE upper(tipo) = 'ING' AND ingreso_confirmado IS NULL;