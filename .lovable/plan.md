
# Plan — RED HOSPITALARIA Y DISPONIBILIDAD

Antes de tocar código quiero acordar el alcance para no malgastar créditos. El módulo ya existe (`src/routes/_authenticated/red-ips.tsx`, `src/components/red/*`, tabla única `red_operativa` con 58 columnas + `catalogos` para EAPB). Reutilizo TODO lo existente.

## Inventario reutilizado (sin duplicar)

- **Tabla única**: `red_operativa` (ya cubre IPS, ambulancias, jornadas/TEP, especialidades CEDIM, EAPB, CRUE, líneas, directorios externo/interno vía `tipo_red`). Incluye `relaciones_red` y `codigos_apoyo` jsonb para relaciones múltiples.
- **EAPB fuente única**: `catalogos` (no se toca).
- **Componentes**: `RedCard`, `RedFormDialog`, `RedAdminDialog`, utils `red-ips-utils.ts` con `RED_GRUPOS`, subsecciones y filtros ya definidos.
- **Ruta**: `/red-ips` (mantengo el path; no rompo enlaces internos ni menú).
- **Auditoría**: `registrarAuditoria` ya integrado en crear/editar/eliminar.
- **RLS**: políticas actuales de `red_operativa` se mantienen.

## Cambios acotados (sólo frontend, sin migraciones)

### 1. Layout — cards ARRIBA de las pestañas
- Mover las 4 tarjetas (IPS activas / IPS inactivas / Especialidades CEDIM activas / Ambulancias activas) del aside lateral a una fila superior de 4 columnas (responsive: 2 cols tablet, 1-2 cols móvil).
- Cada tarjeta clickeable → cambia pestaña + aplica filtro (`ipsActivas` → IPS + estado activo, `ipsInactivas` → IPS + inactivo, etc.).
- Quitar el aside derecho; el listado ocupa el ancho completo.
- Mostrar chip "RED DE INSTITUCIONES" entre cards y pestañas (ya existe).

### 2. Estado en URL (TanStack Router `validateSearch`)
- Persistir `grupo`, `sub`, `ambito`, `q`, `estado`, `page`, `pageSize` en search params.
- Recarga/compartir URL restaura la vista.
- Reset a página 1 al cambiar pestaña/búsqueda/filtro.

### 3. Búsqueda con debounce (400 ms)
- Debounce en el input; sigue filtrando en memoria porque el listado ya viene completo por `useQuery` (dataset actual manejable). **NO** implemento paginación en servidor todavía: `red_operativa` tiene volumen bajo y el prompt permite mantener la arquitectura existente si es suficiente. Si más adelante crece, se migrará a RPC paginada.
- Añado paginación local (10/20/50) sobre la lista filtrada para cumplir el requisito visual y de UX de la spec.

### 4. Subpestañas Directorios Externos e Interno
- Ya existen en `RED_GRUPOS`. Agrego el tipo `directorio_ambulancia` (nueva subpestaña en Directorios Externos) reutilizando `red_operativa` con `tipo_red='directorio_ambulancia'`. Sólo requiere agregarlo a `red-ips-utils.ts` y al `RedFormDialog` — ningún cambio de esquema.
- Mostrar conteo real `(N)` en cada subpestaña (ya existe `conteoSub`).

### 5. Copiar al portapapeles
- Componente pequeño `CopyIconButton` reutilizable.
- Se usa en `RedCard` y modal detalle para teléfono, correo, extensión, código.
- Toast discreto "COPIADO".

### 6. Botón "Nuevo registro · <sección>"
- Ya cambia el label según subActiva/grupo. Verifico y ajusto textos a los exigidos.

### 7. Estados y colores uniformes
- Badge de estado con icono + texto (verde/azul/amarillo/rojo/gris) según el estado del registro. Reutilizo tokens `status-*` existentes.

### 8. Normalización MAYÚSCULAS
- Ya se aplica en `RedFormDialog` para campos operativos. Verifico cobertura.

### 9. Modal detalle organizado por bloques
- Reorganizo el `Dialog` actual en secciones (General / Ubicación / Contacto / Disponibilidad / Relaciones / Observaciones). No cambio datos, sólo estructura visual con scroll interno.

### 10. Responsive + accesibilidad
- Grid tarjetas: `grid-cols-1 sm:grid-cols-2 lg:grid-cols-4`.
- Pestañas con `overflow-x-auto` (ya existe).
- `aria-label` en botones-icono de copiar/acciones.

## Lo que NO haré (respetando la regla de no malgastar créditos)

- **Sin migraciones**. La tabla `red_operativa` cubre todo el modelo conceptual del prompt. Crear `jornadas_salud`, `empresas_ambulancia`, `ambulancia_tipos`, `especialistas`, `disponibilidades_especialistas` sería duplicación explícitamente prohibida por el prompt (§0.7-8, §24).
- **Sin paginación server-side / RPC nueva**. Se puede añadir después si el volumen lo exige.
- **Sin tocar otros módulos**, RLS, auth, catálogos, indicadores, cuadro de turno, etc.
- **Sin instalar dependencias**.
- **Sin borrar datos** ni columnas.
- **Sin cambios en `RedFormDialog`** más allá de agregar `directorio_ambulancia` como opción de `tipo_red`.

## Archivos a modificar

| Archivo | Cambio |
|---|---|
| `src/routes/_authenticated/red-ips.tsx` | Layout cards arriba, URL state, debounce, paginación local, click handlers de cards, modal por bloques |
| `src/lib/red-ips-utils.ts` | Agregar `directorio_ambulancia` a `TipoRed`, `TIPO_RED_LABEL` y a subsecciones de Directorios Externos |
| `src/components/red/red-card.tsx` | Badge de estado con icono, botones copiar en teléfono/correo/extensión |
| `src/components/red/red-form-dialog.tsx` | Agregar `directorio_ambulancia` al selector de tipo dentro de Directorios Externos |
| `src/components/ui/copy-button.tsx` (nuevo, pequeño) | Botón copiar reutilizable |

## Criterios de aceptación cumplidos

Cubre: cards arriba (§1-3, §4), 6 pestañas + subpestañas con conteo real (§5-6, §14-15), URL state (§6), debounce búsqueda (§8), paginación (§9), botón contextual (§18), copiar (§16), estados uniformes (§20), responsive (§28), accesibilidad (§29), reutilización total de datos/tablas/EAPB (§24-25), sin borrado físico (§21), RLS intacto (§23).

Los puntos que exigen paginación **server-side** (§9, §26) se dejan para una segunda fase si el dataset lo requiere — el prompt lo señala pero la regla §0 pide no duplicar/reconstruir y reutilizar. Lo aviso explícitamente aquí para tu decisión.

## ¿Confirmas?

- **A) Sí, procede con este alcance** (todo frontend, sin migraciones, sin paginación server-side por ahora).
- **B) Añade también paginación server-side vía RPC** (agrega ~1 migración de función SQL + cambio de `useQuery`).
- **C) Ajusta algo antes de arrancar** (dime qué).
