-- Historial: elimina el CROSS JOIN LATERAL cuadrático sobre la CTE `ev`
-- (una pasada completa por cada unidad => millones de filas) y lo sustituye
-- por un DISTINCT ON de una sola pasada. Mismas columnas, mismos resultados.
CREATE OR REPLACE VIEW public.v_hist_unidades
WITH (security_invoker = true) AS
WITH ev AS (
  SELECT e.ev_id, e.unit_key, e.created_at, e.cod_ref, e.tipo_u, e.estado_txt,
         e.documento, e.fecha_funcional, e.sede_txt, e.servicio_txt, e.haystack
  FROM public.v_hist_entrantes_eventos e
), agg AS (
  SELECT ev.unit_key,
         string_agg(ev.tipo_u, ' ') AS tipos,
         string_agg(ev.haystack, ' ') AS haystack,
         array_agg(ev.ev_id) AS ids
  FROM ev GROUP BY ev.unit_key
), primero AS (
  SELECT DISTINCT ON (ev.unit_key)
         ev.unit_key, ev.created_at, ev.estado_txt, ev.documento,
         ev.fecha_funcional, ev.sede_txt, ev.servicio_txt
  FROM ev
  ORDER BY ev.unit_key, (ev.cod_ref IS NOT NULL), ev.created_at
)
SELECT 'ENTRANTES'::text AS modulo,
       a.unit_key,
       a.ids,
       b.fecha_funcional,
       b.created_at AS orden_at,
       COALESCE(b.documento, ''::text) AS documento,
       a.tipos AS tipo_txt,
       b.estado_txt,
       b.sede_txt,
       b.servicio_txt,
       ''::text AS subtipo,
       a.haystack
FROM agg a
JOIN primero b ON b.unit_key = a.unit_key
UNION ALL
SELECT 'SALIENTES'::text, r.id::text, ARRAY[r.id::text], r.fecha_inicio, r.created_at,
       COALESCE(r.documento, ''::text), COALESCE(r.estado, ''::text), COALESCE(r.estado, ''::text),
       ''::text, (COALESCE(r.servicio, ''::text) || ' ') || COALESCE(r.especialidades_receptoras, ''::text),
       ''::text,
       lower(concat_ws(' ', r.codigo_radicacion, r.documento, r.paciente, r.ips_receptora, r.servicio))
FROM public.remisiones r
UNION ALL
SELECT 'SALIENTES'::text, 'hist-' || h.id::text, ARRAY['hist-' || h.id::text],
       h.fecha::timestamptz, h.created_at, COALESCE(h.documento, ''::text),
       COALESCE(h.estado, ''::text), COALESCE(h.estado, ''::text), ''::text, ''::text, ''::text,
       lower(concat_ws(' ', h.radicado, h.documento, h.paciente, h.ips))
FROM public.historicos_casos h
WHERE h.seccion = 'saliente'
  AND COALESCE(h.archivado, false) = false
  AND NOT (public.hist_sin_tildes(concat_ws(' ', h.seccion, h.tipo_caso, h.fuente_hoja, h.fuente_archivo)) ~ '\m(PHD|PAD|O2|OXIGENO|DOMICILIARIO|DOMICILIARIOS)\M'
        OR public.hist_sin_tildes(COALESCE(h.detalle, ''::text)) ~ '\m(PHD|PAD|O2|OXIGENO|DOMICILIARIO|DOMICILIARIOS)\M'
        OR public.hist_sin_tildes(concat_ws(' ', h.seccion, h.tipo_caso, h.fuente_hoja, h.fuente_archivo)) ~ '\mESPECIALES?\M')
  AND NOT public.hist_sin_tildes(concat_ws(' ', h.seccion, h.tipo_caso, h.fuente_hoja, h.fuente_archivo)) ~ '\m(REF\.?\s*INTERNA|REFERENCIA\s*INTERNA|INTERNA)\M'
UNION ALL
SELECT 'ATENCION_DOMICILIARIA'::text, d.id::text, ARRAY[d.id::text], d.fecha_inicio, d.created_at,
       COALESCE(d.documento, ''::text), COALESCE(d.estado, ''::text), COALESCE(d.estado, ''::text), ''::text,
       (((COALESCE(d.servicio, ''::text) || ' ') || COALESCE(d.tipo_solicitud, ''::text)) || ' ') || COALESCE(d.unidad_especial, ''::text),
       upper(COALESCE(d.tipo_solicitud, ''::text)),
       lower(concat_ws(' ', d.paciente, d.documento, d.tipo_solicitud, d.eapb, d.codigo_radicacion))
FROM public.domiciliarios d
UNION ALL
SELECT 'ATENCION_DOMICILIARIA'::text, 'hist-' || h.id::text, ARRAY['hist-' || h.id::text],
       h.fecha::timestamptz, h.created_at, COALESCE(h.documento, ''::text),
       COALESCE(h.estado, ''::text), COALESCE(h.estado, ''::text), ''::text, ''::text, ''::text,
       lower(concat_ws(' ', h.radicado, h.documento, h.paciente, h.ips))
FROM public.historicos_casos h
WHERE COALESCE(h.archivado, false) = false
  AND (public.hist_sin_tildes(concat_ws(' ', h.seccion, h.tipo_caso, h.fuente_hoja, h.fuente_archivo)) ~ '\m(PHD|PAD|O2|OXIGENO|DOMICILIARIO|DOMICILIARIOS)\M'
    OR public.hist_sin_tildes(COALESCE(h.detalle, ''::text)) ~ '\m(PHD|PAD|O2|OXIGENO|DOMICILIARIO|DOMICILIARIOS)\M'
    OR public.hist_sin_tildes(concat_ws(' ', h.seccion, h.tipo_caso, h.fuente_hoja, h.fuente_archivo)) ~ '\mESPECIALES?\M')
UNION ALL
SELECT 'REFERENCIAS_INTERNAS'::text, i.id::text, ARRAY[i.id::text], i.fecha_inicio, i.created_at,
       COALESCE(i.documento, ''::text), COALESCE(i.estado, ''::text), COALESCE(i.estado, ''::text), ''::text,
       (COALESCE(i.servicio, ''::text) || ' ') || COALESCE(i.tipo_solicitud, ''::text), ''::text,
       lower(concat_ws(' ', i.paciente, i.documento, i.tipo_solicitud, i.servicio, i.eapb))
FROM public.referencia_interna i
UNION ALL
SELECT 'REFERENCIAS_INTERNAS'::text, 'hist-' || h.id::text, ARRAY['hist-' || h.id::text],
       h.fecha::timestamptz, h.created_at, COALESCE(h.documento, ''::text),
       COALESCE(h.estado, ''::text), COALESCE(h.estado, ''::text), ''::text, ''::text, ''::text,
       lower(concat_ws(' ', h.radicado, h.documento, h.paciente, h.ips))
FROM public.historicos_casos h
WHERE COALESCE(h.archivado, false) = false
  AND public.hist_sin_tildes(concat_ws(' ', h.seccion, h.tipo_caso, h.fuente_hoja, h.fuente_archivo)) ~ '\m(REF\.?\s*INTERNA|REFERENCIA\s*INTERNA|INTERNA)\M';