# FASE 5C · Bloque B3 — OTRO y NOVEDADES (Referencias Internas)

Alcance estricto: solo agregar los tipos permanentes **OTRO** y **NOVEDADES** al selector de seguimientos de RI, con formularios estructurados, persistencia en `seguimientos.detalles`, plantilla Índigo, y transiciones de etapa **solo** cuando el prompt lo exige.

Se **no** implementa B2 (Hospitalización, Quirófano, persistencia unidad/cama, transacción de Cambio de Unidad).

---

## 1. Disponibilidad (matriz etapa × opción)

| Etapa RI | Paso B1 | Cancelación | Cambio unidad | OTRO | NOVEDADES |
|---|---|---|---|---|---|
| Inicial | Trámite coordinado | ✓ | ✓ | ✓ | ✓ |
| Tras trámite | Prog. ambulancia | ✓ | ✓ | ✓ | ✓ |
| Tras programación | Llegada ambulancia | ✓ | ✓ | ✓ | ✓ |
| Tras llegada | Cierre culminación | ✓ | ✓ | ✓ | ✓ |
| Terminal | — | — | — | — | — |

Todas las opciones desaparecen si el caso está archivado/terminal. El servidor vuelve a validar en el registro.

## 2. Tipos y códigos técnicos

Se agregan a `TI` en `seguimiento-dialog.tsx`:

- `TI.OTRO = "OTRO_RI"` (label visible `OTRO`)
- `TI.NOVEDADES = "NOVEDADES_RI"` (label visible `NOVEDADES`)

Códigos internos (allowlist en cliente y en `private.ri_paso_permitido` extendido):

- Categorías: `INTERNA`, `EXTERNA`
- Internas: `EQUIPO_FALLA`, `REPROGRAMACION`, `DESCOMPENSACION_HEMODINAMICA`, `NO_DISPONIBILIDAD_TECNICO`
- Reprogramación motivos: `RETRASO_AGENDA`, `IMPOSIBILIDAD_TOMA_EXAMEN_PREVIO`
- Externas: `AMBULANCIA_SIN_DISPONIBILIDAD`, `RED_NO_CONTRATADA`, `NO_ACEPTACION_PACIENTE_FAMILIAR`
- Paciente/familiar motivos: `ADULTO_MAYOR_SIN_ACOMPANANTE`, `FAMILIAR_NO_PERMITE_TRASLADO`

## 3. Formulario OTRO

- Campo `¿CUÁL?` obligatorio (trim, 3–200 chars).
- Campo `OBSERVACIONES` opcional (≤ 1000 chars).
- Plantilla:
  ```
  SE DEJA TRAZABILIDAD DE SEGUIMIENTO REALIZADO POR REFERENCIA Y CONTRARREFERENCIA.
  TIPO DE SEGUIMIENTO: {cual}
  OBSERVACIONES: {obs}   ← solo si hay texto
  ```
- Persistencia en `seguimientos.detalles`:
  ```json
  { "ri_evento": "OTRO", "cual": "...", "observaciones": "..." }
  ```
- **No** cambia estado ni etapa del caso. Inserta solo `seguimientos`.

## 4. Formulario NOVEDADES

Casillas `INTERNAS` y `EXTERNAS` (≥1 obligatoria). Ambas admitidas.

- Si INTERNAS ⇒ select obligatorio `interna_codigo`.
  - Si `REPROGRAMACION` ⇒ subformulario con casillas `RETRASO_AGENDA` y/o `IMPOSIBILIDAD_TOMA_EXAMEN_PREVIO` (≥1) y `AppDateTimeInput` opcional para nueva fecha/hora.
- Si EXTERNAS ⇒ select obligatorio `externa_codigo`.
  - Si `NO_ACEPTACION_PACIENTE_FAMILIAR` ⇒ select obligatorio `paciente_familiar_motivo` (2 opciones).
- Campo `OBSERVACIONES` opcional (≤ 1000).

