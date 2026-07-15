# Auditoría y corrección de plantillas / importadores / exportadores

## Alcance
Ajustar únicamente la compatibilidad **plantilla vacía ↔ importador ↔ exportación reimportable** dentro de cada módulo, sin rediseños, sin plantilla universal, sin tocar reportes institucionales.

## 1. Matriz de auditoría (estado actual detectado)

| Módulo | Plantilla | Importador | Exportación reimportable | Estado |
|---|---|---|---|---|
| Remisiones salientes | `columnasDe("remisiones")` en `importar-dialog.tsx` | `importarMasivo` destino `remisiones` (whitelist 29 cols) | Mismo destino → OK | ✅ Coincide |
| PHD/PAD/O2/Especiales | destino `domiciliarios` | idem | idem | ✅ Coincide |
| Referencias Internas | destino `referencia_interna` | idem | idem | ✅ Coincide |
| Pendientes | destino `pendientes` | idem | idem | ✅ Coincide |
| Red/Disponibilidad (flat) | destino `red_operativa` | idem | idem | ✅ Coincide (multi-hoja usa `importar-red-dialog` aparte) |
| Red/Disponibilidad (multi-hoja) | `importar-red-dialog` + `importar-red.functions` | idem | Export multi-hoja separado | Revisar ida/vuelta |
| Históricos Entrantes | destino `historicos_entrante` | idem, `fijos.seccion="entrante"` | Mismo → OK | ✅ |
| Históricos Salientes | destino `historicos_saliente` | idem | Mismo → OK | ✅ |
| Catálogos | destino `catalogos` | idem | idem | ✅ |
| Plantillas textuales | destino `plantillas` | idem | idem | ✅ |
| Cuadro de Turno TH-FR-10 | `exportarPlantillaCuadro` / `exportarCuadroMensual` / `importarCuadroExcel` | Reutilizan mismo builder (`construirLibro`) con `incluirDatos` bool | ✅ Coincide, TH-FR-10 preservado |
| Ausentismo TH-FR-48 | `exportarAusentismoTH48` (reporte institucional) | Sin importador reimportable | Reporte institucional → **no** debe ser reimportable | ✅ Correcto (etiquetar) |
| Solicitudes turno (TH-FR-09) | PDF individual (`solicitud-pdf`) | Sin importador | Documento institucional | ✅ Correcto |
| Indicadores (mediciones) | Sin plantilla dedicada | Sin importador dedicado | Reporte ejecutivo | ⚠️ Falta plantilla + importador reimportable |

## 2. Correcciones puntuales

### A. Añadir hoja oculta `METADATOS` (template_id + version) a plantillas y exportaciones reimportables
Modificar `columnasDe()` + generadores para inyectar metadatos por destino en `src/lib/importar.functions.ts` y `src/components/coordinacion/importar-dialog.tsx`. Cada destino recibe `template_id` distinto: `REMISIONES_V1`, `DOMICILIARIOS_V1`, `REFERENCIAS_INTERNAS_V1`, `PENDIENTES_V1`, `RED_OPERATIVA_V1`, `HISTORICOS_ENTRANTE_V1`, `HISTORICOS_SALIENTE_V1`, `CATALOGOS_V1`, `PLANTILLAS_V1`.

### B. Detección de módulo al importar
En `importar-dialog.tsx`, al cargar archivo leer hoja `METADATOS`; si `template_id` no corresponde al destino actual, bloquear con mensaje: *"El archivo seleccionado corresponde a [X] y no puede importarse en [Y]."*

Compatibilidad hacia atrás: si no hay `METADATOS`, seguir el flujo actual (validación por encabezados).

### C. Mensaje "sin registros" en exportación
En `exportarDatos()` de `importar-dialog.tsx`: si `res.filas.length === 0`, mostrar toast `"No hay registros para exportar."` y no generar archivo.

### D. Nombres de archivo consistentes
- Plantilla: `PLANTILLA_[MODULO]_V[N].xlsx`
- Export reimportable: `[MODULO]_DATOS_[YYYY-MM-DD].xlsx`
(Cuadro de Turno TH-FR-10 y TH-FR-48 conservan nombre institucional actual.)

### E. Añadir plantilla + importador/exportador reimportable para Mediciones de Indicadores
Nuevo destino `mediciones_indicadores` en `DESTINOS` con columnas: `indicador_id, codigo, nombre, periodo, fecha, numerador, denominador, resultado, meta, unidad, responsable, observaciones, estado`. Sin tocar el panel ejecutivo.

## 3. Fuera de alcance (NO se toca)
Rutas, menú, roles, RLS, autenticación, reportes PDF, TH-FR-10/48/09 (formato institucional), plantillas Índigo, oficios, alertas, avisos, notificaciones externas, Reporte General Operativo Salientes, Entrega de Turno, colores, layout.

## 4. Archivos a modificar
- `src/lib/importar.functions.ts` — añadir `template_id`/`version` por destino; helper `metadatosDe()`; añadir destino `mediciones_indicadores`.
- `src/components/coordinacion/importar-dialog.tsx` — inyectar hoja `METADATOS` en plantilla y export; leer `METADATOS` al importar y validar `template_id`; toast "sin registros"; nombres de archivo estandarizados.
- (Opcional, si aplica) `src/components/coordinacion/importar-red-dialog.tsx` — mismo tratamiento de `METADATOS` para el flujo multi-hoja.

## 5. Pruebas round-trip
Descargar plantilla → llenar 2 filas → importar → exportar → reimportar por cada destino. Cargar plantilla de Entrantes en Salientes → debe bloquear con mensaje de módulo.

---
**Créditos**: cambio mínimo, reutilizando `DESTINOS`, `importarMasivo` y `exportarMasivo`. Sin migraciones, sin nuevas librerías, sin refactor.

¿Apruebo y ejecuto?
