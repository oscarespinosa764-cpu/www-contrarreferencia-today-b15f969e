# F5 + F6 — Referencia Interna: secuencia general y flujo especial TEP

## Resumen
Se extiende `seguimiento-dialog.tsx` (extender, no reemplazar) para introducir dos secuencias con **gating estricto** (cada paso habilita solo el siguiente) sobre casos de `referencia_interna`. Se reutilizan el selector fecha/hora existente y el catálogo de ambulancias (`catalogos.tipo = 'EMPRESA_TEP'`). `CAMBIO DE UNIDAD` sigue disponible como seguimiento independiente en todas las fases activas.

## Detección de flujo por caso
Sobre el caso RI se lee `tipo_solicitud`:
- Flujo **ESPECIAL (F6)**: `URGENCIAS_VITALES`, `REMISIONES_ESPECIALES`, `EVACUACION_SEDES_AMBULATORIAS`.
- Flujo **GENERAL (F5)**: cualquier otro RI (RESONANCIA, INTERCONSULTA, ECOGRAFÍA, TAC, RX, etc.).

## F5 — Secuencia general (5 pasos)
Nuevos valores de `tipo_seguimiento` (ya se usa un enum `T`):
1. `PENDIENTE_COORD_EXAMEN` — estado inicial. Observaciones + plantilla editable + bitácora. No cierra caso.
2. `EXAMEN_COORDINADO` — campo obligatorio **FECHA Y HORA DEL EXAMEN** (reutiliza el datepicker+time existente en otras ventanas). Al guardar: actualiza estado, plantilla editable, bitácora, y habilita paso 3.
3. `CONFIRMACION_PROGRAMACION_AMB` — FECHA/HORA RECOGIDA + TIPO AMB (TAB/TAM/TAM-N desde catálogo) + observaciones + plantilla + bitácora → habilita 4.
4. `CONFIRMACION_LLEGADA_AMB` — FECHA/HORA LLEGADA + observaciones + plantilla + bitácora → habilita 5.
5. `CULMINACION_SOLICITUD` — cierra caso, lo retira de activos, envía a Historial RI, conserva seguimientos/plantillas/auditoría.

Gating: el `Select` de tipo solo muestra el siguiente paso permitido (+ `CAMBIO_UNIDAD` siempre) según el último seguimiento registrado. `CAMBIO_UNIDAD` no altera el puntero de secuencia.

## F6 — Flujo especial (TEP)
Secuencia:
1. `ACTIVACION_PROVEEDOR_TEP` — selector `PROVEEDOR_AMBULANCIA` (obligatorio, alimentado del catálogo TEP mostrando solo activos) + OBSERVACIONES. Auto: paciente, documento, servicio/ubicación, tipo_solicitud, tipo_ambulancia (si ya existe en el caso), EAPB, contactos. Al guardar → habilita 2.
2. `AMBULANCIA_COORDINADA` — solo OBSERVACIONES + plantilla editable + botón registrar. No re-solicita proveedor ni datos del paciente. → habilita 3.
3. `CULMINACION_SOLICITUD` — cierra + Historial RI.

`CAMBIO_UNIDAD` disponible en todas las fases activas.

## Catálogo TEP (8 proveedores)
Migración `INSERT ... ON CONFLICT DO NOTHING` en `public.catalogos` (`tipo = 'EMPRESA_TEP'`, `activo = true`) para asegurar la presencia de:
1. SERVICIO DE EMERGENCIAS MÉDICAS DEL CAQUETÁ - SEM
2. ASISTENCIA LOGÍSTICA INTEGRAL - ALI
3. SOS MEDICAL SERVICE
4. RED PLUS SEDE FLORENCIA
5. AMBULANCIAS BOMBEROS FLORENCIA
6. AMBULANCIA CLÍNICA CORPOMÉDICA
7. AMBULANCIA HOSPITAL DEPARTAMENTAL MARÍA INMACULADA SEDE FLORENCIA
8. AMBULANCIA HOSPITAL MALVINAS HÉCTOR OROZCO OROZCO

Se conservan los ya existentes; no se crea catálogo paralelo. Selector filtra `activo = true`.

## Validación en backend
En la server fn que persiste seguimientos (o en trigger sobre `seguimientos`), añadir validación:
- Rechazar un `tipo_seguimiento` de F5/F6 si el paso previo requerido no está registrado para el mismo caso, salvo `CAMBIO_UNIDAD`.
- Al insertar `CULMINACION_SOLICITUD` se marca el caso RI como archivado y pasa a Historial (misma mecánica que hoy usa el módulo de historial).

Función auxiliar SQL `private.ri_paso_permitido(_caso_id, _tipo_solicitud, _proximo_tipo)` invocada desde un trigger `BEFORE INSERT` en `seguimientos` para casos de tabla `referencia_interna`.

## Detalles técnicos

### Archivos que se tocan
- `src/components/remisiones/seguimiento-dialog.tsx`: nuevos valores en `T`, filtrado de opciones por flujo+puntero, nuevos bloques de formulario (fecha/hora examen, fecha/hora recogida, fecha/hora llegada, selector TEP), plantillas por paso, wiring de guardado.
- `src/lib/rc-utils.ts` (o util correspondiente): helper `siguientePasoRI(seguimientos, tipoSolicitud)` puro, testeable.
- Migración SQL: seed catálogo TEP + función `ri_paso_permitido` + trigger `seguimientos_ri_gating`.
- `src/routes/_authenticated/seguimientos.tsx`: sin cambios (la lista ya lee `seguimientos`).

### Estructura del `Select` de tipo
```text
opciones = [
  ...(esRI && esGeneral ? [siguientePasoGeneral(caso)] : []),
  ...(esRI && esEspecial ? [siguientePasoEspecial(caso)] : []),
  ...(casoActivo ? [T.CAMBIO_UNIDAD] : []),
]
```
Si `siguientePaso*` devuelve `null` (secuencia culminada) solo queda `CAMBIO_UNIDAD` mientras el caso esté activo.

### Plantillas
Se registran claves nuevas en `plantillas` con `slug`: `ri_examen_coordinado`, `ri_prog_ambulancia`, `ri_llegada_ambulancia`, `ri_culminacion`, `ri_tep_activacion`, `ri_tep_coordinada`. Editables como el resto.

### Riesgos y mitigaciones
- **Regresión en `CAMBIO_UNIDAD`**: se preserva el bloque actual, no se toca su gating.
- **Casos legacy sin paso 1 registrado**: el helper trata "sin seguimientos RI" como `PENDIENTE_COORD_EXAMEN`, permitiendo continuar sin migración de datos.
- **Rollback**: el trigger es aislable con `DROP TRIGGER`; los nuevos enums son aditivos.

## Fuera de alcance (explícito)
- No se modifica el flujo de salientes ni el de entrantes.
- No se cambian campos por proveedor (todos usan la misma estructura).
- No se toca F7 (PHD/PAD/O2).
- No se rediseña la UI de otros tipos de solicitud.

## Criterios de aceptación
- Casos RI generales solo permiten avanzar en orden 1→5; el backend rechaza saltos.
- Casos RI especiales solo permiten 1→3 y usan solo el selector TEP con los 8 proveedores del catálogo.
- `CAMBIO_UNIDAD` sigue disponible en cualquier fase activa sin romper la secuencia.
- Al registrar `CULMINACION_SOLICITUD`, el caso desaparece de activos y aparece en Historial RI con todos sus seguimientos.
