ALTER TABLE public.entrega_firmas
  ADD COLUMN IF NOT EXISTS es_multiple boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.entrega_firmas_casos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firma_id uuid NOT NULL REFERENCES public.entrega_firmas(id) ON DELETE CASCADE,
  caso_id uuid NOT NULL,
  tipo_caso text NOT NULL DEFAULT 'referencia_interna',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (firma_id, caso_id)
);

CREATE INDEX IF NOT EXISTS idx_efc_caso ON public.entrega_firmas_casos(caso_id);

GRANT SELECT, INSERT, DELETE ON public.entrega_firmas_casos TO authenticated;
GRANT ALL ON public.entrega_firmas_casos TO service_role;

ALTER TABLE public.entrega_firmas_casos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Dueño o admin ven vínculos de firma" ON public.entrega_firmas_casos;
CREATE POLICY "Dueño o admin ven vínculos de firma"
  ON public.entrega_firmas_casos FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.entrega_firmas ef
     WHERE ef.id = firma_id
       AND (ef.usuario_genero = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  ));

DROP POLICY IF EXISTS "Dueño crea vínculos de firma" ON public.entrega_firmas_casos;
CREATE POLICY "Dueño crea vínculos de firma"
  ON public.entrega_firmas_casos FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.entrega_firmas ef
     WHERE ef.id = firma_id
       AND ef.usuario_genero = auth.uid()
       AND ef.estado = 'PENDIENTE'
  ) AND public.is_active_member(auth.uid()));

DROP POLICY IF EXISTS "Dueño elimina vínculos pendientes" ON public.entrega_firmas_casos;
CREATE POLICY "Dueño elimina vínculos pendientes"
  ON public.entrega_firmas_casos FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.entrega_firmas ef
     WHERE ef.id = firma_id
       AND ef.usuario_genero = auth.uid()
       AND ef.estado = 'PENDIENTE'
  ));

-- ── Gating: la firma puede pertenecer al caso o venir de un traslado múltiple ──
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
  reset_at timestamptz;
  est text;
BEGIN
  IF prox = 'EXAMEN COORDINADO' THEN
    RETURN FALSE;
  END IF;

  IF prox IN ('CAMBIO DE UNIDAD','OTRO','NOVEDADES',
              'CANCELACIÓN DEL TRÁMITE','CANCELACION DEL TRAMITE') THEN
    RETURN TRUE;
  END IF;

  esEspecial := ts IN (
    'URGENCIAS VITALES',
    'REMISIONES ESPECIALES',
    'EVACUACION DE SEDES AMBULATORIAS',
    'EVACUACIÓN DE SEDES AMBULATORIAS'
  );

  reset_at := private.ri_ciclo_inicio(_caso_id);

  IF esEspecial THEN
    SELECT upper(s.tipo_seguimiento) INTO ultimo
      FROM public.seguimientos s
     WHERE s.caso_id = _caso_id
       AND upper(s.tipo_seguimiento) NOT IN ('CAMBIO DE UNIDAD', 'OTRO', 'NOVEDADES')
       AND (reset_at IS NULL OR s.created_at > reset_at)
     ORDER BY s.created_at DESC
     LIMIT 1;

    IF ultimo IS NULL THEN
      RETURN prox IN ('ACTIVACION DE PROVEEDOR CONTRATADO DE TEP',
                      'ACTIVACIÓN DE PROVEEDOR CONTRATADO DE TEP');
    ELSIF ultimo IN ('ACTIVACION DE PROVEEDOR CONTRATADO DE TEP',
                     'ACTIVACIÓN DE PROVEEDOR CONTRATADO DE TEP') THEN
      RETURN prox = 'AMBULANCIA COORDINADA';
    ELSIF ultimo = 'AMBULANCIA COORDINADA' THEN
      RETURN prox IN ('CIERRE POR CULMINACIÓN DE SOLICITUD','CIERRE POR CULMINACION DE SOLICITUD');
    ELSE
      RETURN FALSE;
    END IF;
  END IF;

  SELECT upper(btrim(coalesce(ri.estado,''))) INTO est
    FROM public.referencia_interna ri
   WHERE ri.id = _caso_id;

  IF est IN ('CERRADO POR CULMINACION DE SOLICITUD','CANCELADO') THEN
    RETURN FALSE;
  END IF;

  IF est IS NULL OR est = '' OR est = 'ACTIVO' OR est = 'PENDIENTE COORDINACION'
     OR est = 'PENDIENTE COORDINACIÓN' THEN
    RETURN prox LIKE 'PENDIENTE COORDINAC%EXAMEN'
        OR prox IN ('TRÁMITE COORDINADO','TRAMITE COORDINADO');
  ELSIF est LIKE 'TRAMITE COORDINADO%' OR est LIKE 'TRÁMITE COORDINADO%' THEN
    RETURN prox IN ('CONFIRMACIÓN DE PROGRAMACIÓN DE AMBULANCIA',
                    'CONFIRMACION DE PROGRAMACION DE AMBULANCIA');
  ELSIF est = 'AMBULANCIA PROGRAMADA' THEN
    IF prox IN ('CONFIRMACIÓN DE LLEGADA DE AMBULANCIA','CONFIRMACION DE LLEGADA DE AMBULANCIA') THEN
      RETURN EXISTS (
        SELECT 1 FROM public.entrega_firmas ef
         WHERE ef.tipo_caso = 'referencia_interna'
           AND ef.estado = 'FIRMADA'
           AND (reset_at IS NULL OR ef.firmado_at > reset_at)
           AND (
             ef.caso_id = _caso_id
             OR EXISTS (
               SELECT 1 FROM public.entrega_firmas_casos efc
                WHERE efc.firma_id = ef.id AND efc.caso_id = _caso_id
             )
           )
      );
    END IF;
    RETURN FALSE;
  ELSIF est LIKE 'AMBULANCIA EN SITIO%' THEN
    RETURN prox IN ('CIERRE POR CULMINACIÓN DE SOLICITUD','CIERRE POR CULMINACION DE SOLICITUD');
  END IF;

  RETURN FALSE;
