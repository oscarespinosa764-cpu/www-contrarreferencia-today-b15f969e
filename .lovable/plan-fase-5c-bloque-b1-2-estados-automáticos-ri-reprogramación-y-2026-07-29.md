# FASE 5C — BLOQUE B1.2: Estados automáticos RI, Reprogramación y Cancelación estructurada

## Alcance
Implementar en Referencias Internas una **única fuente canónica de estado automático** que gobierne modal, listado activo, detalle, historial y auditoría. Incorporar:
- Cuadro de estado (solo lectura) en el modal de seguimiento.
- Segmentación del listado activo en 4 grupos.
- Casilla "SIN NUEVA FECHA Y HORA DEFINIDA" en Reprogramación.
- Reubicación de "NO ACEPTACIÓN DEL PACIENTE/FAMILIAR" desde NOVEDADES hacia CANCELACIÓN.
- Motivos estructurados de cancelación con validación server-side.
- Atomicidad de todas las transiciones.

**Fuera de alcance:** BLOQUE B2 (unidad/cama atómico), Salientes, Modo Práctica, ampliación de permisos.

## Estados canónicos activos

| Código | Label visible | Paso principal siguiente |
| --- | --- | --- |
| `PENDIENTE_COORDINACION` | PENDIENTE COORDINACIÓN | TRÁMITE COORDINADO |
| `TRAMITE_COORDINADO_SIN_CONFIRMACION_AMBULANCIA` | TRÁMITE COORDINADO SIN CONFIRMACIÓN AMBULANCIA | CONFIRMACIÓN PROGRAMACIÓN DE AMBULANCIA |
| `AMBULANCIA_PROGRAMADA` | AMBULANCIA PROGRAMADA | CONFIRMACIÓN LLEGADA DE AMBULANCIA |
| `AMBULANCIA_EN_SITIO_PTE_CONFIRMACION_REINGRESO` | AMBULANCIA EN SITIO // PTE CONFIRMACIÓN REINGRESO | CIERRE POR CULMINACIÓN DE SOLICITUD |

Terminales existentes de RI se conservan (cierre por culminación / cancelación).

## Matriz de transiciones

| Evento | Estado resultante |
| --- | --- |
| Caso creado | PENDIENTE_COORDINACION |
| TRÁMITE COORDINADO | TRAMITE_COORDINADO_SIN_CONFIRMACION_AMBULANCIA |
| CONFIRMACIÓN PROGRAMACIÓN AMBULANCIA | AMBULANCIA_PROGRAMADA |
| CONFIRMACIÓN LLEGADA AMBULANCIA (con firma vigente) | AMBULANCIA_EN_SITIO_PTE_CONFIRMACION_REINGRESO |
| CIERRE POR CULMINACIÓN | terminal existente |
| Reprogramación con fecha | TRAMITE_COORDINADO_SIN_CONFIRMACION_AMBULANCIA |
| Reprogramación SIN fecha | PENDIENTE_COORDINACION |
| Ambulancia sin disponibilidad | TRAMITE_COORDINADO_SIN_CONFIRMACION_AMBULANCIA |
| Descompensación hemodinámica | PENDIENTE_COORDINACION (ya implementado en B3.1) |
| Cancelación (cualquier motivo) | terminal cancelación existente |
| CAMBIO DE UNIDAD, OTRO, EQUIPO FALLA, NO TÉCNICO, RED NO CONTRATADA | conserva estado |

## Cambios server-side (una migración)
1. **Columna canónica de estado RI**: reutilizar `referencia_interna.estado` (ya existe). Añadir CHECK/allowlist de los 4 estados activos + terminales existentes.
2. **Función `private.ri_estado_resultante(_caso_id, _tipo_seguimiento, _detalles)`**: mapa canónico único que devuelve `{ estado_anterior, estado_resultante }` según el evento y payload validado.
3. **RPC atómico `public.registrar_seguimiento_ri(_caso_id, _tipo_seguimiento, _detalles, _observaciones, _plantilla)`**: bloquea la fila, valida secuencia (`ri_paso_permitido`), valida detalles (allowlist), inserta seguimiento, actualiza `estado`, invalida programación/fecha vigente cuando corresponde, registra auditoría. `EXECUTE` revocado a anon/authenticated (solo `service_role`).
4. **Actualizar trigger `private.seguimientos_ri_novedades_validate`**:
   - Retirar `NO_ACEPTACION_PACIENTE_FAMILIAR` de NOVEDADES EXTERNA para creación nueva (aceptar en históricos ya persistidos vía comprobación de `TG_OP='INSERT'` + timestamp).
   - Añadir campos `sin_nueva_fecha_hora` (bool) y `fecha_hora_reprogramada` (nullable) con mutua exclusión.
   - Motivos de reprogramación: `RETRASO_AGENDA`, `IMPOSIBILIDAD_TOMA_POR_EXAMEN_PREVIO` (obligatorio ≥1).
