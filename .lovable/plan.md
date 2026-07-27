# FASE 5A — Referencias Internas: Firma QR de llegada, Cierre por conclusión y Cancelación

Ejecuta únicamente el flujo de seguimiento de Referencias Internas. No toca Salientes, PHD/PAD/O2, Alertas, Cuadro de Turno, Indicadores, Control de Mando, filtros, turno, login ni Modo Práctica.

## Reutilización (inspección hecha)

| Elemento | Existente | Reutilizar |
|---|---|---|
| Infraestructura QR | `entrega_firmas` (token_hash SHA-256, expira, estado PENDIENTE/FIRMADA/VENCIDA/ANULADA, RLS fail-closed, guard trigger) + ruta pública `/firma-entrega` | Sí, con nuevo `tipo_caso='referencia_interna'` y `snapshot.flujo='RI_LLEGADA'` |
| Server fns firma | `obtenerSesionFirma`, `firmarEntrega` en `src/lib/entrega-firma.functions.ts` | Sí — `firmarEntrega` ya soporta responsable + firmante distinto + teléfono + firma dataURL |
| Modal seguimiento | `src/components/remisiones/seguimiento-dialog.tsx` bloque `esInterna && tipoSeg===TI.LLEGADA_AMB` (hoy pide fecha/hora manual) | Reemplazar por bloque QR |
| Cadena `siguientePasoRI` | Devuelve `CULMINACION` después de `LLEGADA_AMB` | Renombrar destino a nueva constante `CIERRE_CONCLUSION`; conservar `CULMINACION` sin retirarlo para casos ya existentes |
| Ruta pública | `/firma-entrega` | Adaptar: campos condicionales según `snapshot.flujo` (oculta checklist/docs para RI, muestra `NOMBRE RESPONSABLE / CARGO / casilla firmante distinto / TELÉFONO / FIRMA`) |
| Cancelación RI | No existe actualmente en la lista de tipos para `esInterna` | Añadir `CANCELACION_TRAMITE` con razón obligatoria |

## Cambios

### 1. Constantes canónicas (`seguimiento-dialog.tsx`)
Añadir a `TI`:
- `LLEGADA_AMB_QR: "CONFIRMACIÓN DE LLEGADA DE AMBULANCIA"` (reemplaza flujo manual; label idéntico, código canónico persistido en columna `tipo_seguimiento`).
- `CIERRE_CONCLUSION: "CIERRE DE CASO POR CONCLUSIÓN DE SOLICITUD"`.
- `CANCELACION_RI: "CANCELACIÓN DE TRÁMITE"`.

### 2. Selector de tipos RI
Regla:
- Siempre visibles mientras el caso esté activo y el usuario tenga permiso: `CANCELACION_RI`.
- Cadena secuencial actual conservada; después de `LLEGADA_AMB` (confirmada en BD) → habilitar `CIERRE_CONCLUSION` (en lugar de `CULMINACION`).
- Se detecta consultando `historial` ya cargado por el modal (query `ri-historial`); no depende de estado local.

### 3. Bloque QR para `LLEGADA_AMB` (RI)
Reemplaza el input manual de fecha/hora por:
- Explicación breve.
- Botón **ABRIR FIRMA QR** que abre un modal específico RI.
- Modal RI muestra: Empresa de traslado (readonly desde caso), Sede (readonly desde caso), Fecha/hora de entrega (readonly, timestamp del servidor asignado al crear la sesión), botón **GENERAR QR DE FIRMA**.
- Deshabilita generación si falta empresa/sede/permiso; mensaje específico.
- Reutiliza componente/hook de generación QR de Salientes (extraerá el diálogo mínimo a un componente compartido `SignatureQrPanel` o llamará la server fn directamente y renderizará QR en un nuevo pequeño componente `firma-qr-ri-panel.tsx`).

### 4. Nueva server fn atómica
`crearSesionFirmaLlegadaRI` (en `src/lib/entrega-firma.functions.ts`, protegida con `requireSupabaseAuth`):
- Valida rol activo + permiso sobre el caso RI.
- Lee empresa/sede/fecha desde `referencia_interna` (fuente canónica) — nunca acepta del cliente.
- Revoca sesiones PENDIENTE previas del mismo caso+flujo (marca `ANULADA`).
- Inserta fila `entrega_firmas` con `tipo_caso='referencia_interna'`, `snapshot={flujo:'RI_LLEGADA', empresa, sede, fecha_solicitud_iso, paciente_iniciales, documento_enmascarado}`, `expira_at = now()+2h`.
- Devuelve `{token, expira_at}`.

### 5. Ruta pública `/firma-entrega`
Ajuste condicional por `snapshot.flujo`:
- Si `RI_LLEGADA`: oculta documentos/checklist/IPS receptora/tipo ambulancia; muestra sección "Responsable del traslado", casilla "¿El firmante no es el mismo responsable del traslado?", teléfono, firma. `firmarEntrega` ya persiste todos esos campos; no requiere cambios de esquema.
- Salientes intacto (mismo componente, ramas condicionales mínimas).

### 6. Registro del seguimiento LLEGADA (server-side)
Nueva server fn `registrarLlegadaAmbulanciaRI`:
- Recibe `{caso_id, signatureRequestId}` — servidor resuelve caso desde la fila `entrega_firmas` (no confía en el cliente).
- Verifica: fila FIRMADA, `seguimiento_id IS NULL`, `tipo_caso='referencia_interna'`, caso activo.
- En transacción (RPC SECURITY DEFINER): inserta `seguimientos(tipo_seguimiento='CONFIRMACIÓN DE LLEGADA DE AMBULANCIA', metadata={firma_id, empresa, sede, fecha_llegada, responsable, firmante, telefono})`; actualiza `entrega_firmas.seguimiento_id`; actualiza `referencia_interna.estado='AMBULANCIA EN SITIO'` (estado existente); registra auditoría.
- Idempotencia: unique parcial `(caso_id, tipo_seguimiento)` no aplicable a la tabla actual, pero la validación `seguimiento_id IS NULL` en `entrega_firmas` impide doble asociación.

