# Registro de cambios de estado (4 módulos) y fases reales en Historial

## 1. Inventario por módulo

| Módulo | Estado actual | Caminos que lo cambian | Eventos existentes | Evidencia histórica |
|---|---|---|---|---|
| Salientes | `remisiones.estado` | formularios de seguimiento, `editarCasoSalienteAdmin`, RPC de novedades, cancelación/reactivación (`reactivar_caso_cancelado_admin`) | `seguimientos` (sin estado anterior ni nuevo), trigger de cancelación que guarda el estado previo | audit_logs no guarda estado anterior/nuevo → **ninguna** |
| Referencias Internas | `referencia_interna.estado` | seguimiento y cierre desde la tarjeta, traslado múltiple (`ri_confirmar_llegada_multiple`), cambio de unidad | `seguimientos` | ninguna; no hay columna de fecha de cierre |
| Atención Domiciliaria | `domiciliarios.estado_ciclo` (+ `estado`) | `registrar_evento_phd`, triggers `domi_estado_gating`, `zz_domi_estado_sync`, cancelación | audit `PHD_EVENTO_*` con estado anterior (desde 29/07/2026) | fechas del caso (aceptación, ambulancia, egreso, cierre) + audit PHD con estado anterior |
| Entrantes | eventos en `casos_entrantes` (ING/CAN/AMP/VEN/reactivación) | `entrante_evento_compuesto`, wizard server-side | cada fila de evento ya tiene fecha real | los eventos de transición mismos |

## 2. Almacenamiento elegido: opción (b), una sola tabla nueva
`seguimientos` no sirve: el navegador puede insertar allí, los registros son editables/archivables y es la fuente de actuaciones (se mezclaría con resultados de gestión). `audit_logs` es auditoría técnica, que el Knowledge separa de la trazabilidad. Se crea **una** tabla para los 4 módulos: `caso_cambios_estado`.

## 3. Diseño
- Columnas: id, caso_id, modulo (allowlist de 4 valores), estado_anterior, estado_nuevo, created_at (hora del servidor), actor_id, actor_nombre (copia guardada en ese momento), origen (`USUARIO` o `SISTEMA:<proceso>`).
- Captura: un trigger `AFTER UPDATE OF estado` en `remisiones` y `referencia_interna`, y `OF estado_ciclo` en `domiciliarios`. Solo se dispara si `OLD IS DISTINCT FROM NEW`. El responsable se toma de `auth.uid()` en el servidor; si no hay sesión (trigger, cron o vencimiento) → `SISTEMA` + nombre del proceso. Es una función SECURITY DEFINER con `search_path=''`. Cubre todos los caminos sin tocar formularios ni máquinas de estado.
- Entrantes: no se captura nada nuevo. Sus eventos de transición ya son registros inmutables con fecha.
- RI fecha de cierre: la da el registro cuyo `estado_nuevo` es un estado de cierre. No hace falta una columna nueva.
- RLS: SELECT para `authenticated` solo con `is_active_member(auth.uid())` (misma visibilidad que los casos). Sin GRANT de INSERT, UPDATE ni DELETE a anon ni a authenticated. Un trigger de guarda rechaza UPDATE y DELETE incluso para service_role.

## 4. Fases resultantes
- **Salientes / RI nuevos:** una fase por cada registro. El cambio se muestra como la primera actuación: "Cambio de estado: A → B · Responsable: X".
- **Salientes / RI antiguos:** una sola fase con el estado actual (Yohany sigue igual).
- **Atención Domiciliaria:** los casos nuevos usan los registros de `estado_ciclo`. En los antiguos se usa el audit `PHD_EVENTO_*` (estado anterior y nuevo con fecha), que sale de la misma lógica. Sin ese audit → una sola fase, y se informa.
- **Entrantes:** ING, CAN, VEN, reactivación y ampliación abren fase. ACEPTADO, NEGADO, CRUE y SIN GESTIÓN no abren fase.
- Se conservan los resultados de gestión sin abrir fase, la regla "última fase = estado actual" y la suma de actuaciones. El encabezado de la fase no muestra responsable.
- Lectura: por lotes de 100 `caso_id` de los casos visibles, nunca consultas globales.

## 5. Migraciones previstas
1. `caso_cambios_estado`: tabla, GRANT de SELECT/service_role, RLS, política, guarda de inmutabilidad, función de captura y 3 triggers.

## Detalles técnicos
- En `historial-episodios.ts`, `derivarFases` recibe `cambios[]` opcionales. Un cambio abre una fase e inserta una actuación sintética con `sourceType` `CAMBIO_ESTADO`.
- En `historial.tsx`, una nueva consulta `historial-cambios-estado` por lotes, invalidada junto con los seguimientos.
- Pruebas vitest de fases (con evidencia, sin evidencia, varios gestores) y pruebas SQL de captura, cambio sin variación, responsable y rechazo de escritura para anon/authenticated.
- Validaciones: typecheck, tests, `bun run build`, ESLint, linter y security scan.
