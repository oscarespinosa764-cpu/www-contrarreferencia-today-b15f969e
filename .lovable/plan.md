
# Dashboard Operativo Salientes — Agrupación por etapas + Entrega documental (QR/Portada/Acta/Índigo)

Alcance limitado: NO tocar máquina de estados, RLS, indicadores, historial ni otros módulos. Reutilizar catálogos, checklists, plantillas, firma QR y auditoría existentes.

## Parte A — Organización visual por etapas

Se agregan encabezados de grupo (sticky, colapsables, con contador) sobre las listas ya existentes en `remisiones.tsx`. La agrupación es **derivada** del estado + trazabilidad, no cambia datos.

Reglas de clasificación (server-safe, calculadas en cliente sobre lo ya cargado):

**Remisiones** (5 grupos)
1. `PENDIENTE DE ACEPTACIÓN` — estado ∈ {PENDIENTE_ACEPTACION, EN_GESTION, PENDIENTE_RESPUESTA}
2. `ACEPTADO — PENDIENTE COORDINACIÓN DE AMBULANCIA` — aceptado y `ultimaAsignacionAmbulanciaVigente(caso) == null`
3. `ACEPTADO — AMBULANCIA COORDINADA` — aceptado y asignación vigente (no cancelada/reemplazada) y sin egreso
4. `EGRESADO — PENDIENTE CONFIRMACIÓN DE LLEGADA A IPS RECEPTORA` — con evento EGRESO y sin LLEGADA
5. `FINALIZADOS` (colapsado por defecto) — LLEGADA_CONFIRMADA o cierre.

**PHD/PAD/O2/Especiales** (5 grupos)
1. Pendiente de aceptación
2. Aceptado — pendiente egreso (no requiere ambulancia)
3. Aceptado — pendiente coordinación de ambulancia
4. Ambulancia coordinada — pendiente egreso
5. Cerrados

**Referencias Internas** (4 grupos)
1. Pendiente de coordinación
2. Coordinado — pendiente realización
3. Pendiente de finalización
4. Finalizados

Detalles:
- Nuevo helper `src/lib/salientes-grupos.ts`: funciones puras `clasificarRemision(caso, seguimientos)`, `clasificarPHD`, `clasificarRI` + tipo `GrupoId`. Reutiliza `neg-crue.ts`/`remisiones-utils.ts`; lee empresa/ambulancia vigente desde `seguimientos` estructurados (tipo `AMBULANCIA_COORDINADA` no cancelada) y no de texto libre.
- Nuevo componente `src/components/remisiones/grupo-etapa.tsx`: encabezado con icono, título, descripción, contador y toggle expand/collapse. Sin dependencia de color; sticky en desktop.
- Modificar `src/routes/_authenticated/remisiones.tsx` para envolver cada pestaña con los grupos. Aplica filtros primero, luego agrupa; contadores post-filtro.
- Casos inconsistentes → sección `REVISAR CLASIFICACIÓN` visible solo si rol admin/coordinador.

## Parte B — Entrega documental / Firma QR / Portada / Acta / Índigo

### B1. Empresa de ambulancia (bug de "no hay empresa")
- Añadir en `src/lib/remisiones-utils.ts` (o helper nuevo) `getEmpresaAmbulanciaVigente(caso, seguimientos)` con prioridad: (1) asignación activa, (2) último seguimiento `AMBULANCIA_COORDINADA` no cancelado, (3) TEP vinculado, (4) snapshot. Excluye cancelados/rechazados.
- `entrega-documental-dialog.tsx` consume ese helper (no busca en texto libre). Si no hay → mensaje + botón "IR AL SEGUIMIENTO DE AMBULANCIA" y QR deshabilitado.

### B2. Modal inicial (mínimo)
Campos: Empresa (auto, RO) · IPS (auto, RO) · Nombre acepta* · Cargo acepta* · Fecha/hora (auto RO) · Tipo origen* · Checklist (Entregado/No entregado/No aplica) · Botón "Generar QR de firma".
- Eliminar del modal inicial: campos de tripulante/cargo, botón Portada, botón Acta, plantilla Índigo, botón X por ítem, "Agregar documento" en lista maestra, y el bloque duplicado inferior "ENTREGA SEGURA (EPS)".
- Mantener bloque separado `DOCUMENTOS ADICIONALES DE ESTA ENTREGA` (no toca lista maestra).
- Uppercase forzado en Nombre/Cargo acepta.

