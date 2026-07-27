# FASE 5B — Corrección del flujo de Remisiones Salientes

Alcance acotado: solo Salientes. No tocar RI, Fase 5A, Entrantes, PHD, filtros, turno, login, dispositivos, consentimiento, Modo Práctica.

## Orden de ejecución

### 1. Inspección canónica (sin escribir)
Leer, en paralelo:
- `src/components/remisiones/seguimiento-dialog.tsx` (tipos TI, gating, aceptación, cancelación, ambulancia, cierre).
- `src/components/remisiones/entrega-documental-dialog.tsx` (snapshot, precarga, firma QR, checklist, portada).
- `src/lib/entrega-documental.ts` y `src/lib/entrega-firma.functions.ts` (sesión firma, polling, idempotencia).
- `src/routes/firma-entrega.tsx` (ruta pública).
- `src/lib/salientes-admin-edit.functions.ts`, `src/lib/salientes-grupos.ts`, `src/routes/_authenticated/remisiones.tsx` (agrupación/estados).
- `src/lib/soportes-utils.ts`, `src/lib/entrega-documental.ts` (checklists DOC_ENTREGA, SOAT/ADRES).
- `src/lib/rc-utils.ts` (posible helper de normalización existente).
- Tabla `entrega_firmas`, `seguimientos`, `remisiones` (columnas ya disponibles vía types.ts).

Meta: identificar reutilización y evitar segundos sistemas.

### 2. Secuencia entrega ↔ cierre
- Gating en el modal de seguimiento:
  - `ENTREGA DOCUMENTAL AMBULANCIA`: visible solo si hay aceptación vigente + ambulancia coordinada + sin entrega registrada.
  - `CIERRE DE CASO POR EGRESO`: visible solo si hay entrega documental persistida.
- Detección canónica: consultar `seguimientos` por códigos `ENTREGA_DOC` (o el código real detectado) del mismo caso; no depender de texto de plantilla ni caché.
- Validación server-side en la función que inserta seguimientos salientes: rechazar cierre por egreso sin entrega y rechazar entrega duplicada, re-consultando dentro de la operación.

### 3. Aceptación con nombre y cargo
- Añadir dos inputs estructurados en el paso `ACEPTACION_IPS`: `nombre_acepta`, `cargo_acepta` (trim, maxLength 160/120).
- Persistir dentro del JSONB `detalles` del seguimiento (sin migración de schema; ya es `jsonb`).
- Mostrar en detalle e Historial cuando existan (render defensivo).
- No obligatorios al registrar aceptación; obligatorios al finalizar entrega documental.

### 4. Resolver canónico de aceptación vigente
Nuevo helper `src/lib/salientes-aceptacion.ts`:
- Input: `casoId`, lista de seguimientos del caso.
- Recorre seguimientos por código `ACEPTACION_IPS` y `CANCELACION_ACEPTACION`, excluye las canceladas, devuelve la última vigente: `{ ips, nombre, cargo, seguimientoId }` o `null`.
- Consumido por: entrega documental (precarga snapshot), función server de entrega (validación), portada.
- Sin coincidencias parciales ni parsing de plantilla.

### 5. Migración a entrega documental
- Al abrir `EntregaDocumentalDialog`, precargar del resolver: IPS, nombre, cargo (mismo origen). Empresa de traslado: dejar la fuente actual.
- Snapshot propio de la entrega: guardar `{ ips, nombre, cargo, empresa, ... }` en la sesión de firma; correcciones se persisten en el snapshot de entrega, no en la aceptación histórica.
- Guardar `aceptacion_origen_id` en el snapshot para trazabilidad.
- Bloquear finalización si falta IPS/nombre/cargo/empresa/firma.

### 6. `SOAT / ADRES`
- En el selector documental (nuevos registros): unificar a `SOAT_ADRES` con label `SOAT / ADRES`.
- Resolver checklist: mapear `SOAT_ADRES` a la lista canónica existente (usar la de SOAT o ADRES ya presente, sin duplicar).
- Históricos con valor `SOAT` o `ADRES` siguen renderizándose tal cual (fallback de label).
- Ajuste solo en catálogo/allowlist de código, sin migración de datos.

### 7. Cancelación de aceptación sin observaciones
- En el paso `CANCELACION_ACEPTACION`: `motivo` obligatorio (≥5), `observaciones` opcional.
- Ajustar validación en modal + función server + generación de plantilla (omitir sección vacía).
- No tocar transición de estado.

