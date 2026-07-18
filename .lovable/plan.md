# Motor híbrido de los 4 indicadores institucionales

## Alcance
Implementar el motor conforme a las decisiones definitivas: **mediciones oficiales importadas de Excel** para Ene–May 2026 + **cálculo automático de conciliación/futuro** desde datos operativos, con numerador/denominador visible por mes seleccionado. **No** se inventan timestamps, **no** se reimportan los 23.004 casos, **no** se sobrescriben mediciones manuales, **no** se modifican módulos fuera del alcance.

## Etapa 1 — Extensión no destructiva de `mediciones_indicadores`
Migración aditiva (sin renombrar ni borrar columnas):
- `tipo_medicion` enum: `MANUAL | MANUAL_HISTORICA_IMPORTADA | AUTOMATICA | AUTOMATICA_CONCILIACION | AJUSTE_MANUAL`.
- `fuente_medicion text` (ej: "FICHA TÉCNICA EXCEL APROBADA", "CÁLCULO AUTOMÁTICO").
- `regla_version text` (versionado del motor, ej. `v1.0`).
- `total_evaluables int`, `total_excluidos int`.
- `resultado_automatico_conciliacion numeric`, `diferencia_conciliacion numeric`.
- `nota_metodologica text`.
- `calculado_at timestamptz`, `calculado_by uuid`.
- `periodo_inicio date`, `periodo_fin date` (si aún no existen; conservar `periodo` actual).
- Índice único idempotente: `(indicador_id, periodo, tipo_medicion, regla_version)`.
- Mantener RLS existente. GRANTs preservados.

Semilla / seed de indicadores oficiales si no existen los 4 (con códigos canónicos IND-01…IND-04, metas y sentido correctos).

## Etapa 2 — Backfill de mediciones oficiales Ene–May 2026
Migración de datos (INSERT idempotente con `ON CONFLICT DO NOTHING`) con los valores aprobados del Excel para los 4 indicadores × 5 meses = **20 filas** `MANUAL_HISTORICA_IMPORTADA`:
- Numerador, denominador, resultado, meta, semáforo, `fuente_medicion = 'FICHA TÉCNICA EXCEL APROBADA'`, `nota_metodologica` cuando aplique (EAPB no retroactiva, timestamps ausentes en Ind 1/2).

Antes de emitir la migración pediré confirmación de la matriz oficial de valores (los reportados en el análisis previo: Ind 4 Ene 180/1489, etc.) para no fijar cifras no verificadas.

## Etapa 3 — Motor de cálculo automático (`indicadores-motor.functions.ts`)
Server functions con `requireSupabaseAuth` + verificación de rol admin/coordinador:

- `calcularIndicador3Conciliacion({periodo})`: lee `historicos_casos` (SALIENTES) del mes, aplica mapeo:
  - REMITIDO → num+den
  - SUSPENDIDO → den
  - GESTIONANDO/ERROR → excluidos
  - Dedupe por `case_id`/documento.
  - Guarda `AUTOMATICA_CONCILIACION` sin tocar la oficial; calcula `diferencia_conciliacion`.

- `calcularIndicador4({periodo})`: ENTRANTES con mapeo:
  - ACEPTADO → num+den; NO ACEPTADO/CANCELADO → den; INGRESADO/AMPLIACION → pendientes (excluidos); N/A → excluidos.
  - Para Ene–May 2026 guarda como `AUTOMATICA_CONCILIACION`; desde primer mes sin oficial guarda como `AUTOMATICA`.

- `calcularIndicador1({periodo})` / `calcularIndicador2({periodo})`: solo se ejecuta si el periodo tiene 100% de casos con timestamps requeridos (`fecha_recepcion`, `fecha_respuesta` / `fecha_aceptacion`). Si no, no escribe nada. Detección automática del **primer periodo evaluable** vía `SELECT min(...)` — no se fija julio 2026.

- `recalcularMes({indicador_id, periodo})`: idempotente, upsert por llave única.

- `conciliarAbril2026Ind4()`: query auxiliar que lista los 2 registros faltantes o explica ausencia (rango fecha, N/A, archivado, duplicados). Genera reporte en `nota_metodologica`.

Regla de negocio: **nunca** sobrescribir `MANUAL` ni `MANUAL_HISTORICA_IMPORTADA`. El resultado principal mostrado en UI = oficial si existe, si no automático.

