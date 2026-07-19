## Fase A — Q1 + Q7 (base canónica, auditable y reutilizable)

Bug bloqueante ya corregido en este turno: `useDictationConfigRows` ahora exige sesión (`enabled: !!user`), lo que detiene el bucle de 401 sobre `voice_dictation_config` en `/login`. Con eso, procedo únicamente con Fase A.

### 1. Inventario previo (una sola consulta, sin modificar datos)
Antes de crear cualquier catálogo, ejecuto una lectura de `public.catalogos` agrupada por `tipo` para confirmar cuáles de los 10 ya existen y con qué valores. También leo distintos `profiles.cargo`, sedes activas en `red_operativa`, motivos usados hoy en `shift_monthly_exceptions`, novedades en `remisiones`, y motivos de cierre en `casos_entrantes`/`historicos_casos`. El resultado alimenta las tablas del informe final (no se muestran valores sensibles).

### 2. Migración única `phase_a_catalogos_y_auditoria` (idempotente, no destructiva)
Una sola migración agrupada. Solo estructura y seeds seguros. No borra ni renombra nada.

Cambios de esquema:
- `public.catalogos`: solo si faltan, añade columnas opcionales `codigo TEXT`, `orden INT DEFAULT 0`, `metadata JSONB DEFAULT '{}'`, `updated_by UUID`, `created_by UUID`. Ninguna se marca NOT NULL. Índice `UNIQUE (tipo, codigo) WHERE codigo IS NOT NULL` (parcial, no rompe filas antiguas).
- Nueva tabla `public.catalogo_dependencias` con: `catalogo_tipo`, `elemento_id` (nullable), `modulo`, `ruta`, `ventana`, `formulario`, `campo`, `tipo_control`, `obligatorio`, `componente`, `verificado_at`. GRANTs + RLS: SELECT autenticados, INSERT/UPDATE/DELETE solo admin (via `has_role`). Se llena por seed determinista, no por escaneo runtime.
- Nueva tabla `public.plantillas_inventario` con: `codigo`, `nombre`, `modulo`, `formato` (`PDF`/`EXCEL`), `origen` (`CODIGO`/`CODIGO+CONFIG`), `generador` (ruta del módulo), `estado`, `version`, `dependencia`, `editable_nivel` (`SOLO_LECTURA`/`PARCIAL`/`COMPLETA`). GRANT + RLS igual que arriba. Seed con las 7 plantillas.
- Extensión mínima de `public.audit_logs` NO se toca (ya existe). Se reutiliza `registrar_auditoria_srv` para todos los eventos nuevos.
- Nueva función `public.registrar_auditoria_catalogo(_accion, _tipo, _elemento_id, _antes, _despues, _motivo)` SECURITY DEFINER, `search_path=''`, que sanitiza y llama a `registrar_auditoria_srv`. No expone PII.
- Triggers de auditoría append-only sobre `public.catalogos`, `public.plantillas`, `public.catalogo_dependencias`, `public.plantillas_inventario`: en INSERT/UPDATE/DELETE guardan solo `id`, `tipo/codigo`, `antes_resumen`, `despues_resumen`, `usuario`, `hora`, `accion`. Nunca guardan HTML, base64, PII ni tokens.

Seeds (todos `ON CONFLICT DO NOTHING`, con `codigo` estable, `orden` explícito):
- `TIPO_AMBULANCIA`: TAB, TAM, TAM_N (más AEREA si el inventario la encuentra en uso real).
- `TIPO_EAPB`: EPS, ARL, PARTICULAR, POLIZA, MEDICINA_PREPAGADA, SOAT, OTRO.
- `TIPO_RECURSO_RED`: HOSPITALARIO, AMBULATORIO, DOMICILIARIO, AMBULANCIA, ESPECIALIDAD, DIRECTORIO_INTERNO.
- `MOTIVO_EXENTO_CUPO`: valores actuales de `src/lib/solicitudes-utils.ts`.
- `TIPO_INDICADOR`: valores actuales de `src/lib/indicadores-utils.ts`.
- `AREA_CRUE`: seed inicial vacío + los valores detectados en Fase 1; si son ambiguos se dejan pendientes.
- `TIPO_NOVEDAD_SALIENTE`, `MOTIVO_CIERRE_ENTRANTE`: seed de los valores inequívocos detectados; los ambiguos van al informe como “pendientes de decisión manual”.
- `SEDE` y `CARGO`: seed inicial con los valores exactos detectados en `profiles`/`red_operativa`. NO fusiona ambiguos automáticamente — quedan como “pendiente conciliación”.

