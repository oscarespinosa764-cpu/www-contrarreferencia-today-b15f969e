
# Mejora Dashboard General — Diagnóstico + Plan

Antes de implementar, aquí está el inventario obligatorio (Sección 1) del prompt. Solo tocaré `src/routes/_authenticated/dashboard.tsx` y añadiré parámetros `search` en rutas operativas destino. Nada nuevo en BD, ni motores, ni tablas.

## A. Inventario — qué existe hoy

| Elemento | Existe hoy | Fuente actual | Acción |
|---|---|---|---|
| Remisiones activas | Sí | `metricasRemisiones().activas` (dashboard.tsx) + `/remisiones` | Reutilizar → hacer tarjeta clicable |
| Pendientes de aceptación | Sí | `metricasRemisiones().pendientesAceptacion` | Reutilizar → clic con filtro |
| Aceptaciones entrantes activas | Sí | `metricasCasos().pendientesIngreso` | Reutilizar → clic a `/casos` |
| Seguimientos vencidos | Sí | `/seguimientos` calcula `stats.vencidos` con `calcularVencimiento` | Reutilizar mismo cálculo, tarjeta abre `/seguimientos` |
| PHD/PAD/O2/Especiales activos | Sí (parcial: `domActivos`) | `domiciliarios` + `metricasRemisiones` | Reutilizar → clic a `/remisiones?tab=phd` |
| Estado y entrega del turno | Parcial | `getTurno()` + flujo entrega en `/remisiones` (líneas 44–46: `turnoEntrega`, `recibe`, `confirmEntrega`) + `historial_turnos` en BD | Añadir bloque de resumen que consulta `historial_turnos` (última entrega) y botón que navega a `/remisiones` con acción `entrega` |
| Avisos operativos agrupados por caso | Existe (sin agrupar) | `useAvisosOperativos().combinados` | Añadir capa de agrupación en memoria por `caso_id`/código, prioridad máx, razones concatenadas |
| Alertas de Entrantes | Existe | `alertas_coordinacion` + `casosNotificacion` | Reutilizar; ya está en dashboard |
| Indicadores rápidos | Existe | `metricasIndicadores` | Reutilizar; agregar botón "Ver todos" → `/indicadores` |
| Gate por rol | Existe | `DashboardGate` ya redirige no-admin a `/casos` | Extender: permitir `admin` **y** `coordinador` (rol existente? verificar en `useAuth`) |

## B. Cambios exactos (mínimos)

### 1. `src/routes/_authenticated/dashboard.tsx` (único archivo principal)
- Reorganizar en el orden pedido: Encabezado+Turno → Panel Inteligente (5 tarjetas) → Estado/Entrega Turno → Avisos agrupados → Alertas Entrantes → Indicadores rápidos.
- Hacer las 5 tarjetas principales clicables con `<Link to>`:
  - Remisiones activas → `/remisiones?tab=remisiones&f=activas`
  - Pendientes aceptación → `/remisiones?tab=remisiones&f=pendientes`
  - Aceptaciones entrantes → `/casos?f=aceptados-activos`
  - Seguimientos vencidos → `/seguimientos?f=vencidos`
  - PHD/PAD/O2/Especiales → `/remisiones?tab=phd&f=activas`
- Añadir nota visible: "Los indicadores pueden superponerse según la condición operativa del caso."
- Nueva sección **Estado y entrega del turno**: turno actual (`getTurno()`), última entrega desde `historial_turnos` (últimos 1), fecha/quien entregó/recibió; botón "Ir a entrega de turno" navega a `/remisiones?accion=entrega`.
- Agrupar avisos por `caso_id||codigo`: colapsar razones en una sola tarjeta con prioridad máxima. Mostrar máx 8, botón "Ver todos" → `/reglas`.
- Añadir botón "Ver todos los indicadores" → `/indicadores` en el panel de indicadores rápidos.
- Añadir cálculo real de "Seguimientos vencidos" reutilizando `calcularVencimiento` (importar de `@/lib/rc-utils`) sobre `casos_entrantes` ya consultados.
- Estados de UI: loading skeleton, `data===undefined` diferente de conteo 0, botón Reintentar en error (via `useQuery.refetch`).

### 2. Rutas destino — aceptar filtro por query param
Sin cambiar lógica: solo leer `location.search` con `useSearch({strict:false})` y preseleccionar `estadoFiltro`/`tab` en el `useState` inicial.

- `src/routes/_authenticated/remisiones.tsx`: leer `tab`, `f` (activas | pendientes) e inicializar `tab`/`estadoFiltro`.
- `src/routes/_authenticated/casos.tsx`: leer `f` (aceptados-activos) → activar el filtro que ya existe en `SeguimientoControl`/lista.
- `src/routes/_authenticated/seguimientos.tsx`: leer `f=vencidos` y aplicar filtro visual (ya calcula `stats.vencidos`; agregar prop/estado local).

Cuando se aplica filtro por query, mostrar chip "Filtro: X · Limpiar" que hace `navigate({search:{}})`.

### 3. Rol Coordinador
Verificar `useAuth()`; si no existe `isCoordinator`, usar `hasRole('coordinador')` o similar. Cambiar `DashboardGate`:
```ts
if (!isAdmin && !isCoordinator) return <Navigate to="/casos" replace />;
```
Operativa sigue redirigido; RLS del servidor no se toca.

## C. Fuera de alcance (NO se hace)
- No nuevas tablas, migraciones, RPC, edge functions.
- No motor nuevo de SLA/alertas: se reutiliza `calcularVencimiento` + `useAvisosOperativos`.
- No cambios en `avisos`, `alertas_coordinacion`, `entregas_turno`, `historial_turnos`.
- No Telegram automático.
- No rediseño visual global — se conservan tarjetas/tipografía/colores actuales.
- No lista paralela de pacientes: solo conteos + tarjeta clicable.

## D. Archivos a modificar
1. `src/routes/_authenticated/dashboard.tsx` — reorganización + tarjetas clicables + turno + agrupación + gate.
2. `src/routes/_authenticated/remisiones.tsx` — leer search params.
3. `src/routes/_authenticated/casos.tsx` — leer search params.
4. `src/routes/_authenticated/seguimientos.tsx` — leer search param `f=vencidos`.

## E. Riesgos / preguntas
- **Rol Coordinador**: necesito confirmar el nombre exacto del rol en `user_roles` (¿`coordinador`?) y si `useAuth` lo expone. Si no, extender `useAuth` mínimamente para exponer `isCoordinator`.
- **`historial_turnos`**: confirmar columnas (`turno`, `entregado_por`, `recibido_por`, `fecha`, `estado`) antes de la consulta.

Si apruebas el plan responderé con la implementación en un solo pase, tocando solo esos 4 archivos.
