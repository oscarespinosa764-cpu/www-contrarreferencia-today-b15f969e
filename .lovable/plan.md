## Alcance y verificación previa

Revisé el código existente:

- `src/components/remisiones/seguimiento-dialog.tsx` (3.573 líneas) — ya contiene `CAMBIO_ESPECIALIDAD` con la mecánica exacta (catálogo, plantilla Índigo, validación, guardado). El nuevo tipo `CAMBIO_UNIDAD` sigue el mismo patrón.
- `src/routes/_authenticated/indicadores.tsx` (614 líneas) + `src/lib/indicadores-utils.ts` (162 líneas) + `src/components/coordinacion/indicadores-datos.tsx` (608 líneas) — el módulo Indicadores ya tiene tarjetas, avance vs meta, tendencia, formularios y captura mensual reales. El rediseño reutiliza estas fuentes de datos.
- Recharts ya está en `package.json` → sin nuevas dependencias.
- Catálogo `UNIDADES_SERVICIOS` ya existe en `catalogos` (mismo usado por el wizard).

No se harán migraciones destructivas ni tablas nuevas. Todo se hace en frontend salvo un helper opcional de agregación.

---

## Bloque A · CAMBIO DE UNIDAD (Salientes → Seguimiento)

Archivos:
- `src/components/remisiones/seguimiento-dialog.tsx` (edición focalizada).

Pasos:
1. Añadir constante `CAMBIO_UNIDAD: "CAMBIO DE UNIDAD"` al mapa `T` (junto a `CAMBIO_ESPECIALIDAD`).
2. Insertar el tipo en la lista renderizada cuando `casoActivo`, justo después de `CAMBIO_ESPECIALIDAD`.
3. Estado local: `nuevaUnidad`, `nuevaCama`, derivar `unidadActual`/`camaActual` del caso vigente (`caso.unidad`, `caso.cama` / metadata equivalente).
4. UI del bloque:
   - Info de solo lectura: "UBICACIÓN ACTUAL DEL PACIENTE" con Unidad y Cama (o "SIN CAMA REGISTRADA").
   - Dropdown "NUEVA UNIDAD" alimentado desde `catalogos` categoría unidades/servicios, filtrado activo, normalizado (upper/trim/sin tildes) para deduplicar.
   - Input "NUEVA CAMA" con normalización (upper, trim, sanitización básica, longitud razonable, requerido).
5. Validación: si `(nuevaUnidad === unidadActual) && (nuevaCama === camaActual)` mostrar toast "NO SE IDENTIFICARON CAMBIOS EN LA UBICACIÓN DEL PACIENTE." y abortar.
6. Plantilla Índigo (auto, editable, botones Regenerar + Copiar reutilizados): texto con/sin cama previa según prompt.
7. Guardado en `handleGuardar`: crear seguimiento con `tipo_seguimiento="CAMBIO DE UNIDAD"`, `detalles: { unidad_anterior, cama_anterior, unidad_nueva, cama_nueva, observaciones, plantilla }`; luego `UPDATE` del caso activo (`unidad`, `cama` / metadata) sin tocar aceptación, IPS receptora ni estado. Auditar como el resto de seguimientos.
8. Reflejo: tarjeta, Ver caso, entrega de turno, PDF y Historial ya leen `caso.unidad`/`cama`; no requiere cambios adicionales.

## Bloque B · Rediseño de INDICADORES

Reutilizo: `Indicador`, `Medicion`, `calcularResultado`, `calcularSemaforo`, `ultimaMedicionPorIndicador`, `historialIndicador`, `avanceContraMeta`, `tendenciaTexto` (todo en `indicadores-utils.ts`). Uso Recharts (ya instalado).

Nuevos archivos (pequeños, para no inflar el route):
- `src/components/indicadores/resumen-cards.tsx` — 5 tarjetas (Activos, En meta, Alerta, Crítico, Sin medición) con mini donut + sparkline.
- `src/components/indicadores/desempeno-general.tsx` — 3 gráficas Recharts: donut de cumplimiento (con % general al centro), línea de tendencia agregada por mes, donut por estado.
- `src/components/indicadores/ranking-indicadores.tsx` — tabla/lista clickeable, orden por defecto Crítico→Alerta→Sin medición→En meta, con orden alternativo.
- `src/components/indicadores/indicador-detalle-modal.tsx` — modal responsivo con 4 KPIs (Cumplimiento, Meta, Resultado, Tendencia con sentido), gráfica evolución (line), gráfica resultado vs meta (bar + ref line), bloque Detalle técnico ("NO CONFIGURADO" cuando falte) e historial paginado.
- `src/components/indicadores/filtros-panel.tsx` — botón compacto "Filtrar" que despliega Popover con fecha inicial/final, turno, área, responsable, estado, frecuencia, tipo + Limpiar. Buscador con debounce 250 ms.

Refactor de `src/routes/_authenticated/indicadores.tsx`:
- Sustituye tarjetas actuales por `<ResumenCards>` + `<DesempenoGeneral>` + `<RankingIndicadores>`.
- Estado central `{ filtros, busqueda, indicadorAbierto }`.
- Conserva "Nuevo indicador", edición, archivar y "Captura mensual" para roles autorizados.
- Todos los cálculos se derivan de `indicadores` y `mediciones` reales ya consultadas (sin hardcode). Cumplimiento general = promedio del cumplimiento individual de indicadores activos con medición vigente (fórmula documentada en un comentario). División por cero protegida.

Sentido de mejora respeta `sentido` del indicador (MAYOR/MENOR es mejor). Sin datos → "SIN MEDICIÓN" y "SIN TENDENCIA SUFICIENTE PARA EL PERIODO SELECCIONADO." donde aplique.

## Fuera de alcance (no se toca)
Rutas, roles, RLS, otros módulos, migraciones, catálogos, notificaciones, importaciones/exportaciones actuales.

## Verificación
- `tsgo --noEmit`.
- Recorrido manual (Playwright headless) del route `/indicadores` verificando 5 tarjetas y apertura de modal.
- Recorrido del modal de seguimiento eligiendo "CAMBIO DE UNIDAD" y guardando.

## Nota sobre créditos
El cambio es grande pero focalizado: 1 edición al diálogo de seguimiento + 5 componentes nuevos pequeños + reescritura del route de indicadores. Sin nuevas dependencias, sin migraciones, sin duplicar catálogos.

¿Confirmas para proceder con la implementación tal como está descrita?