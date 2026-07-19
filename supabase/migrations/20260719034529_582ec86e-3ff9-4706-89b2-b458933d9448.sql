
INSERT INTO public.checklists (codigo, nombre, modulo, activo, estado_revision)
VALUES
 ('SALIENTES_ENTREGA_SEGURA_EPS','Salientes · Entrega segura (EPS)','remisiones', true, 'ACTIVA'),
 ('SALIENTES_ENTREGA_SEGURA_SOAT','Salientes · Entrega segura (SOAT)','remisiones', true, 'ACTIVA'),
 ('SALIENTES_ENTREGA_SEGURA_ARL','Salientes · Entrega segura (ARL)','remisiones', true, 'ACTIVA')
ON CONFLICT (codigo) DO UPDATE SET activo = EXCLUDED.activo, estado_revision = EXCLUDED.estado_revision, nombre = EXCLUDED.nombre;

WITH ch AS (
  SELECT id, codigo FROM public.checklists
  WHERE codigo IN ('SALIENTES_ENTREGA_SEGURA_EPS','SALIENTES_ENTREGA_SEGURA_SOAT','SALIENTES_ENTREGA_SEGURA_ARL')
)
INSERT INTO public.checklist_versiones (checklist_id, version, estado, items, notas)
SELECT ch.id, 1, 'ACTIVA',
  CASE ch.codigo
    WHEN 'SALIENTES_ENTREGA_SEGURA_EPS' THEN
      '[
        {"id":"eps1","texto":"Autorización vigente de la EAPB verificada","requerido":true},
        {"id":"eps2","texto":"Historia clínica y resumen de atención adjuntos","requerido":true},
        {"id":"eps3","texto":"Órdenes médicas y ayudas diagnósticas incluidas","requerido":true},
        {"id":"eps4","texto":"Formato de referencia diligenciado y firmado","requerido":true},
        {"id":"eps5","texto":"Consentimiento informado del paciente/acompañante","requerido":true},
        {"id":"eps6","texto":"Medicación e insumos entregados con acta","requerido":false},
        {"id":"eps7","texto":"Ambulancia y personal de traslado verificados","requerido":true}
      ]'::jsonb
    WHEN 'SALIENTES_ENTREGA_SEGURA_SOAT' THEN
      '[
        {"id":"soat1","texto":"FURIPS diligenciado y firmado","requerido":true},
        {"id":"soat2","texto":"Historia clínica completa con nexo causal del evento","requerido":true},
        {"id":"soat3","texto":"Informe de atención inicial de urgencias adjunto","requerido":true},
        {"id":"soat4","texto":"Fotocopia SOAT vigente / póliza verificada","requerido":true},
        {"id":"soat5","texto":"Órdenes médicas e imágenes diagnósticas incluidas","requerido":true},
        {"id":"soat6","texto":"Consentimiento informado del paciente/acompañante","requerido":true},
        {"id":"soat7","texto":"Ambulancia y personal de traslado verificados","requerido":true}
      ]'::jsonb
    WHEN 'SALIENTES_ENTREGA_SEGURA_ARL' THEN
      '[
        {"id":"arl1","texto":"Reporte de accidente de trabajo (FURAT) adjunto","requerido":true},
        {"id":"arl2","texto":"Autorización de la ARL verificada","requerido":true},
        {"id":"arl3","texto":"Historia clínica ocupacional y de urgencias","requerido":true},
        {"id":"arl4","texto":"Órdenes médicas y ayudas diagnósticas incluidas","requerido":true},
        {"id":"arl5","texto":"Formato de referencia diligenciado y firmado","requerido":true},
        {"id":"arl6","texto":"Consentimiento informado del paciente/acompañante","requerido":true},
        {"id":"arl7","texto":"Ambulancia y personal de traslado verificados","requerido":true}
      ]'::jsonb
  END,
  'Versión inicial canónica por régimen (Fase 3).'
FROM ch
ON CONFLICT (checklist_id, version) DO UPDATE
  SET estado = EXCLUDED.estado, items = EXCLUDED.items, notas = EXCLUDED.notas;

UPDATE public.checklists SET activo = false WHERE codigo = 'SALIENTES_ENTREGA_SEGURA';