### 8. Fecha por defecto en Ambulancia Coordinada
- Al abrir seguimiento nuevo de tipo `AMBULANCIA_COORDINADA`, inicializar `fecha_traslado` con la fecha actual (helper existente); mantener hora manual; no sobrescribir al editar.

### 9. Búsqueda sin tildes (helper global)
- Crear `src/lib/text-normalize.ts` con `normalizeForSearch(s)` (NFD + strip diacríticos + lowercase + trim).
- Reemplazar en consumidores reales de Salientes: autocompletes IPS/servicio/especialidad/empresa/documentos.
- No modificar textareas ni valores persistidos. No aplicar a filtros de otros módulos fuera de alcance.

### 10. Sincronización de firma QR (prioridad alta)
Revisar el mecanismo actual en `RiLlegadaQRPanel` / `EntregaDocumentalDialog`:
- Confirmar polling con `refetchInterval` sobre `entrega_firmas` por `id` (ya presente).
- En escritorio: ejecutar polling también en el diálogo de entrega documental (no solo RI). Al detectar `FIRMADA`, cerrar el estado "esperando", mostrar datos sincronizados (nombre/cargo firmante, fecha, estado), habilitar Portada y checklist final.
- Detener polling al `FIRMADA | VENCIDA | ANULADA` o al cerrar diálogo.
- Idempotencia: la función server ya usa `.eq('estado','PENDIENTE')`; verificar que no se dupliquen evidencias por caso (índice/lookup por `caso_id` activo).
- Estados UI: `ESPERANDO FIRMA | FIRMA COMPLETADA | SESIÓN VENCIDA | SESIÓN ANULADA | ERROR`.

### 11. Portada — evaluación
Buscar `portada` / `oficio` / template histórico:
- Si existe la última versión histórica aprobada de la Portada → reutilizarla, alimentada con datos canónicos (snapshot de entrega + aceptación vigente + firmante).
- **Si NO existe fuente canónica recuperable**: marcar `BLOQUEADO — REQUIERE PLANTILLA HISTÓRICA DE PORTADA` y detener SOLO esta parte. Continuar con el resto.

### 12. Lista de chequeo final y descargas
- Habilitar descarga final SOLO tras firma sincronizada + snapshot completo.
- Antes: mostrar "pendiente de firma".
- No regenerar históricos.

### 13. Validación de registro de entrega
Server-side, verificar antes de insertar la entrega:
- Caso activo, estado compatible.
- Aceptación vigente resuelta (mismo resolver, ejecutado en server).
- Firma `FIRMADA` cuyo `caso_id` coincide.
- Snapshot completo.
- Sin entrega previa registrada.

### 14. Cierre por egreso atómico
- Función server: valida entrega persistida, inserta seguimiento de cierre, aplica estado terminal canónico, transición, auditoría, retira de activos — todo en una operación.

### 15. Auditoría e invalidación
- Registrar eventos ya listados vía `registrarAuditoria` existente (sin nueva bitácora).
- Invalidar `["remisiones"]`, `["seguimientos", casoId]`, `["historial"]`, `["ri-firma-estado", sesionId]` — únicamente lo relacionado.

### 16. Typecheck
Al final: build automático valida. Sin comandos manuales.

## Aspectos técnicos

- **Sin migraciones nuevas salvo indispensables.** Los campos nombre/cargo van en `seguimientos.detalles` (jsonb). Snapshot va en `entrega_firmas.snapshot` (jsonb). `SOAT_ADRES` es solo un código de allowlist en cliente.
- **Roles**: no ampliar permisos. RLS existente cubre `seguimientos`, `entrega_firmas`, `remisiones`. Validación server dentro de funciones ya autenticadas.
- **Portada**: si bloqueada, se documenta en el entregable; no se inventa.
- **Fuera del scope estricto**: no se toca RI (`RiLlegadaQRPanel` puede compartir helpers si aplica sin alterar comportamiento).

## Entregable
Al terminar, se produce el reporte con las 19 secciones solicitadas (inspección, causa raíz, secuencia, resolver, migración, tipos documentales, búsqueda sin tildes, firma QR, documentos, estados, funciones server, invalidación, archivos modificados, migraciones, pruebas, matriz por rol, matriz por capa, bloqueadores, estado final).
