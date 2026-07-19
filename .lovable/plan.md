## Alcance acordado

Fase 1 + Fase 2, sin editor de "crear plantilla desde cero" ni redise\u00f1o de listas documentales (esas quedan para una Fase 3 posterior). Salientes\u00b7Entrega segura se archiva/renombra como base para EPS/SOAT/ARL en la Fase 3; PHD y Apertura de turno pasan a `BORRADOR_EN_REVISION` sin punto activo.

## Entregables

### 1. Inventario real de plantillas (auditor\u00eda + siembra)

Auditar el c\u00f3digo y sembrar en `plantillas_inventario` los registros faltantes con `codigo`, `nombre`, `modulo`, `formato`, `origen`, `generador`, `editable_nivel`, `dependencia`, `contenido_editable` (campos seguros) y `notas`. M\u00ednimo a cubrir:

- `ENTRANTES_ACEPTACION_HTML` \u2192 buildOficioHTML (aceptaci\u00f3n)
- `ENTRANTES_NEGACION_HTML` \u2192 buildOficioHTML (negaci\u00f3n)
- `ENTRANTES_CANCELACION_HTML` (si existe)
- `ENTRANTES_BITACORA_PDF` \u2192 bitacora-pdf.ts
- `SALIENTES_REPORTE_GENERAL_PDF` \u2192 salientes-export
- `SALIENTES_ENTREGA_DOCUMENTAL_PDF` \u2192 entrega-firma-pdf
- `HISTORIAL_EXPORTACION_XLSX` \u2192 historial-export
- `CUADRO_TURNO_SOLICITUD_PERMISO_PDF` (TH-FR-09) \u2192 solicitud-pdf
- `CUADRO_TURNO_EXPORTACION_MENSUAL_XLSX` (TH-FR-10) \u2192 cuadro-excel
- `CUADRO_TURNO_AUSENTISMO_XLSX` (TH-FR-48) \u2192 ausentismo-export

Los 7 registros ya existentes se preservan; solo se completan campos faltantes y se enriquece `contenido_editable`.

### 2. Registro de puntos de uso (nuevo)

Nueva tabla `puntos_de_uso` (solo lectura para operativa/coordinador, admin gestiona) con columnas: `codigo`, `modulo`, `ruta`, `ventana`, `paso`, `evento`, `tipo_salida`, `variables_disponibles` (jsonb), `plantilla_codigo` (fk l\u00f3gica a `plantillas_inventario.codigo`), `estado`, `componente_responsable`, `notas`. Sembrada con un punto por cada plantilla del inventario. Sin creaci\u00f3n libre desde UI \u2014 catalogo cerrado en esta fase.

### 3. Redise\u00f1o del panel Plantillas del sistema

Reemplaza el panel actual por una vista con:

- **4 pesta\u00f1as principales**: Documentos \u00b7 Textos y comunicaciones \u00b7 Listas de chequeo (delegado al panel existente) \u00b7 Puntos de uso.
- **Filtros**: b\u00fasqueda, m\u00f3dulo, formato, estado, editabilidad.
- **Tarjetas** con nombre, c\u00f3digo, m\u00f3dulo, formato, versi\u00f3n activa, punto(s) de uso, nivel de editabilidad con etiqueta explicativa (`EDITABLE` \u00b7 `CONFIGURACI\u00d3N PARCIAL` \u00b7 `ARCHIVO REEMPLAZABLE` \u00b7 `SOLO LECTURA` \u00b7 `REQUIERE INTEGRACI\u00d3N T\u00c9CNICA`).
- **Detalle con sub-pesta\u00f1as**: Vista previa \u00b7 Dise\u00f1o y contenido \u00b7 Variables \u00b7 Puntos de uso \u00b7 Versiones \u00b7 Historial.

### 4. Vista previa segura (por formato)

- **HTML**: render en iframe sandbox con datos ficticios (`PACIENTE DE PRUEBA`, doc enmascarado, IPS de prueba, etc.).
- **PDF**: bot\u00f3n "Generar PDF de prueba" que invoca el generador real con datos ficticios y abre el blob en nueva pesta\u00f1a.
- **Excel**: muestra columnas/encabezados declarados en `contenido_editable.columnas` y bot\u00f3n para descargar XLSX de prueba.
- **Texto/Mensaje**: render de string con variables sustituidas.

Los generadores actuales siguen intactos; se agrega un modo `preview: true` que acepta el payload ficticio.

### 5. Editor de campos seguros

El editor actual de `contenido_editable` se ampl\u00eda:

- Campos declarados por plantilla con tipos: texto corto, texto largo, boolean, color (paleta autorizada), n\u00famero, seleccionar (enum), lista ordenable (columnas Excel/PDF).
- Cada campo con etiqueta legible, descripci\u00f3n y valor por defecto.
- Bot\u00f3n **Vista previa** que aplica el borrador sin guardar.
- Bot\u00f3n **Guardar como nueva versi\u00f3n** (obligatorio para plantillas con `versionable=true`).

### 6. Variables (declarativo)

