-- ============================================================================
-- FASE 5C · B1.2 — Referencia Interna: novedades y cancelaciones estructuradas
-- + backfill de estados canónicos para casos activos.
-- ============================================================================

-- 1) Reemplazar el trigger de novedades:
--    * Retira NO_ACEPTACION_PACIENTE_FAMILIAR de novedades EXTERNA (creación nueva).
--    * Acepta y valida `sin_nueva_fecha_hora` en REPROGRAMACION con mutua exclusión.
--    * Conserva DESCOMPENSACION_HEMODINAMICA como reinicio.
--    * Los históricos ya persistidos no se modifican (validación aplica en INSERT/UPDATE).
CREATE OR REPLACE FUNCTION private.seguimientos_ri_novedades_validate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  tipo text := upper(coalesce(NEW.tipo_seguimiento, ''));
  d jsonb := NEW.detalles;
  cats jsonb;
  motivos jsonb;
  arr_len int;
  interna_cod text;
  externa_cod text;
  pacfam text;
  ri_evento text;
  cual text;
  fh text;
  sin_fh boolean;
BEGIN
  IF NEW.tipo_caso IS DISTINCT FROM 'referencia_interna' THEN
    RETURN NEW;
  END IF;
  IF tipo NOT IN ('OTRO', 'NOVEDADES') THEN
    RETURN NEW;
  END IF;
  IF d IS NULL OR jsonb_typeof(d) <> 'object' THEN
    RAISE EXCEPTION 'Detalles requeridos para % en Referencia Interna', tipo
      USING ERRCODE = 'check_violation';
  END IF;

  IF tipo = 'OTRO' THEN
    ri_evento := d->>'ri_evento';
    IF ri_evento IS DISTINCT FROM 'OTRO' THEN
      RAISE EXCEPTION 'ri_evento invalido para OTRO' USING ERRCODE = 'check_violation';
    END IF;
    cual := btrim(coalesce(d->>'cual', ''));
    IF length(cual) < 3 OR length(cual) > 200 THEN
      RAISE EXCEPTION 'Campo CUAL debe tener entre 3 y 200 caracteres' USING ERRCODE = 'check_violation';
    END IF;
    IF length(coalesce(d->>'observaciones', '')) > 1000 THEN
      RAISE EXCEPTION 'Observaciones exceden 1000 caracteres' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  -- NOVEDADES
  ri_evento := d->>'ri_evento';
  IF ri_evento IS DISTINCT FROM 'NOVEDADES' THEN
    RAISE EXCEPTION 'ri_evento invalido para NOVEDADES' USING ERRCODE = 'check_violation';
  END IF;

  cats := d->'categorias';
  IF cats IS NULL OR jsonb_typeof(cats) <> 'array' THEN
    RAISE EXCEPTION 'categorias debe ser un arreglo' USING ERRCODE = 'check_violation';
  END IF;
  arr_len := jsonb_array_length(cats);
  IF arr_len < 1 OR arr_len > 2 THEN
    RAISE EXCEPTION 'Debe seleccionar al menos INTERNA o EXTERNA' USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements_text(cats) v
    WHERE v NOT IN ('INTERNA','EXTERNA')
  ) THEN
    RAISE EXCEPTION 'categoria no permitida' USING ERRCODE = 'check_violation';
  END IF;

  interna_cod := d->>'interna_codigo';
  externa_cod := d->>'externa_codigo';
  pacfam := d->>'paciente_familiar_motivo';

  IF cats ? 'INTERNA' THEN
    IF interna_cod IS NULL OR interna_cod NOT IN (
      'EQUIPO_FALLA','REPROGRAMACION','NO_DISPONIBILIDAD_TECNICO'
    ) THEN
      RAISE EXCEPTION 'interna_codigo no permitido' USING ERRCODE = 'check_violation';
    END IF;
    IF interna_cod = 'REPROGRAMACION' THEN
      motivos := d->'reprogramacion_motivos';
      IF motivos IS NULL OR jsonb_typeof(motivos) <> 'array' OR jsonb_array_length(motivos) < 1 THEN
        RAISE EXCEPTION 'reprogramacion_motivos requerido' USING ERRCODE = 'check_violation';
      END IF;
      IF EXISTS (
        SELECT 1 FROM jsonb_array_elements_text(motivos) v
        WHERE v NOT IN ('RETRASO_AGENDA','IMPOSIBILIDAD_TOMA_EXAMEN_PREVIO')
      ) THEN
        RAISE EXCEPTION 'motivo de reprogramacion no permitido' USING ERRCODE = 'check_violation';
      END IF;
      -- B1.2: mutua exclusion sin_nueva_fecha_hora vs fecha_hora_reprogramada.
      sin_fh := coalesce((d->>'sin_nueva_fecha_hora')::boolean, false);
      fh := nullif(btrim(coalesce(d->>'fecha_hora_reprogramada','')), '');
      IF sin_fh AND fh IS NOT NULL THEN
        RAISE EXCEPTION 'sin_nueva_fecha_hora no admite fecha_hora_reprogramada'
          USING ERRCODE = 'check_violation';
      END IF;
      IF NOT sin_fh AND fh IS NULL THEN
        RAISE EXCEPTION 'Debe indicar la nueva fecha/hora o marcar sin_nueva_fecha_hora'
          USING ERRCODE = 'check_violation';
      END IF;
      IF fh IS NOT NULL THEN
        BEGIN
          PERFORM fh::timestamptz;
        EXCEPTION WHEN others THEN
          RAISE EXCEPTION 'fecha_hora_reprogramada invalida' USING ERRCODE = 'check_violation';
        END;
      END IF;
    END IF;
  ELSE
    IF interna_cod IS NOT NULL THEN
      RAISE EXCEPTION 'interna_codigo presente sin categoria INTERNA' USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF cats ? 'EXTERNA' THEN
    -- B1.2: se RETIRA NO_ACEPTACION_PACIENTE_FAMILIAR de la allowlist EXTERNA para creacion nueva.
    IF externa_cod IS NULL OR externa_cod NOT IN (
      'AMBULANCIA_SIN_DISPONIBILIDAD','RED_NO_CONTRATADA','DESCOMPENSACION_HEMODINAMICA'
    ) THEN
      RAISE EXCEPTION 'externa_codigo no permitido (No aceptacion debe registrarse como CANCELACION DEL TRAMITE)'
        USING ERRCODE = 'check_violation';
    END IF;
    IF pacfam IS NOT NULL THEN
      RAISE EXCEPTION 'paciente_familiar_motivo no aplica a novedades externas'
        USING ERRCODE = 'check_violation';
    END IF;
  ELSE
    IF externa_cod IS NOT NULL THEN
      RAISE EXCEPTION 'externa_codigo presente sin categoria EXTERNA' USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF length(coalesce(d->>'observaciones', '')) > 1000 THEN
    RAISE EXCEPTION 'Observaciones exceden 1000 caracteres' USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

