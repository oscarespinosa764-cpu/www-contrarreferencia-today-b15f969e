
# Rediseño Cuadro de Turno — plan controlado

Estructura actual ya cumple gran parte del prompt: existen las 3 pestañas principales (`Cuadro de Turno`, `Solicitudes y Ausentismo`, `Administración`), las 3 subpestañas (`Solicitudes y Cambios`, `Pendientes de Verificación`, `Control de Ausentismo`), catálogo `shift_types` con color/hora/tipo, tablas `shift_schedules/members/days`, `shift_requests`, `shift_absenteeism_records`, `shift_request_audit`, `shift_return_fragments`, RLS activa. **No se crearán tablas nuevas ni migraciones destructivas.**

## Fases propuestas (todo frontend, cero migraciones)

### F1 · Estado en URL + persistencia de periodo
- Añadir `validateSearch` (Zod + `fallback`) en `/cuadro-turno` con `vista`, `sub`, `anio`, `mes`, `dia`, `q`, `cargo`, `estado`, `tipo`.
- `Tabs` y subtabs pasan a leer/escribir la URL sin recargar.
- Selector año/mes global compartido entre pestañas cuando aplique.

### F2 · Pantalla CUADRO DE TURNO (referencia imagen 2)
- **Header controls** (año, mes, Exportar Excel, selector vista Calendario/Matriz/**Lista**, leyenda dinámica desde `shift_types`, buscador colaborador con debounce 400 ms, filtro cargo, botón Agregar).
- **4 tarjetas de resumen** calculadas del mes real:
  1. Turnos programados = `count(shift_schedule_days)` del mes activo.
  2. Coberturas = % desde `shift_requests` aprobadas con `requires_replacement`; si denominador 0 → “Sin coberturas requeridas”.
  3. Novedades = suma de: días sin cubrir, ausencias vigentes, solicitudes pendientes que afectan programación.
  4. Disponibilidad = `(colaboradores_activos_con_asignacion − ausencias_dia_actual) / colaboradores_activos * 100`, documentado.
- **Vista Lista**: nueva vista tabular paginada (server-side, cliente-side sobre la consulta mensual ya existente) con fecha/funcionario/cargo/turno/hora/estado/observaciones + exportación respetando filtros.
- **Vista Calendario** (ya existe): mejora la celda para máximo 4 asignaciones + “+N más”, click abre modal día; panel derecho “Resumen del día” con donut por `shift_type.color` real.
- **Leyenda de turnos** deja de estar hardcoded (`A/ADM/D/M/N/T/V/O`) y se pinta desde `shift_types` activos con tooltip (código, nombre, horario, tipo).

### F3 · Pantalla SOLICITUDES Y CAMBIOS (referencia imagen 1)
- **Historial de cambios** superior con 3 KPI del periodo: Solicitudes realizadas / Aprobadas / Pendientes (desde `shift_requests` filtradas por mes).
- **Filtros**: año, mes, funcionario, cargo, estado, tipo, Limpiar. Debounce 400 ms.
- **Selector vista tarjetas / lista** + ordenamiento (Nombre A-Z/Z-A, Mayor/Menor consumo, Más pendientes, Más coberturas).
- **Tarjetas de funcionario** (3/2/1 col responsive) alimentadas por `ControlMensualPanel` ya existente, mostrando:
  - Permisos solicitados (propias) vs Coberturas aceptadas (por otros) — **contadores separados**.
  - Pendientes / Disponibles / Exentos / % consumo / Total del mes.
  - Anillo de progreso con color según reglas (VERDE ≥2, AMARILLO =1, ROJO ≤0, GRIS exento).
- **Detalle de funcionario**: modal con pestañas Resumen / Permisos propios / Coberturas / Pendientes / Excepciones / Historial (carga bajo demanda por query separada).
- Paginación local (6/12/24) sobre el listado de miembros del mes.

### F4 · Reglas de consumo (cálculo puro, sin cambios de schema)
Helper `computeCupo(userId, mes, año)` que aplica prioridad:
1. `shift_monthly_exceptions` del funcionario/periodo.
2. Config del funcionario en `shift_schedule_members`.
3. Config general (constante `CUPO_BASE = 3` ya existente en utils).

Separa `consumo_propio` (solicitudes propias aprobadas que consumen) de `consumo_cobertura` (aceptadas como reemplazo). Pendientes → “Consumo provisional”, no descuenta. Nunca divide por 0.

### F5 · Ajustes puntuales
- Normalizar a MAYÚSCULAS los textos operativos (motivo/observación) al guardar en `SolicitudFormDialog`.
- Tooltips accesibles en códigos de turno, foco visible, Escape en modales (Radix ya lo cubre — auditar).
- Confirmar `defaultPreloadStaleTime: 0` y `queryClient.cancelQueries` al cambiar de pestaña.

## Fuera de alcance (no se toca)
Entrantes, Salientes, PHD/PAD/O2, Referencias Internas, Historial, Indicadores, Red, Alertas, Auth, correo, dominios, RLS existente, service role, catálogo `shift_types`, tabla `profiles`.

## Modelo de datos — reuso total

| Concepto | Tabla real | Acción |
|---|---|---|
| Catálogo turnos | `shift_types` | reuso |
| Programación mensual | `shift_schedules` + `shift_schedule_members` + `shift_schedule_days` | reuso |
| Solicitudes | `shift_requests` | reuso |
| Auditoría solicitudes | `shift_request_audit` | reuso |
| Ausentismo | `shift_absenteeism_records` | reuso |
| Devolución tiempo | `shift_return_fragments` + `shift_request_recovery_logs` | reuso |
| Excepciones cupo | `shift_monthly_exceptions` | reuso |

## Confirmación necesaria

¿Ejecuto las 5 fases en orden en una sola tanda (grande, ~10-14 archivos frontend), o prefieres que empiece solo por **F1 + F2** (pantalla Cuadro de Turno con URL state, 4 tarjetas y vista Lista) y luego seguimos con F3-F5 en el siguiente turno?