Nuevo campo `variables_declaradas` (jsonb) en `plantillas_inventario` con `codigo`, `nombre`, `descripcion`, `fuente`, `tipo`, `obligatoria`, `valor_prueba`. Se muestra en la pesta\u00f1a Variables del detalle. No editable en esta fase (define el generador).

### 7. Versionado ligero + historial

Nueva tabla `plantillas_versiones`:

- `plantilla_codigo`, `version` (int), `estado` (`BORRADOR`/`ACTIVA`/`ARCHIVADA`), `contenido_editable` (jsonb snapshot), `motivo`, `creada_por`, `creada_at`, `publicada_at`, `publicada_por`.
- Solo una `ACTIVA` por `plantilla_codigo`.
- Al publicar: la actual pasa a `ARCHIVADA`, la nueva a `ACTIVA`, y se copia su `contenido_editable` a `plantillas_inventario` para que los generadores (que leen `plantillas_inventario`) no cambien su contrato.
- Bot\u00f3n **Volver a versi\u00f3n anterior** duplica una archivada como nuevo borrador.
- Historial: lista cronol\u00f3gica de versiones con usuario, fecha, motivo. La auditor\u00eda ya existente en `audit_logs` sigue registrando los cambios.

### 8. Ajuste de listas actuales

- `SALIENTES_ENTREGA_SEGURA` \u2192 renombrar visualmente a "Salientes \u00b7 Entrega segura (gen\u00e9rica)" y marcar `estado='EN_REVISION'`. Sirve como base para Fase 3.
- `PHD_RADICACION_VALIDACION` \u2192 `estado='BORRADOR_EN_REVISION'`, versi\u00f3n activa se despublica; se remueve la ejecuci\u00f3n bloqueante en `phd-ciclo-panel` (queda visible pero no obligatoria).
- `TURNO_APERTURA` \u2192 `estado='BORRADOR_SIN_VINCULAR'`, sin punto de ejecuci\u00f3n.

Ninguna se elimina.

## Detalle t\u00e9cnico

### Migraciones

1. `puntos_de_uso` (tabla + GRANT + RLS: SELECT authenticated, ALL admin + service_role) + siembra.
2. `plantillas_versiones` (tabla + GRANT + RLS: SELECT authenticated, ALL admin) + trigger `updated_at`.
3. `ALTER plantillas_inventario ADD COLUMN variables_declaradas jsonb DEFAULT '[]'`.
4. `ALTER checklists ADD COLUMN estado_revision text` para los 3 estados nuevos (`ACTIVA`/`EN_REVISION`/`BORRADOR_EN_REVISION`/`BORRADOR_SIN_VINCULAR`).
5. Siembras: nuevos registros de `plantillas_inventario`, `puntos_de_uso`, ajuste de las 3 listas.

### Frontend

- `src/components/coordinacion/plantillas-inventario-panel.tsx`: redise\u00f1o completo a las 4 pesta\u00f1as + detalle con sub-pesta\u00f1as.
- `src/components/coordinacion/plantilla-preview.tsx` (nuevo): renderizador de vista previa por formato con datos ficticios.
- `src/components/coordinacion/plantilla-editor-campos.tsx` (nuevo): editor din\u00e1mico por tipo de campo.
- `src/components/coordinacion/plantilla-versiones.tsx` (nuevo): listado y publicaci\u00f3n de versiones.
- `src/components/coordinacion/puntos-uso-panel.tsx` (nuevo): tabla de puntos de uso.
- `src/lib/plantillas-preview-fixtures.ts` (nuevo): datos ficticios can\u00f3nicos.
- `src/lib/plantillas-versiones.functions.ts` (nuevo): server fns `listarVersiones`, `crearBorrador`, `publicarVersion`, `restaurarVersion` (todas con `requireSupabaseAuth` + verificaci\u00f3n admin).
- Generadores existentes: agregar par\u00e1metro opcional `previewFixture` para renderizar sin tocar backend.

### Seguridad

- Todos los mutadores pasan por server fns admin-only (verificaci\u00f3n `has_role`).
- HTML editable sanitizado antes de render (`DOMPurify` \u2014 ya disponible via shadcn stack? si no, se agrega).
- `contenido_editable` se valida contra un schema por plantilla (whitelist de claves).
- Ning\u00fan cambio a RLS de otras tablas ni a consultas de datos.

## Fuera de alcance (queda para Fase 3)

- Creaci\u00f3n de plantillas nuevas desde UI.
- Carga de archivos base (DOCX/PDF).
- Redise\u00f1o de las 3 listas can\u00f3nicas EPS/SOAT/ARL con selecci\u00f3n autom\u00e1tica en Entrega documental.
- Nuevos puntos de uso creables desde UI.

## Criterios de cierre de Fase 1+2

1. `Plantillas del sistema` muestra 10+ plantillas reales con puntos de uso visibles.
2. Cada plantilla tiene vista previa funcional con datos ficticios.
3. Admin puede editar campos seguros y publicar nueva versi\u00f3n.
4. Historial de versiones visible por plantilla.
5. Las 3 listas actuales quedan en el estado acordado, sin borrar.
6. Typecheck limpio, sin cambios a RLS de tablas no relacionadas.