### 7. Cierre por conclusión (nueva server fn `cerrarRIConclusion`)
- Input: `{caso_id, paciente_retorno: 'SI'|'NO', observaciones}`.
- Valida existencia de seguimiento previo `CONFIRMACIÓN DE LLEGADA DE AMBULANCIA` para el caso.
- Transacción: inserta `seguimientos(tipo='CIERRE DE CASO POR CONCLUSIÓN DE SOLICITUD', metadata={paciente_retorno})`; actualiza `referencia_interna.estado='CERRADO POR CONCLUSION'` + `archivado=true` para retirarlo de vistas activas; auditoría.

### 8. Cancelación RI (nueva server fn `cancelarRI`)
- Input: `{caso_id, razon: string(min 5)}`.
- Disponible en cualquier momento mientras el caso esté activo.
- Transacción: inserta `seguimientos(tipo='CANCELACIÓN DE TRÁMITE', metadata={razon})`; actualiza `referencia_interna.estado='CANCELADO'` + `archivado=true`; auditoría. NO habilita reactivación automática.

### 9. Estados terminales
Inspección: `referencia_interna` acepta texto libre en `estado` (sin CHECK). No requiere migración de enum. Se documentan códigos canónicos `CERRADO POR CONCLUSION` y `CANCELADO`. Se ajusta `historial.tsx` y consultas activas para que estos estados aparezcan como terminales y sean incluidos en Historial (ya se filtran por `archivado=true`).

### 10. Migración mínima
- Ninguna sobre `entrega_firmas`.
- Solo si el filtro actual de Historial no considera `CERRADO POR CONCLUSION` / `CANCELADO`: verificar y (si aplica) sumar a allowlist en `fetchHistoricosCasos`. Sin DDL.

## Archivos previstos

| Archivo | Cambio |
|---|---|
| `src/lib/entrega-firma.functions.ts` | +3 fns: `crearSesionFirmaLlegadaRI`, `registrarLlegadaAmbulanciaRI`, y reutiliza `obtenerSesionFirma/firmarEntrega`. |
| `src/lib/ri-cierre.functions.ts` (nuevo) | `cerrarRIConclusion`, `cancelarRI`. |
| `src/components/remisiones/firma-qr-ri-panel.tsx` (nuevo) | Modal específico RI (empresa/sede/fecha readonly + QR + polling de estado firmado). |
| `src/components/remisiones/seguimiento-dialog.tsx` | Añadir constantes, integrar bloque QR RI, cierre por conclusión con `SÍ/NO`, cancelación RI con razón; sustituir input manual fecha/hora. |
| `src/routes/firma-entrega.tsx` | Ramas condicionales por `snapshot.flujo` (oculta checklist/tipo ambulancia para RI). |
| `src/lib/historial-export.ts` / consulta históricos si aplica | Incluir estados terminales `CERRADO POR CONCLUSION` y `CANCELADO`. |

## Fuera de alcance
- Reactivación de Referencias Internas canceladas.
- Cambios en Salientes, PHD, entrantes, otros módulos.
- Nuevos PDF/checklist/portada para este flujo.

## Matriz por rol

| Funcionalidad | Admin | Operativa | Temporal | Inactivo | Anon |
|---|---|---|---|---|---|
| Ver seguimiento RI | VISIBLE Y UTILIZABLE | VISIBLE Y UTILIZABLE | VISIBLE Y UTILIZABLE | BLOQUEADO | BLOQUEADO |
| Abrir/Generar QR llegada | VISIBLE Y EDITABLE | VISIBLE Y EDITABLE | según permiso actual RI | BLOQUEADO | BLOQUEADO |
| Registrar llegada / cierre / cancelación | VISIBLE Y EDITABLE | VISIBLE Y EDITABLE | según permiso actual RI | BLOQUEADO | BLOQUEADO |
| Formulario público con token válido | NO APLICA | NO APLICA | NO APLICA | NO APLICA | VISIBLE Y UTILIZABLE |
| Formulario público sin token / caso interno | NO APLICA | NO APLICA | NO APLICA | NO APLICA | BLOQUEADO |

## Preguntas para el usuario

1. **Estado terminal por conclusión:** propongo el código `CERRADO POR CONCLUSION`. ¿OK o prefieres otro literal? (`CERRADO POR CULMINACION`, `CONCLUIDO`…)
2. **Cambio del label visible del cierre:** El flujo actual usa `CULMINACIÓN DE SOLICITUD`. La FASE 5A pide `CIERRE DE CASO POR CONCLUSIÓN DE SOLICITUD`. ¿Reemplazo por completo (deja de existir `CULMINACIÓN DE SOLICITUD` en el selector) o conservo compatibilidad para históricos ya registrados con el texto anterior?
3. **Modal RI QR:** ¿confirmas que la fecha/hora visible en el modal debe ser la del **momento de crear la sesión de firma** (server-side) y NO del momento en que el tripulante confirma? El prompt sugiere lo primero (“se completa al abrir el modal”); lo dejo así explícitamente para evitar ambigüedad.

Con esas respuestas procedo directamente.
