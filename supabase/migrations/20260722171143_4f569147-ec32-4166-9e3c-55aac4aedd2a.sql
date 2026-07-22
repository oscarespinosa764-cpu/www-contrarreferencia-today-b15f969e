UPDATE public.plantillas_inventario
SET editable_nivel = 'PARCIAL'
WHERE codigo = 'ENTREGA_FIRMA_QR'
  AND editable_nivel = 'SOLO_LECTURA';