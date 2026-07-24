# FASE 13 — Plan de implementación

Alcance: exclusivamente los 6 bloques descritos. Se modificará el mínimo de archivos posibles, reutilizando fuentes canónicas, sin ampliar permisos, sin tocar RLS/grants ya cerrados, sin alterar Modo Práctica, evidencias, firmas, QR ni históricos.

---

## BLOQUE A — Menú lateral y Control de Mando

**Diagnóstico previo (rápido):**
- Localizar el componente del menú lateral (probablemente `src/routes/_authenticated.tsx` o un `AppSidebar`).
- Confirmar rutas actuales `/catalogo` y `/reglas` (existen en `src/routes/_authenticated/`).

**Cambios:**
1. Ocultar del menú lateral los enlaces **Catálogos** y **Reglas** (solo el enlace, no la ruta).
2. Retirar la pestaña principal **Reglas** de `src/routes/_authenticated/control-mando.tsx` (eliminar `<TabsTrigger value="reglas">` y `<TabsContent value="reglas">`), eliminando también el import de `ReglasAdmin`. El archivo `src/components/coordinacion/reglas-admin.tsx` deja de usarse (no se elimina para evitar riesgo — o se elimina si no hay otros consumidores; se auditará con `rg`).
3. Ruta `/catalogo`: se conserva (contiene funcionalidad operativa: `catalogo-maestras.tsx`). Solo se retira del menú lateral.
4. Ruta `/reglas`: es una vista OPERATIVA (Alertas de coordinación + Avisos operativos, según memory). Se conserva la ruta pero se retira del menú lateral principal para administradores. Se evaluará si operativa/temporal aún necesitan acceso — según memory sí lo usan como vista consolidada; se mantiene ruta accesible pero se decidirá si dejar un enlace secundario o solo acceso desde otro punto. **Propuesta:** conservar la ruta accesible por URL directa y mantener el enlace en menú solo si operativa/temporal lo requieren. Confirmar en implementación con `rg` de referencias al link.

---

## BLOQUE B — Alertas y Avisos + Estado técnico

**Cambios en `src/components/coordinacion/alertas-avisos-admin.tsx`:**
- Retirar la pestaña **Estado técnico** (el `ControlMandoPanel` sigue montado dentro de Control de Mando → Usuarios, ya existe allí).
- Dejar 3 pestañas: Reglas de coordinación, Reglas operativas, Avisos manuales.

No se toca el componente `ControlMandoPanel` (ya reutilizado en Usuarios).

---

## BLOQUE C — Plantillas operativas (aceptación, negación, respuestas, seguimientos, Índigo)

**Auditoría (obligatoria antes de implementar):** localizar dónde viven realmente los textos de aceptación/negación/respuestas/seguimientos/Índigo (probablemente en `src/lib/oficio.ts`, `src/lib/oficio-config.ts`, `src/lib/plantillas-inventario-config.ts`, `src/lib/plantillas-preview-fixtures.ts`, hardcoded en `seguimiento-dialog.tsx`, `phd-seguimiento-dialog.tsx`).

**Entregable:** tabla inventario (Plantilla · Consumidor · Fuente actual · Editable · Estado).

**Acción mínima:**
- Si ya están en `plantillas_inventario`/`plantillas_versiones` (Fase 9 lo hizo para 8 oficios), verificar visibilidad en Control de Mando → Plantillas del sistema y **solo** completar puntos de uso / categorizar para que aparezcan agrupadas como "Plantillas operativas".
- Para plantillas hardcoded de "Texto para Índigo" en seguimientos: documentar en el inventario. **No** migrar en esta fase salvo que sea trivial y solicitado; el prompt permite mantener fallback. Se propondrá registro en inventario sin migrar el texto (solo hacerlo visible como referencia administrable en fases futuras) — a menos que el usuario quiera migración completa ahora, lo cual excede "menor cantidad de archivos".

**Decisión:** limitarse a **hacer visibles y correctamente categorizadas** las plantillas ya versionadas y **registrar en inventario** (sin migración de texto) las que hoy estén hardcoded, para exponerlas en la UI administrativa. Sin duplicar fuentes.

---

## BLOQUE D — "NO SE COMENTA A LA RED" en Nuevo de Remisiones

**Archivos:**
- `src/components/remisiones/nuevo-registro-dialog.tsx` (formulario Nuevo)
- Schema/validación asociada
- Server function de creación (validar combinación server-side)

**Cambios:**
1. Identificar identificadores canónicos de EAPB=Nueva EPS y Remisión por=Red no contratada (por catálogo/slug, no por texto visible).
2. Añadir tercera opción condicional `NO_SE_COMENTA_A_LA_RED` cuando ambas condiciones se cumplan.
3. Al cambiar EAPB o "Remisión por" de forma que ya no aplique, limpiar selección incompatible.
4. Persistir el valor en el mismo campo `red_a_la_que_se_comenta` (o el canónico existente).
5. Validación server-side: rechazar el valor si no cumple combinación.
6. Migración solo si hay CHECK constraint / enum que rechace el valor.

---

## BLOQUE E — Fecha y hora en "PENDIENTE COORDINACIÓN FECHA Y HORA EXAMEN" (RI)

**Archivo:** `src/components/remisiones/seguimiento-dialog.tsx` (u homólogo RI).

**Cambios:**
1. Añadir bloque condicional con campo `AppDateTimeInput` (reutilizar componente existente) obligatorio cuando `tipo_seguimiento === "PENDIENTE COORDINACIÓN FECHA Y HORA EXAMEN"`.
2. Persistir en `seguimientos.metadata` (JSONB existente) — no crear columna.
3. Actualizar plantilla para Índigo con el formato solicitado.
4. Regenerar/Copiar deben incluir la fecha/hora.
5. Validar en server function `registrarSeguimiento` (si existe) que fecha/hora esté presente para este tipo.

