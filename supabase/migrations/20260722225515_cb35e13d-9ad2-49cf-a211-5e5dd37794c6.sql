
BEGIN;

-- 1) Versión ACTIVA inicial (idempotente por plantilla_codigo)
INSERT INTO public.plantillas_versiones (plantilla_codigo, version, estado, contenido_editable, motivo)
SELECT pi.codigo, 1, 'ACTIVA', COALESCE(pi.contenido_editable, '{}'::jsonb), 'Versión inicial sembrada'
FROM public.plantillas_inventario pi
WHERE pi.codigo IN (
  'ENTRANTES_AMPLIACION_HTML',
  'ENTRANTES_INGRESO_HTML',
  'ENTRANTES_CRUE_NO_REQUERIMIENTO_HTML'
)
AND NOT EXISTS (
  SELECT 1 FROM public.plantillas_versiones pv WHERE pv.plantilla_codigo = pi.codigo
);

-- 2) Puntos de uso: ruta + evento + ventana + paso solo si están vacíos
UPDATE public.puntos_de_uso
   SET ruta    = COALESCE(NULLIF(btrim(ruta), ''), '/remisiones'),
       ventana = COALESCE(NULLIF(btrim(ventana), ''), 'Dashboard entrantes'),
       paso    = COALESCE(NULLIF(btrim(paso), ''), 'Seguimiento'),
       evento  = COALESCE(NULLIF(btrim(evento), ''), 'click Ampliar')
 WHERE codigo = 'ENTRANTES_AMPLIACION'
   AND (NULLIF(btrim(ruta), '') IS NULL OR NULLIF(btrim(evento), '') IS NULL);

UPDATE public.puntos_de_uso
   SET ruta    = COALESCE(NULLIF(btrim(ruta), ''), '/remisiones'),
       ventana = COALESCE(NULLIF(btrim(ventana), ''), 'Dashboard entrantes'),
       paso    = COALESCE(NULLIF(btrim(paso), ''), 'Seguimiento'),
       evento  = COALESCE(NULLIF(btrim(evento), ''), 'click Confirmar Ingreso')
 WHERE codigo = 'ENTRANTES_INGRESO'
   AND (NULLIF(btrim(ruta), '') IS NULL OR NULLIF(btrim(evento), '') IS NULL);

UPDATE public.puntos_de_uso
   SET ruta    = COALESCE(NULLIF(btrim(ruta), ''), '/remisiones'),
       ventana = COALESCE(NULLIF(btrim(ventana), ''), 'Dashboard entrantes'),
       paso    = COALESCE(NULLIF(btrim(paso), ''), 'Respuesta CRUE'),
       evento  = COALESCE(NULLIF(btrim(evento), ''), 'click No Requerimiento CRUE')
 WHERE codigo = 'ENTRANTES_CRUE_NO_REQUERIMIENTO'
   AND (NULLIF(btrim(ruta), '') IS NULL OR NULLIF(btrim(evento), '') IS NULL);

COMMIT;