-- 2) Trigger de validacion estructurada para CANCELACION DEL TRAMITE (RI).
--    Rechaza payloads sin motivo estructurado o con combinaciones incompatibles.
CREATE OR REPLACE FUNCTION private.seguimientos_ri_cancelacion_validate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  tipo text := upper(coalesce(NEW.tipo_seguimiento, ''));
  d jsonb := NEW.detalles;
  cod text;
  pacfam text;
  otro text;
BEGIN
  IF NEW.tipo_caso IS DISTINCT FROM 'referencia_interna' THEN
    RETURN NEW;
  END IF;
  IF tipo NOT IN ('CANCELACIÓN DEL TRÁMITE', 'CANCELACION DEL TRAMITE') THEN
    RETURN NEW;
  END IF;
  IF d IS NULL OR jsonb_typeof(d) <> 'object' THEN
    RAISE EXCEPTION 'Detalles requeridos para CANCELACION DEL TRAMITE en Referencia Interna'
      USING ERRCODE = 'check_violation';
  END IF;

  cod := d->>'cancelacion_motivo_codigo';
  pacfam := d->>'paciente_familiar_motivo';
  otro := nullif(btrim(coalesce(d->>'cancelacion_otro_motivo','')), '');

  IF cod IS NULL OR cod NOT IN ('NO_ACEPTACION_PACIENTE_FAMILIAR','OTRO') THEN
    RAISE EXCEPTION 'cancelacion_motivo_codigo requerido (NO_ACEPTACION_PACIENTE_FAMILIAR u OTRO)'
      USING ERRCODE = 'check_violation';
  END IF;

  IF cod = 'NO_ACEPTACION_PACIENTE_FAMILIAR' THEN
    IF pacfam IS NULL OR pacfam NOT IN ('ADULTO_MAYOR_SIN_ACOMPANANTE','FAMILIAR_NO_PERMITE_TRASLADO') THEN
      RAISE EXCEPTION 'paciente_familiar_motivo requerido (ADULTO_MAYOR_SIN_ACOMPANANTE o FAMILIAR_NO_PERMITE_TRASLADO)'
        USING ERRCODE = 'check_violation';
    END IF;
    IF otro IS NOT NULL THEN
      RAISE EXCEPTION 'cancelacion_otro_motivo no aplica cuando el motivo es NO ACEPTACION'
        USING ERRCODE = 'check_violation';
    END IF;
  ELSE
    -- OTRO
    IF otro IS NULL OR length(otro) < 3 OR length(otro) > 500 THEN
      RAISE EXCEPTION 'cancelacion_otro_motivo requerido (3-500 caracteres)'
        USING ERRCODE = 'check_violation';
    END IF;
    IF pacfam IS NOT NULL THEN
      RAISE EXCEPTION 'paciente_familiar_motivo no aplica cuando el motivo es OTRO'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_seguimientos_ri_cancelacion_validate ON public.seguimientos;