---

## BLOQUE F — Edición total ADMIN en "Ver caso" de Dashboard Operativo Salientes

**Auditoría:** localizar los modales "Ver caso"/"Editar" en Salientes:
- `src/components/remisiones/caso-remision-card.tsx`
- `src/components/remisiones/caso-generico-card.tsx`
- Diálogos de edición asociados (`seguimiento-dialog.tsx`, `nuevo-registro-dialog.tsx` en modo edit, PHD dialog).

**Cambios:**
1. Reutilizar el modal/formulario ya existente. Aplicar flag `isAdmin` para desbloquear los campos que hoy están read-only cuando el usuario es admin.
2. Crear (o extender) server function `editarCasoSaliente` con:
   - `requireSupabaseAuth`
   - Verificar `has_role(userId, 'admin')`
   - Zod schema con **allowlist explícita** de columnas editables (excluye id, created_at, created_by, hashes, firmas, QR, campos derivados).
   - Registrar en `audit_logs` (campos modificados: antes/después).
3. Frontend: usar la nueva mutation server para admin; conservar mutations existentes para operativa/temporal (sin cambios de permiso).
4. Recálculo de derivados (tiempo del trámite) se mantiene en la lectura, no editable.

---

## Base de datos / migraciones

- Bloque D: probablemente ninguna migración (columna `red_a_la_que_se_comenta` suele ser text libre). Si hay CHECK/enum, migración mínima para permitir `NO_SE_COMENTA_A_LA_RED`.
- Bloque E: sin migración (usa `metadata` jsonb existente).
- Bloque F: sin migración de tablas; solo función/RPC de edición admin (o server function TS).
- Bloque C: sin migración si limitamos a "hacer visibles"; posiblemente inserts para registrar puntos de uso faltantes (usar `supabase--insert`).

---

## Roles y matriz

| Funcionalidad | Admin | Operativa | Temporal | Inactivo | Anon |
|---|---|---|---|---|---|
| Menú lateral sin Catálogos/Reglas | Aplica | Aplica | Aplica | N/A | N/A |
| Control de Mando (sin pestaña Reglas) | VISIBLE Y EDITABLE | OCULTO | OCULTO | BLOQUEADO | BLOQUEADO |
| Alertas y avisos (3 pestañas) | VISIBLE Y EDITABLE | OCULTO | OCULTO | BLOQUEADO | BLOQUEADO |
| Estado técnico en Usuarios | VISIBLE Y UTILIZABLE | OCULTO | OCULTO | BLOQUEADO | BLOQUEADO |
| Tercera opción "NO SE COMENTA A LA RED" | VISIBLE Y EDITABLE (si combinación) | VISIBLE Y EDITABLE (si combinación) | según permisos actuales | BLOQUEADO | BLOQUEADO |
| Fecha/hora examen RI | VISIBLE Y EDITABLE | VISIBLE Y EDITABLE | según permisos actuales | BLOQUEADO | BLOQUEADO |
| Edición total Ver caso Salientes | VISIBLE Y EDITABLE | restricciones actuales (sin cambio) | restricciones actuales (sin cambio) | BLOQUEADO | BLOQUEADO |

---

## Archivos previstos (mínimos)

1. Menú lateral (a identificar): retirar 2 links.
2. `src/routes/_authenticated/control-mando.tsx`: retirar pestaña Reglas.
3. `src/components/coordinacion/alertas-avisos-admin.tsx`: retirar pestaña Estado técnico.
4. `src/components/remisiones/nuevo-registro-dialog.tsx`: opción condicional.
5. Server function de creación/edición de remisión (a identificar): validación combinación.
6. `src/components/remisiones/seguimiento-dialog.tsx`: bloque datetime condicional + plantilla Índigo.
7. Nueva server function `src/lib/salientes-admin-edit.functions.ts` (edición total admin con allowlist + auditoría).
8. Modales "Ver caso" en Salientes: flag admin para desbloquear campos + wire a la nueva mutation.
9. Posible migración mínima (bloque D) y/o inserts en `plantillas_inventario`/`puntos_de_uso` (bloque C).

---

## Preguntas para el usuario antes de codificar

1. **Bloque A - `/reglas` en menú:** ¿el enlace "Alertas y avisos operativos" del menú lateral (que apunta a `/reglas`) debe también retirarse, o solo los ítems literalmente llamados "Catálogos" y "Reglas"? El prompt dice retirar "Catálogos" y "Reglas" del menú, pero `/reglas` es la vista operativa que operativa/temporal consumen.
2. **Bloque C - alcance:** ¿migro ahora los textos hardcoded de "Plantilla para Índigo" al inventario documental (más créditos, más archivos), o me limito a **listarlos en la auditoría** y dejar migración para fase futura?
3. **Bloque F - alcance de "todos los campos funcionales":** ¿confirmas que admin debe poder editar TODO (paciente, documento, EAPB, fechas de radicación, etc.) incluso en casos con estado avanzado / firmados? Solo se protegen los técnicos (id, hashes, QR, firmas, created_by).

Sin las respuestas puedo asumir defaults conservadores: (1) solo retirar los dos enlaces literales, dejando `/reglas` como está; (2) solo auditar+categorizar sin migrar textos hardcoded; (3) admin edita todos los campos funcionales salvo protegidos técnicos, sin distinción por estado del caso.

Confirma o ajusta y procedo.