Persistencia en `seguimientos.detalles`:
```json
{
  "ri_evento": "NOVEDADES",
  "categorias": ["INTERNA","EXTERNA"],
  "interna_codigo": "REPROGRAMACION",
  "reprogramacion_motivos": ["RETRASO_AGENDA"],
  "fecha_hora_reprogramada": "2026-08-01T14:30:00.000Z" | null,
  "externa_codigo": "AMBULANCIA_SIN_DISPONIBILIDAD",
  "paciente_familiar_motivo": null,
  "observaciones": "...",
  "etapa_anterior": "PROG_AMB",
  "etapa_posterior": "PROG_AMB_PENDIENTE"
}
```

## 5. Reglas de transición server-side

Se reciben en `registrarSeguimientoRI` (server fn nueva, con `requireSupabaseAuth`) que ejecuta INSERT + UPDATE atómico vía RPC `private.registrar_novedad_ri`.

| Combinación | Efecto sobre RI |
|---|---|
| OTRO | Solo `seguimientos`. Sin cambios |
| Internas ≠ REPROGRAMACION (solas) | Solo `seguimientos`. Sin cambios |
| REPROGRAMACION **con fecha** | `referencia_interna.fecha_examen/hora_examen ← nueva`. Invalida programación vigente de ambulancia (marca prog. anterior como histórica insertando entrada). Deja pendiente `CONFIRMACION_PROG_AMB`. Trámite Coordinado se preserva. |
| REPROGRAMACION **sin fecha** | Retira fecha vigente del examen (`NULL`). Invalida programación de ambulancia vigente. Regresa la secuencia a `TRÁMITE COORDINADO` (borrando la marca de "coordinado" mediante seguimiento explícito de reversión). Conserva histórico. |
| Externa AMBULANCIA_SIN_DISPONIBILIDAD | Invalida programación de ambulancia. Conserva Trámite y fecha del examen. Deja pendiente `CONFIRMACION_PROG_AMB`. |
| Externa RED_NO_CONTRATADA | Solo trazabilidad. |
| Externa NO_ACEPTACION_PACIENTE_FAMILIAR | Solo trazabilidad. **No** cancela el caso. |
| Combinado interno + externo | Un único seguimiento; se aplica la transición más "temprana" (regreso a Trámite prevalece sobre pendiente Programación). |

Invalidación de programación de ambulancia = insertar seguimiento `NOVEDADES_RI` con `programacion_invalidada = true` en `detalles`. No se borra el seguimiento previo `PROG_AMB`; el resolver ya usa el más reciente para calcular etapa.

## 6. Consumidor de "programación vigente" y "fecha vigente"

Actualmente `siguientePasoRI` mira el último `tipo_seguimiento` distinto de `CAMBIO DE UNIDAD`. Se extiende para ignorar además cualquier `NOVEDADES_RI` que **no** invalide, y para detectar dos marcadores nuevos:

- `NOVEDADES_RI` con `detalles.regresa_tramite=true` ⇒ próximo paso = `PROG_AMB`; el sistema considera que sigue pendiente porque el trámite ya se hizo (se preserva `PENDIENTE_COORDINACION` anterior).
- `NOVEDADES_RI` con `detalles.reabrir_prog_amb=true` ⇒ próximo paso = `PROG_AMB`.

Se agrega helper `computarEtapaRI(historial)` compartido por selector y servidor.

## 7. Migración SQL mínima

Una sola migración:

1. Extiende `private.ri_paso_permitido` para permitir `OTRO_RI` y `NOVEDADES_RI` en cualquier momento mientras el caso no esté terminal.
2. Crea `private.registrar_novedad_ri(_caso uuid, _payload jsonb)` (SECURITY DEFINER, `search_path=''`) que:
   - Valida sesión (`auth.uid()` no nulo, `private.is_active_member`).
   - Valida caso no archivado / no terminal.
   - Valida allowlist estricta del payload.
   - Inserta `seguimientos` con `detalles` saneado.
   - Aplica UPDATE de `referencia_interna.fecha_examen/hora_examen` cuando la regla lo pide.
   - Registra `audit_logs` vía `registrar_auditoria_srv`.
   - Todo en una única transacción (bloque `BEGIN…END` implícito del bloque plpgsql).