### 3. Adaptadores de lectura (código, mínimos)
No refactor grande. Un solo helper nuevo `src/lib/catalogos-canonicos.ts` con:
- `useCatalogo(tipo)` (React Query, caché 5 min, filtra `activo`, ordena por `orden`).
- `getCatalogoOnce(tipo)` para uso puntual.
- Utilidades `resolveCanonico(tipo, valor)` para tolerar valores históricos (fallback al valor recibido sin romper renders).

Adaptación quirúrgica de tres archivos, sin borrar los arrays actuales (quedan como fallback runtime marcado con comentario, hasta la Fase B que los retire tras verificación):
- `src/lib/red-ips-utils.ts` → `TIPOS_AMBULANCIA`, `TIPOS_EAPB`, `TIPOS_RECURSO` pasan a leerse del catálogo; si el catálogo aún no cargó, se usa el array anterior. Sin cambios a firmas exportadas.
- `src/lib/solicitudes-utils.ts` → `MOTIVOS_EXENTOS` igual.
- `src/lib/indicadores-utils.ts` → `TIPOS_INDICADOR` igual.

No se modifican archivos de estados técnicos, máquinas de estado, RLS, `has_role`, ni componentes fuera del alcance.

### 4. Auditoría, dependencias y advertencias
- `src/components/catalogo/categoria-modal.tsx` (pestañas ya existentes):
  - Pestaña **Configuración**: cuando el admin marca un elemento como inactivo, consulta `catalogo_dependencias` + un `count` de usos en tablas registradas y muestra el modal “ESTE ELEMENTO SE UTILIZA EN …” exigiendo motivo. Bloquea desactivar si hay dependencias marcadas obligatorias, salvo confirmación explícita.
  - Pestaña **Historial de cambios**: consume `audit_logs` filtrado por `tabla IN ('catalogos','plantillas','catalogo_dependencias','plantillas_inventario')` y `registro_id`. Ya no queda vacía.
- Seed inicial de `catalogo_dependencias` con las rutas conocidas (Red → Tipo de ambulancia, Salientes → EAPB, Salientes → Motivo cierre, etc.). No se hace scan runtime.

### 5. Inventario de plantillas
Nueva pestaña de solo lectura “Inventario” dentro de la vista actual de Plantillas (`src/components/catalogo/…` o el panel de plantillas existente): lista las 7 plantillas desde `plantillas_inventario`, marca origen `CODIGO`/`CODIGO+CONFIG` y muestra “DISEÑO ADMINISTRABLE PENDIENTE DE DESARROLLO” para las que aún no son editables. No toca ningún generador (`salientes-export.ts`, `solicitud-pdf.ts`, etc.).

### 6. Fuera de alcance (confirmado)
No implemento: dictado (registro de 12 campos), reorganización de Control de Mando en 10 secciones, listas de chequeo, PDF de listas, refactor de Reporte General o TH-FR-09, notas de voz, audio. No modifico Auth, dominios, Lovable Emails, `has_role`, ni RLS existentes.

### 7. Informe final
Al terminar entrego las tablas A–J y K exactamente como pide el prompt, con los pendientes de conciliación marcados (SEDE y CARGO ambiguos, novedades/motivos de cierre ambiguos, etc.) para que puedas decidirlos en una ronda posterior sin migrarlos ahora.

### Detalles técnicos
- Todas las tablas nuevas siguen el patrón obligatorio: `CREATE TABLE` → `GRANT` a `authenticated`/`service_role` (sin `anon`) → `ENABLE RLS` → `CREATE POLICY` usando `public.has_role(auth.uid(),'admin')`.
- Triggers de auditoría son `SECURITY DEFINER` con `SET search_path = ''` y sanitización explícita.
- `catalogo_dependencias` no se puebla desde el cliente: solo por seeds/migraciones o server functions admin.
- No se instalan dependencias npm.
- Una sola migración; los seeds usan `INSERT ... ON CONFLICT DO NOTHING` para ser reejecutables.

¿Autorizas ejecutar esta Fase A tal como está descrita?