### B3. Checklist (una sola representación)
- El `ChecklistRunner` es la única lista visible. Radio-tri por ítem: ENTREGADO / NO ENTREGADO / NO APLICA (extender `checklist-runner.tsx`, respetando su versión y guardado). No permite eliminar/editar/agregar ítems maestros.

### B4. Página pública QR (`/firma-entrega`)
Campos rediseñados (obligatorios en MAYÚSCULAS):
- Nombre y apellido del RESPONSABLE DEL TRASLADO*
- Cargo del responsable del traslado*
- ¿La persona responsable es la misma que firma? SÍ / NO (radio)
  - Si NO → Nombre y apellido de quien firma* + Cargo de quien firma*
- Empresa de ambulancia (prellenada RO) + acción "Reportar empresa diferente" (guarda `empresa_declarada` + motivo, no sobrescribe)
- Tipo de ambulancia* (select desde catálogo `TIPO_AMBULANCIA`)
- Teléfono de contacto* (obligatorio, validar formato)
- Firma* + declaración
- **Eliminar** campo "Documento o identificación laboral"
- En "Documentos entregados" solo mostrar los marcados ENTREGADO.

### B5. Persistencia firma
Extender `entrega_firmas` (nueva migración additive, no destructiva) con columnas:
- `responsable_nombre`, `responsable_cargo`
- `firmante_es_responsable boolean`
- `firmante_telefono` (ya existía; hacer obligatorio en payload)
- `tipo_ambulancia`
- `empresa_declarada`, `empresa_declarada_motivo` (opcionales)
- Quitar uso de `firmante_documento` en nuevas firmas (columna se conserva).

Ajustar `entrega-firma.functions.ts` handler `firmarEntrega`:
- Validar nuevos campos con Zod.
- Rate-limit ya existente; token único uso; auditoría.

### B6. Post-firma
- El modal secundario (dialog de entrega) muestra "FIRMA RECIBIDA" con resumen y aparecen botones **Portada** y **Acta** (vista previa + descarga bajo demanda, no persistidos).
- Portada usa RESPONSABLE (no firmante); Acta incluye responsable + firmante + misma-persona sí/no + empresa + tipo + teléfono + docs (entregado/no entregado/no aplica) + versión checklist/plantilla + código.
- Extender `entrega-firma-pdf.ts` para ambos documentos (reutilizar generador actual).

### B7. Cierre y Plantilla Índigo
- Al cerrar modal de entrega, volver al modal de Seguimiento con datos preservados.
- En Seguimiento aparece la sección "Plantilla para Índigo" (usando `generarPlantillaIndigoCorta` extendida) sólo cuando la entrega esté FIRMADA; con botones Copiar y Registrar seguimiento (no auto-registrar).

## Cambios de archivos
- **Nuevo**: `src/lib/salientes-grupos.ts`, `src/components/remisiones/grupo-etapa.tsx`.
- **Modificar**: `src/routes/_authenticated/remisiones.tsx`, `src/components/remisiones/entrega-documental-dialog.tsx`, `src/components/remisiones/seguimiento-dialog.tsx`, `src/components/remisiones/phd-ciclo-panel.tsx`, `src/components/coordinacion/checklist-runner.tsx`, `src/lib/entrega-documental.ts`, `src/lib/entrega-firma.functions.ts`, `src/routes/firma-entrega.tsx`, `src/lib/entrega-firma-pdf.ts`, `src/lib/remisiones-utils.ts`.
- **Migración**: ADD COLUMNS a `entrega_firmas` (idempotente); sin cambios en RLS existentes (mantiene fail-closed).

## Fuera de alcance (no tocar)
Historial, indicadores, cuadro de turno, catálogos maestros, reglas/alertas/avisos, usuarios/auth, autenticación admin/service_role, otros módulos.

## Pruebas
Ejecutar `tsgo --noEmit` al final y validar visualmente con Playwright los 5 grupos de Remisiones y el flujo QR completo (responsable ≠ firmante).

---
Este es un cambio grande (≈10 archivos + 1 migración). ¿Apruebas para implementar en una sola pasada?