END;
$function$;

-- ── Finalizador: registra la llegada en cada caso vinculado (idempotente) ──
CREATE OR REPLACE FUNCTION private.ri_confirmar_llegada_multiple(_firma_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  f public.entrega_firmas%ROWTYPE;
  c RECORD;
  n integer := 0;
  fecha_txt text;
  hora_txt text;
  empresa text;
  firmante_block text;
  cuerpo text;
BEGIN
  SELECT * INTO f FROM public.entrega_firmas WHERE id = _firma_id;
  IF NOT FOUND OR f.estado <> 'FIRMADA' OR f.firmado_at IS NULL THEN
    RETURN 0;
  END IF;

  fecha_txt := to_char(f.firmado_at AT TIME ZONE 'America/Bogota', 'DD/MM/YYYY');
  hora_txt  := to_char(f.firmado_at AT TIME ZONE 'America/Bogota', 'HH24:MI');
  empresa := upper(coalesce(nullif(btrim(coalesce(f.empresa_declarada, f.firmante_empresa, '')), ''),
                            coalesce(f.snapshot->>'empresa_traslado', '—')));

  IF coalesce(f.firmante_es_responsable, true) THEN
    firmante_block := 'FIRMANTE: EL MISMO RESPONSABLE DEL TRASLADO';
  ELSE
    firmante_block := 'FIRMANTE: ' || coalesce(f.firmante_nombre, '—') ||
                      E'\nCARGO DEL FIRMANTE: ' || coalesce(f.firmante_cargo, '—');
  END IF;

  FOR c IN
    SELECT ri.id, ri.servicio
      FROM public.entrega_firmas_casos efc
      JOIN public.referencia_interna ri ON ri.id = efc.caso_id
     WHERE efc.firma_id = _firma_id
       AND efc.tipo_caso = 'referencia_interna'
       AND coalesce(ri.archivado, false) = false
       AND upper(btrim(coalesce(ri.estado, ''))) = 'AMBULANCIA PROGRAMADA'
  LOOP
    IF EXISTS (
      SELECT 1 FROM public.seguimientos s
       WHERE s.caso_id = c.id
         AND s.tipo_caso = 'referencia_interna'
         AND (s.detalles->>'firma_id') = _firma_id::text
    ) THEN
      CONTINUE;
    END IF;

    cuerpo := 'CONFIRMACIÓN LLEGADA DE AMBULANCIA.' ||
      E'\nEMPRESA DE TRASLADO: ' || empresa ||
      E'\nSEDE: ' || coalesce(c.servicio, '—') ||
      E'\nFECHA/HORA DE LLEGADA: ' || fecha_txt || ' ' || hora_txt ||
      E'\nRESPONSABLE DEL TRASLADO: ' || coalesce(f.responsable_nombre, '—') ||
      E'\nCARGO DEL RESPONSABLE DEL TRASLADO: ' || coalesce(f.responsable_cargo, '—') ||
      E'\nNÚMERO TELEFÓNICO: ' || coalesce(f.firmante_telefono, '—') ||
      E'\n' || firmante_block ||
      E'\nTRASLADO MÚLTIPLE TAB: SÍ' ||
      coalesce(E'\nCÓDIGO DE VERIFICACIÓN: ' || f.codigo_verificacion, '');

    INSERT INTO public.seguimientos (
      caso_id, tipo_caso, tipo_seguimiento, detalle, detalles,
      nombre_usuario, created_by
    ) VALUES (
      c.id,
      'referencia_interna',
      'CONFIRMACIÓN DE LLEGADA DE AMBULANCIA',
      cuerpo,
      jsonb_build_object(
        'fecha_llegada', fecha_txt,
        'hora_llegada', hora_txt,
        'firma_id', _firma_id::text,
        'traslado_multiple', true,
        'codigo_verificacion', f.codigo_verificacion
      ),
      coalesce(f.nombre_usuario, '—'),
      f.usuario_genero
    );
    n := n + 1;
  END LOOP;

  RETURN n;
END;
$function$;

CREATE OR REPLACE FUNCTION public.ri_confirmar_llegada_multiple(_firma_id uuid)
 RETURNS integer
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT private.ri_confirmar_llegada_multiple(_firma_id);
$function$;

REVOKE ALL ON FUNCTION public.ri_confirmar_llegada_multiple(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ri_confirmar_llegada_multiple(uuid) TO service_role;