CREATE TRIGGER trg_seguimientos_ri_cancelacion_validate
  BEFORE INSERT OR UPDATE ON public.seguimientos
  FOR EACH ROW EXECUTE FUNCTION private.seguimientos_ri_cancelacion_validate();

-- 3) Backfill de estados canonicos para casos activos de Referencia Interna.
--    Regla determinística: llegada > programacion > tramite > pendiente,
--    considerando el ultimo reinicio (DESCOMPENSACION_HEMODINAMICA o
--    REPROGRAMACION con sin_nueva_fecha_hora=true).
WITH activos AS (
  SELECT id, estado FROM public.referencia_interna WHERE coalesce(archivado,false) = false
),
resets AS (
  SELECT s.caso_id, MAX(s.created_at) AS reset_at
    FROM public.seguimientos s
    JOIN activos a ON a.id = s.caso_id
   WHERE s.tipo_caso = 'referencia_interna'
     AND upper(s.tipo_seguimiento) = 'NOVEDADES'
     AND (
       (s.detalles->>'externa_codigo') = 'DESCOMPENSACION_HEMODINAMICA'
       OR (
         (s.detalles->>'interna_codigo') = 'REPROGRAMACION'
         AND coalesce((s.detalles->>'sin_nueva_fecha_hora')::boolean, false) = true
       )
     )
   GROUP BY s.caso_id
),
ultimo_paso AS (
  SELECT DISTINCT ON (s.caso_id) s.caso_id, upper(s.tipo_seguimiento) AS ts
    FROM public.seguimientos s
    JOIN activos a ON a.id = s.caso_id
    LEFT JOIN resets r ON r.caso_id = s.caso_id
   WHERE s.tipo_caso = 'referencia_interna'
     AND upper(s.tipo_seguimiento) NOT IN ('CAMBIO DE UNIDAD','OTRO','NOVEDADES')
     AND (r.reset_at IS NULL OR s.created_at > r.reset_at)
   ORDER BY s.caso_id, s.created_at DESC
),
mapped AS (
  SELECT a.id,
         CASE
           WHEN up.ts IN (
             'CONFIRMACIÓN DE LLEGADA DE AMBULANCIA','CONFIRMACION DE LLEGADA DE AMBULANCIA'
           ) THEN 'AMBULANCIA EN SITIO PTE CONFIRMACION REINGRESO'
           WHEN up.ts IN (
             'CONFIRMACIÓN DE PROGRAMACIÓN DE AMBULANCIA','CONFIRMACION DE PROGRAMACION DE AMBULANCIA',
             'AMBULANCIA COORDINADA'
           ) THEN 'AMBULANCIA PROGRAMADA'
           WHEN up.ts IN (
             'EXAMEN COORDINADO'
           ) OR up.ts LIKE 'PENDIENTE COORDINAC%EXAMEN'
              OR up.ts LIKE 'PENDIENTE COORDINAC%'
           THEN 'TRAMITE COORDINADO SIN CONFIRMACION AMBULANCIA'
           WHEN up.ts IN ('ACTIVACIÓN DE PROVEEDOR CONTRATADO DE TEP','ACTIVACION DE PROVEEDOR CONTRATADO DE TEP')
           THEN 'TRAMITE COORDINADO SIN CONFIRMACION AMBULANCIA'
           ELSE 'PENDIENTE COORDINACION'
         END AS nuevo
    FROM activos a
    LEFT JOIN ultimo_paso up ON up.caso_id = a.id
)
UPDATE public.referencia_interna ri
   SET estado = m.nuevo, updated_at = now()
  FROM mapped m
 WHERE ri.id = m.id
   AND (ri.estado IS NULL OR ri.estado IS DISTINCT FROM m.nuevo);