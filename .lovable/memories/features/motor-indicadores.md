---
name: Motor híbrido de indicadores institucionales
description: Snapshot EAPB, motor de cálculo automático, conciliación oficial vs automática y cron mensual para IND-INST-01..04.
type: feature
---

- 4 indicadores institucionales (IND-INST-01..04) creados; mediciones oficiales Ene–May 2026 cargadas como `MANUAL_HISTORICA_IMPORTADA` (Excel).
- Snapshot EAPB: `casos_entrantes.eapb_contratada_snapshot` / `remisiones.eapb_contratada_snapshot` se setean en INSERT vía trigger `set_eapb_snapshot` consultando `catalogos` (tipo=EAPB, activo). Solo aplica a casos nuevos; históricos quedan NULL y se incluyen por defecto en el denominador.
- Motor: `public.calcular_indicadores_mes(_year, _month)` (SECURITY DEFINER, EXECUTE solo a service_role).
  - Ind 3: `remisiones.estado` REMITIDO=aceptado; SUSPENDIDO/CANCELADO/NEGADO/RECHAZADO=no aceptado.
  - Ind 4: `casos_entrantes.estado` con ACEPT/INGRES=aceptado, excluye CANCEL/NEGAD/SUSPEND; filtra EAPB contratada al ingreso (o snapshot NULL para históricos).
  - Ind 1 y 2: solo si hay casos con timestamps reales (recepción/primera respuesta; fecha_inicio/fecha_radicado). Sin datos, no se crea medición.
  - Si ya existe MANUAL_HISTORICA_IMPORTADA del mismo periodo, la automática se guarda como `AUTOMATICA_CONCILIACION` (nunca reemplaza la oficial).
- Cron `calcular-indicadores-mensual` (día 2, 03:00 UTC) recalcula el mes anterior.
- Endpoint manual: `POST /api/public/hooks/calcular-indicadores?year=YYYY&month=M` con header `apikey`.
- UI: `IndicadorDetalleModal` incluye `NumDenPanel` que muestra Numerador/Denominador/Resultado/Tipo del periodo actual y, si coexisten oficial+automática, el bloque de conciliación con diferencia y nota metodológica.