3. `GRANT EXECUTE ... TO authenticated` sobre wrapper público `public.registrar_novedad_ri` que delega a la privada.

Sin nuevas tablas. Sin backfill. Idempotente (usa `CREATE OR REPLACE FUNCTION`).

## 8. Frontend

Archivo principal: `src/components/remisiones/seguimiento-dialog.tsx`.

- Extender `TI`, `TI_LABEL`, `labelTipoSeg`, y `TIPOS_INTERNA_DYN` (agrega `TI.OTRO` y `TI.NOVEDADES` cuando caso activo).
- Estados nuevos: `otroCualRi`, `novRiCategorias`, `novRiInterna`, `novRiReproMotivos`, `novRiReproFecha`, `novRiReproHora`, `novRiExterna`, `novRiPacFam`, `novRiObs`.
- Bloques de UI: se extraen dos subcomponentes locales para no inflar el archivo:
  - `RiOtroFields` (nuevo archivo `src/components/remisiones/ri-otro-fields.tsx`)
  - `RiNovedadesFields` (nuevo archivo `src/components/remisiones/ri-novedades-fields.tsx`)
- Plantilla Índigo: nueva rama en el `switch (tipoSeg)` para `TI.OTRO` y `TI.NOVEDADES`.
- Validaciones frontend antes de submit; envío al server fn nueva.
- Al éxito: `queryClient.invalidateQueries` sobre `["remisiones"]`, `["seguimientos", casoId]`, `["referencia-interna", casoId]`.

Archivo nuevo: `src/lib/ri-novedades.functions.ts` (server fn + validador Zod).

## 9. Auditoría

Se registra por `registrar_auditoria_srv`:

- `ri.otro.registrado`
- `ri.novedades.registrado` (con `categorias`, `interna_codigo`, `externa_codigo`)
- `ri.examen.reprogramado` (con nueva fecha o `null`)
- `ri.programacion.invalidada`

No se guarda el payload completo. Observaciones se truncan a 200 chars en la auditoría.

## 10. Fuera de alcance

- Códigos de OTRO no se agregan a catálogos administrables — la lista es libre por diseño (`¿CUÁL?`).
- Historial y detalle: se usa el renderer existente de `seguimientos.detalles` (ya muestra campos clave). No se rediseña la vista.
- No se modifica cierre, cancelación, cambio de unidad, salientes, firma QR, filtros, turno, login, Control de Mando, Modo Práctica.

## 11. Pruebas

83 casos del prompt. Todos los que dependan de otro rol (operativa, temporal, inactivo, anon) quedan marcados **REQUIERE INTERVENCIÓN MANUAL** en el reporte final; solo se cubre en verificación local admin + typecheck + build + linter.

## 12. Riesgos

- Detectar "programación de ambulancia vigente" a partir de historial sin cambiar el esquema depende de recorrido de `seguimientos`; se agrega marcador booleano en `detalles` (`invalida_programacion=true`, `regresa_tramite=true`) y `computarEtapaRI` lo respeta. Los históricos previos siguen funcionando por el algoritmo actual (fallback al último `tipo_seguimiento` estándar).
- La reversión a "Trámite Coordinado" no borra la fila previa `PENDIENTE_COORDINACION`; el selector calcula el próximo paso a partir del último marcador de novedad, no del último tipo secuencial.

## 13. Entregable

Al terminar B3 se responderá con:

- Matriz de disponibilidad por etapa.
- Matriz de códigos.
- Ejemplos de plantillas.
- Tabla de archivos modificados (esperado ≤ 4 archivos + 1 migración).
- Reporte de pruebas (admin verificado, resto REQUIERE INTERVENCIÓN MANUAL).
- Estado final: **BLOQUE B3 COMPLETO — OTRO Y NOVEDADES LISTOS PARA PRUEBAS MANUALES**.
