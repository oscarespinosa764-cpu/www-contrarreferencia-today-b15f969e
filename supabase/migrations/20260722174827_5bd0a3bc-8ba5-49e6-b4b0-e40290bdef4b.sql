
UPDATE public.plantillas_inventario
   SET editable_nivel = 'PARCIAL',
       nombre = 'Bitácora operativa (consolidada y por caso)'
 WHERE codigo = 'BITACORA_ENTRANTES';

INSERT INTO public.puntos_de_uso (codigo, nombre, modulo, ruta, ventana, paso, evento, tipo_salida, plantilla_codigo, componente_responsable, estado, notas)
VALUES
  ('SALIENTES_BITACORA_PDF','Bitácora de salientes','SALIENTES','/historial','Historial · Salientes','Bitácora','click','PDF','BITACORA_ENTRANTES','src/lib/bitacora-pdf.ts','ACTIVO','Comparte plantilla con entrantes; misma estructura.'),
  ('PHD_BITACORA_PDF','Bitácora PHD/PAD/O2','PHD','/historial','Historial · PHD','Bitácora','click','PDF','BITACORA_ENTRANTES','src/lib/bitacora-pdf.ts','ACTIVO','Comparte plantilla con entrantes; misma estructura.'),
  ('INTERNA_BITACORA_PDF','Bitácora de referencia interna','INTERNA','/historial','Historial · Interna','Bitácora','click','PDF','BITACORA_ENTRANTES','src/lib/bitacora-pdf.ts','ACTIVO','Comparte plantilla con entrantes; misma estructura.'),
  ('CONSULTA_BITACORA_CONSOLIDADA_PDF','Bitácora consolidada por paciente','HISTORIAL','/historial','Consulta por paciente','Consolidado','click','PDF','BITACORA_ENTRANTES','src/lib/bitacora-pdf.ts','ACTIVO','Un solo PDF con múltiples bloques del mismo paciente.')
ON CONFLICT (codigo) DO UPDATE
  SET nombre = EXCLUDED.nombre,
      modulo = EXCLUDED.modulo,
      ruta = EXCLUDED.ruta,
      ventana = EXCLUDED.ventana,
      paso = EXCLUDED.paso,
      evento = EXCLUDED.evento,
      tipo_salida = EXCLUDED.tipo_salida,
      plantilla_codigo = EXCLUDED.plantilla_codigo,
      componente_responsable = EXCLUDED.componente_responsable,
      estado = EXCLUDED.estado,
      notas = EXCLUDED.notas;
