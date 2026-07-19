
# Rediseño — Catálogo y Plantillas

Alcance amplio. Propongo entregarlo en **4 fases** revisables para no malgastar créditos ni desestabilizar el módulo. Confirma qué fases apruebas antes de implementar.

## Inventario reutilizable (verificado)

- Tabla `catalogos` (15 tipos activos, ~372 filas): EAPB (41), IPS (51), ESPECIALIDAD (75), MEDICO (63), EMPRESA_TEP (35), PLACA (58), DEPARTAMENTO (8), MOTIVO_* (24), UNIDAD/UNIDAD_REQUERIDA (8), REGIMEN (6), IPS_LOCAL (2), más el tipo huérfano en minúsculas `ips` (1 fila, se normaliza a IPS).
- Tabla `plantillas` (80 activas) con `indicativo, categoria, subcategoria, nombre, mensaje, pasos, condicion, activo, archivado`.
- Componentes existentes que se reutilizan tal cual: `catalogo-maestras.tsx` (CRUD + detección de duplicados + auditoría) y `plantillas-biblioteca.tsx` (biblioteca con pasos y variables).
- Ruta `/catalogo` con `Tabs` shadcn — se mantiene.
- Auditoría vía `registrar_auditoria` ya integrada — se mantiene append-only.
- Sin nuevas tablas obligatorias en Fase 1 y 2.

## Fase 1 — Shell visual (nuevo encabezado, 5 KPIs, sin tocar CRUD)

Solo presentación en `src/routes/_authenticated/catalogo.tsx`:

- Título "Catálogo y Plantillas" + subtítulo.
- 5 tarjetas KPI reales, calculadas con **una** consulta agregada (no N+1):
  - Categorías activas = `count(distinct tipo) filter (activo)` sobre `catalogos` + agrupador estático de módulos.
  - Catálogos = `count(distinct tipo)` en `catalogos`.
  - Plantillas = `count(*) filter (archivado=false and activo=true)` en `plantillas`.
  - Elementos totales = `count(*) filter (activo)` en `catalogos`.
  - Última actualización = `max(updated_at)` entre `catalogos` y `plantillas`.
- Tarjetas clicables que solo cambian filtros/pestañas actuales (sin modal nuevo).
- Persistencia en URL: `?tab=catalogo|plantillas&modulo=&estado=&q=`.
- Normaliza el tipo huérfano `ips` (minúscula) a `IPS` con un `UPDATE` puntual (no destructivo).

## Fase 2 — Vista por categorías + búsqueda con debounce

Sobre `catalogo-maestras.tsx` (misma tabla, sin migraciones):

- Lista lateral de categorías (12 grupos derivados de `TIPO_META.modulo` + agrupador extendido) con conteo real por tipo.
- Grid central de tarjetas por categoría (icono + nombre + descripción + N catálogos + N elementos).
- Buscador con debounce 400ms sobre `valor/extra1/extra2/tipo`.
- Filtros: módulo, estado (activo/inactivo/todos).
- Al clicar una tarjeta → abre panel lateral (no modal doble) con los elementos del catálogo (ya existe el CRUD, se envuelve).
- Reutiliza el diálogo de creación/edición actual; no se cambia la lógica de duplicados.

## Fase 3 — Modal amplio de categoría con pestañas Catálogos/Elementos/Configuración/Historial

- Un solo modal principal (`max-w-[92vw]`, `h-[82vh]`).
- Pestañas internas; los detalles abren en panel lateral **dentro** del modal.
- "Configuración" muestra el `usadoEn` que ya está en `TIPO_META` (inventario estático, no búsqueda en archivos).
- "Historial de cambios" consume `audit_logs` filtrado por `tabla='catalogos'` + `registro_id`.
- Advertencia de impacto antes de desactivar: motivo obligatorio + auditoría.

## Fase 4 — Plantillas Generales (modal amplio, pestañas Mis/Todas/Compartidas/Eliminadas)

- Reutiliza `plantillas-biblioteca.tsx` completo dentro del mismo modal.
- Pestañas Mis/Todas/Eliminadas derivadas de columnas actuales (`created_by` si existe, `archivado`).
- "Compartidas conmigo" queda como **placeholder deshabilitado** (no hay tabla de sharing y crearla está fuera de alcance sin autorización explícita).
- Vista previa con `aplicarVariables` ya implementado.
- Sin Storage nuevo: las plantillas actuales son texto (`mensaje`), no archivos DOCX/PDF — el prompt pide constructor multi-formato **solo si ya existe**, y no existe, así que se declara explícitamente fuera de alcance.

## Fuera de alcance (declarado, para no gastar créditos)

Estos puntos del prompt requieren tablas y features nuevos que hoy no existen. Los dejo explícitamente pendientes salvo que los autorices por separado:

1. Sistema de sharing de plantillas (tabla `plantilla_permisos`).
2. Editor DOCX/PDF/HTML y Storage privado para archivos binarios.
3. Versionado explícito de plantillas (tabla `plantilla_versiones`).
4. Motor de dependencias dinámicas (tabla `catalogo_dependencias`) — se usa el mapa estático `TIPO_META.usadoEn`.
5. Constructor de formularios.

## Confirmación

Responde **"dale F1"**, **"F1+F2"**, **"todas"** o indica qué fases y qué elementos del fuera-de-alcance quieres incluir. Empiezo apenas confirmes.
