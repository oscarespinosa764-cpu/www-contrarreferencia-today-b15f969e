# Fase 5D · Bloque A — PHD / PAD / O2 / Especiales

## Causa raíz de la discrepancia
- Las tarjetas y la agrupación por etapa del listado leen `r.estado`, pero el ciclo de PHD/PAD/O2 se persiste en `r.estado_ciclo` (nunca sincroniza `estado`).
- El cierre por egreso escribe `estado_ciclo = 'CERRADO POR EGRESO'` pero **no** marca `archivado = true`, por lo que el caso sigue apareciendo en el listado activo (que filtra `archivado = false`), mientras el modal ya lo bloquea como terminal.

## Cambios

### 1. Migración (server-authoritative)
- Función `private.resolver_estado_ciclo_domiciliario(_domi_id uuid)` que devuelve el estado canónico a partir de los seguimientos del ciclo vigente (desde la última reactivación) y de los flags del caso (`requiere_ambulancia`, aceptación, coordinación, egreso, cancelaciones).
- Trigger `AFTER INSERT` en `public.seguimientos` (WHEN `tipo_caso='domiciliario'`) que:
  - Recalcula `estado_ciclo` con la función anterior.
  - Si el nuevo estado es terminal (`CERRADO POR EGRESO` / cancelaciones), setea `archivado = true` y `fecha_cierre = now()`.
  - Si es `CERRADO POR EGRESO`, además setea `fecha_egreso`.
- Backfill idempotente: para cada `domiciliario` con último seguimiento terminal, aplicar `archivado = true` y sincronizar `estado_ciclo`.
- Se conserva `trg_domi_estado_gating` (validación) y `avanzarEstadoCiclo` (compatibilidad); pero el trigger nuevo pasa a ser la fuente de verdad.

### 2. Frontend
- `src/lib/salientes-grupos.ts`: la función de clasificación acepta cualquier campo de estado; el listado de PHD/PAD/O2 pasa `estado_ciclo ?? estado`.
- `src/routes/_authenticated/remisiones.tsx`: `ListaGenerica` con `tipo="phd"` usa `estado_ciclo` para agrupar (5 grupos: Pendiente aceptación / Aceptado sin ambulancia / Ambulancia coordinada / Desistimientos / Otros).
- `src/components/remisiones/caso-generico-card.tsx`: para `tipo="phd"` la etiqueta de estado y el badge muestran `estado_ciclo`.
- `src/components/remisiones/phd-seguimiento-dialog.tsx`: sin cambios de lógica de cierre (ya delega en el server); solo asegurar `invalidateQueries(["domiciliarios"])` tras el cierre (ya presente).

## Verificación
- Ejecutar backfill y confirmar que el caso NELSON OCAMPO ya no aparezca en el listado activo.
- Registrar un nuevo egreso desde el modal y verificar que la tarjeta desaparezca y el estado del modal quede bloqueado.
- Cancelaciones (proveedor / especialidad) archivan el caso igual que el egreso.

## Notas técnicas
- Sin cambios de UI en las tarjetas más allá del campo leído; sin nuevas dependencias.
- La lógica de estado queda del lado del servidor (trigger + función `SECURITY DEFINER` con `search_path = ''`), consistente con el patrón de RI (Bloque B1.2).