## Etapa 4 — Snapshot EAPB (solo casos nuevos)
Migración aditiva en `casos_entrantes`, `remisiones`, `referencia_interna`:
- `eapb_contratada_snapshot boolean`, `eapb_snapshot_at timestamptz`, `eapb_snapshot_source text`.
- Trigger `BEFORE INSERT` que copia el estado contractual vigente del catálogo EAPB al momento del registro.
- **No** aplica retroactivamente a Ene–May 2026 (nota metodológica ya guardada en la medición oficial).

## Etapa 5 — Recálculo por evento (asíncrono, no bloqueante)
- No trigger pesado. En los flujos existentes que cierran caso o registran hitos (`seguimientos`, `remisiones` update), invocar `recalcularMes(...)` en `fire-and-forget` desde el server function que ya persiste el evento, envuelto en try/catch para no bloquear.
- Endpoint interno `POST /api/public/hooks/recalcular-indicadores` (cron opcional diario 02:00 vía pg_cron) para conciliar el mes actual.

## Etapa 6 — UI Panel de detalle (extender `src/routes/_authenticated/indicadores.tsx`)
**Conservar todo** lo actual (gráficos, tendencias, ranking, planes, filtros manuales). Agregar al abrir un indicador × mes/año:

- Tres tarjetas grandes: **[ NUMERADOR ] [ DENOMINADOR ] [ RESULTADO ]** con nombre, valor, unidad, cantidad de casos, periodo.
- Banda inferior: operación aplicada, meta, semáforo, `tipo_medicion`, `fuente_medicion`, fecha última actualización.
- Si existe conciliación: bloque "RESULTADO OFICIAL vs AUTOMÁTICO" con diferencia y motivo.
- Casos evaluables / excluidos / pendientes con motivo.
- Nota metodológica (EAPB, timestamps).
- Acciones **VER CASOS EVALUADOS** / **VER CASOS EXCLUIDOS** → server function paginada (page size 50), columnas mínimas (código, fecha, módulo, estado, clasificación, motivo, EAPB, duración). RLS respetada.
- Estado `SIN MEDICIÓN` con causa explícita (ej: "DATOS HISTÓRICOS SIN MARCAS DE TIEMPO SUFICIENTES").

## Etapa 7 — Informe final entregable
Componente `informe-motor-indicadores.tsx` (accesible desde admin) que renderiza las 8 tablas exigidas: A) mediciones históricas, B) conciliación, C) mapeo, D) primer periodo automático por indicador, E) EAPB, F) abril Ind 4, G) interfaz, H) seguridad/alcance.

## Archivos a tocar
- **Nuevos**: `src/lib/indicadores-motor.functions.ts`, `src/lib/indicadores-motor.ts` (helpers puros: mapeos, dedupe, fórmulas), `src/components/coordinacion/indicador-detalle-panel.tsx`, `src/components/coordinacion/informe-motor-indicadores.tsx`, `src/routes/api/public/hooks/recalcular-indicadores.ts`.
- **Extender**: `src/routes/_authenticated/indicadores.tsx` (panel de detalle + botones evaluables/excluidos), `src/lib/indicadores-utils.ts` (helpers de mapeo si aplica). Sin borrar código existente.
- **Migraciones DB**: (1) extensión aditiva de `mediciones_indicadores` + índice único, (2) backfill oficial Ene–May 2026 (idempotente), (3) snapshot EAPB en tablas de casos + trigger, (4) opcional pg_cron.

## Fuera de alcance (explícito)
- No se modifican `historicos_casos`, `remisiones`, `casos_entrantes` en su semántica.
- No se reimportan datos.
- No se toca cuadro de turno, coordinación, red, etc.
- No se cambia UX de indicadores existentes (solo se agrega detalle).

## Preguntas antes de ejecutar
Necesito confirmar dos cosas para no fabricar valores:

1. **Matriz oficial Ene–May 2026** de los 4 indicadores (numerador / denominador / resultado / meta). ¿Reutilizo los valores mencionados en el análisis previo (Ind 4 Ene 180/1489, etc.) o vas a pegar los 20 valores exactos desde el Excel?
2. **Códigos y metas** de los 4 indicadores institucionales: ¿los creo si no existen con `IND-01…IND-04` y las metas del Excel, o ya están sembrados con otro código que deba respetar?

Con eso proceo con la migración de extensión + backfill + motor + UI en el mismo turno.