5. **Extender allowlist de cancelación**: `cancelacion_motivo_codigo ∈ {NO_ACEPTACION_PACIENTE_FAMILIAR, OTRO}`, `paciente_familiar_motivo ∈ {ADULTO_MAYOR_SIN_ACOMPANANTE, FAMILIAR_NO_PERMITE_TRASLADO}`, `cancelacion_otro_motivo` string (trim, 3..500). Mutua exclusión validada.
6. **Backfill idempotente** para casos activos RI: aplicar regla determinística (llegada > programación > trámite > pendiente) considerando el último reinicio (descompensación / reprogramación sin fecha). Casos ambiguos → estado no se sobreescribe, se registra en `audit_logs` como `RI_BACKFILL_MANUAL`.

## Cambios frontend (mínimos)

| Archivo | Cambio |
| --- | --- |
| `src/lib/ri-estados.ts` **(nuevo)** | Constantes de códigos, labels, descripciones, orden de grupos, mapa cliente-side para presentación (fuente = server). |
| `src/lib/ri-seguimientos.functions.ts` **(nuevo)** | Wrapper `createServerFn` con `requireSupabaseAuth` que valida input Zod y llama al RPC atómico vía `supabaseAdmin`. |
| `src/components/remisiones/seguimiento-dialog.tsx` | (a) Insertar bloque solo lectura "ESTADO DEL CASO (AUTOMÁTICO)" entre radicado y tipo de seguimiento. (b) Retirar `NO_ACEPTACION` de NOVEDADES EXTERNA. (c) Añadir sub-formulario Reprogramación con casilla "SIN NUEVA FECHA Y HORA DEFINIDA" (oculta el datetime). (d) Añadir sub-formulario Cancelación con selector estructurado. (e) Enrutar el guardado de RI al nuevo server fn. (f) Generar plantillas Índigo actualizadas. |
| `src/routes/_authenticated/remisiones.tsx` | Segmentar sección RI activa en 4 grupos reutilizando `GrupoEtapa`. Usar los códigos canónicos del `estado`. |
| `src/components/remisiones/grupo-etapa.tsx` | Sin cambios estructurales (ya reutilizable). |

## Query invalidations
Tras cada transición invalidar: `referencia-interna-detalle`, `referencia-interna-activos`, `referencia-interna-seguimientos`, `ri-estado`, `historial-ri` (cuando terminal). No tocar Salientes, Control de Mando ni turno.

## Plantillas
- Reprogramación con/sin fecha, Cancelación por No aceptación / Otro motivo, Ambulancia sin disponibilidad: textos exactos según especificación.
- Descompensación y OTRO: no se modifican.

## Roles
Toda la funcionalidad reutiliza permisos actuales RI. Sin ampliación de permisos.

| Funcionalidad | Admin | Operativa | Temporal | Inactivo | Anon |
| --- | --- | --- | --- | --- | --- |
| Ver estado automático | VISIBLE Y UTILIZABLE | VISIBLE Y UTILIZABLE | VISIBLE Y UTILIZABLE | BLOQUEADO | BLOQUEADO |
| Editar estado directo | OCULTO | OCULTO | OCULTO | BLOQUEADO | BLOQUEADO |
| Registrar transiciones | VISIBLE Y UTILIZABLE (según alcance) | VISIBLE Y UTILIZABLE (según alcance) | VISIBLE Y UTILIZABLE (según alcance) | BLOQUEADO | BLOQUEADO |
| Ver segmentación | VISIBLE Y UTILIZABLE | VISIBLE Y UTILIZABLE | VISIBLE Y UTILIZABLE | BLOQUEADO | BLOQUEADO |

## Pruebas
Verificar build/typecheck limpios y security scan sin nuevos hallazgos. Pruebas manuales de las 98 pruebas del prompt se marcarán como REQUIERE INTERVENCIÓN MANUAL para los flujos que exijan sesión operativa/temporal reales.

## Entrega
Al terminar: **BLOQUE B1.2 COMPLETO — ESTADOS, REPROGRAMACIÓN Y CANCELACIÓN LISTOS PARA PRUEBAS MANUALES**. B2 permanece pendiente.
