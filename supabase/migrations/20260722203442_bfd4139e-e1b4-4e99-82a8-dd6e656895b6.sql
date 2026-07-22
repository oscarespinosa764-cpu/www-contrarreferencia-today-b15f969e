
-- FASE 9 — Registrar en el inventario las 3 variantes de OFICIO HTML faltantes.
INSERT INTO public.plantillas_inventario
  (codigo, nombre, modulo, formato, editable_nivel, origen, generador, estado,
   dependencia, notas, contenido_editable, variables_declaradas, puntos_uso_codigos, version)
VALUES
  (
    'ENTRANTES_AMPLIACION_HTML',
    'Oficio de ampliación (entrantes)',
    'ENTRANTES',
    'HTML',
    'PARCIAL',
    'CODIGO+CONFIG',
    'src/lib/oficio.ts',
    'ACTIVA',
    'Dashboard operativo entrantes → botón Ampliar',
    'Se genera al registrar una ampliación. El HTML también se copia al correo.',
    '{}'::jsonb,
    '[
      {"codigo":"TIPO","nombre":"Tipo de respuesta","obligatoria":true,"tipo":"string","valor_prueba":"AMP"},
      {"codigo":"CODIGO","nombre":"Código de gestión","obligatoria":true,"tipo":"string","valor_prueba":"ENT-2026-0001"},
      {"codigo":"MENSAJE","nombre":"Cuerpo del oficio","obligatoria":true,"tipo":"texto","valor_prueba":"Se registra ampliación..."}
    ]'::jsonb,
    ARRAY['ENTRANTES_AMPLIACION'],
    '1.0'
  ),
  (
    'ENTRANTES_INGRESO_HTML',
    'Oficio de ingreso confirmado (entrantes)',
    'ENTRANTES',
    'HTML',
    'PARCIAL',
    'CODIGO+CONFIG',
    'src/lib/oficio.ts',
    'ACTIVA',
    'Dashboard operativo entrantes → botón Confirmar ingreso',
    'Se genera al confirmar el ingreso de un paciente. El HTML también se copia al correo.',
    '{}'::jsonb,
    '[
      {"codigo":"TIPO","nombre":"Tipo de respuesta","obligatoria":true,"tipo":"string","valor_prueba":"ING"},
      {"codigo":"CODIGO","nombre":"Código de gestión","obligatoria":true,"tipo":"string","valor_prueba":"ENT-2026-0001"},
      {"codigo":"MENSAJE","nombre":"Cuerpo del oficio","obligatoria":true,"tipo":"texto","valor_prueba":"Se confirma el ingreso..."}
    ]'::jsonb,
    ARRAY['ENTRANTES_INGRESO'],
    '1.0'
  ),
  (
    'ENTRANTES_CRUE_NO_REQUERIMIENTO_HTML',
    'Oficio CRUE — No requerimiento (entrantes)',
    'ENTRANTES',
    'HTML',
    'PARCIAL',
    'CODIGO+CONFIG',
    'src/lib/oficio.ts',
    'ACTIVA',
    'Dashboard operativo entrantes → respuesta CRUE',
    'Se genera cuando NO se requiere direccionamiento del CRUE. El HTML también se copia al correo.',
    '{}'::jsonb,
    '[
      {"codigo":"TIPO","nombre":"Tipo de respuesta","obligatoria":true,"tipo":"string","valor_prueba":"CRUE_NR"},
      {"codigo":"CODIGO","nombre":"Código de gestión","obligatoria":true,"tipo":"string","valor_prueba":"ENT-2026-0001"},
      {"codigo":"MENSAJE","nombre":"Cuerpo del oficio","obligatoria":true,"tipo":"texto","valor_prueba":"No se requiere direccionamiento..."}
    ]'::jsonb,
    ARRAY['ENTRANTES_CRUE_NO_REQUERIMIENTO'],
    '1.0'
  )
ON CONFLICT (codigo) DO NOTHING;

-- Puntos de uso — apuntan al mismo componente que las variantes existentes.
INSERT INTO public.puntos_de_uso
  (codigo, nombre, modulo, tipo_salida, plantilla_codigo, componente_responsable, estado)
VALUES
  ('ENTRANTES_AMPLIACION',           'Ampliación de caso entrante',        'ENTRANTES', 'HTML', 'ENTRANTES_AMPLIACION_HTML',           'src/components/rc/resultado-card.tsx', 'ACTIVO'),
  ('ENTRANTES_INGRESO',              'Confirmación de ingreso entrante',   'ENTRANTES', 'HTML', 'ENTRANTES_INGRESO_HTML',              'src/components/rc/resultado-card.tsx', 'ACTIVO'),
  ('ENTRANTES_CRUE_NO_REQUERIMIENTO','CRUE — No requerimiento',            'ENTRANTES', 'HTML', 'ENTRANTES_CRUE_NO_REQUERIMIENTO_HTML','src/components/rc/resultado-card.tsx', 'ACTIVO')
ON CONFLICT (codigo) DO NOTHING;
