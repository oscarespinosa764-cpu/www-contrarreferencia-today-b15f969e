# Plan de intervención — Salientes, Permisos Operativa y Reporte PDF

Antes de tocar código voy a **auditar la implementación actual** de cada módulo mencionado para reutilizar máximo lo existente y no duplicar componentes (QR, ambulancia, cambio de unidad, radicados, evolución diaria, cierres). Todo se hará en **una sola intervención agrupada**.

## 1. Pendientes — Nuevo Registro (modal)
- Comportamiento condicional por `TIPO DE PENDIENTE`:
  - `EVOLUCIONAR` y `VACACIONES` → ocultar Tipo de destino, IPS/Área, y limpiar `destination_type`, `ips_id`, `area_id` del estado antes de guardar.
  - Otros tipos → sin cambios.
- Mantener canales (ÍNDIGO / CORREO / PLATAFORMA) según el caso.

## 2. Referencia Interna — Nuevo Registro
- Añadir en catálogo de servicios (reutilizando catálogo existente si aplica):
  - SEDE AMBULATORIA PRINCIPAL / CONSULTAS ESPECIALIZADAS / SALAZAR.
- Añadir `TIPO DE SOLICITUD`: `EVACUACIÓN DE SEDES AMBULATORIAS` como valor real (visible en tarjeta, seguimiento, bitácora, historial, exportaciones, PDF).
- Cuando el servicio sea una sede ambulatoria: campos definidos (paciente, doc, tipo solicitud, tipo ambulancia, EAPB, observaciones).

## 3. Referencia Interna — Secuencia general de seguimiento
Aplica a RESONANCIA/INTERCONSULTA/ECOGRAFÍA/TAC/RX:
1. PENDIENTE COORDINACIÓN FECHA Y HORA DE EXAMEN
2. EXAMEN COORDINADO → pide fecha+hora (reutilizar componente fecha/hora existente)
3. CONFIRMACIÓN DE PROGRAMACIÓN DE AMBULANCIA → fecha/hora recogida + tipo (TAB/TAM/TAM-N), servicio auto del caso, plantilla Índigo reutilizada
4. CONFIRMACIÓN DE LLEGADA DE AMBULANCIA → reutiliza QR/tripulación/placa de Remisiones tal cual
5. CULMINACIÓN DE SOLICITUD → cierra y manda a historial

Validación de secuencia también en backend (server fn con guard por estado actual).

## 4. Cambio de unidad en Referencias Internas
Disponible en todas las fases activas, sin campo de cama, con Unidad actual (readonly) + Nueva unidad (catálogo). Registrar bitácora sin alterar estado principal.

## 5. Referencia Interna — Flujo especial (URGENCIAS VITALES / REMISIONES ESPECIALES / EVACUACIÓN)
1. ACTIVACIÓN DE PROVEEDOR CONTRATADO DE TEP → selector de 8 proveedores (catálogo empresas ambulancia reutilizado)
2. AMBULANCIA COORDINADA → solo observaciones + plantilla
3. CULMINACIÓN DE SOLICITUD

## 6. Catálogos EAPB — PHD/PAD/O2
Dos flags independientes en la tabla EAPB (o catálogo equivalente):
- `phd_requiere_radicacion` (bool)
- `phd_requiere_evolucion_plataforma` (bool)

Ambos editables solo por admin, con auditoría.

## 7-13. PHD/PAD/O2/Especiales — Seguimiento
Reorganizar el modal (mismo principio de Remisiones):
- Tipos: `RADICACIÓN` (si aplica), `EVOLUCIÓN DIARIA`, `NOVEDAD`, `ACEPTACIÓN`, `COORDINACIÓN DE AMBULANCIA` (si aplica), `CONFIRMACIÓN DE EGRESO`.
- Correo/Plataforma/Físico pasan a ser **canales**, no tipos.
- **Radicación**: obligatorio si EAPB lo requiere; muestra "Radicado actual" + botón "+ Agregar nuevo radicado" (historial, no sobrescribe). Si no requiere → "NO APLICA" (visual, null en DB).
- **Evolución diaria**: reutiliza el componente de Remisiones (especialidades, completa/parcial/sin, canales según EAPB).
- **Novedad** con subtipos: cancelación proveedor, cancelación especialidad, adición ambulancia (TAB/TAM/TAM-N), cambio/adición PAD, adición O2, cambio unidad especial.
- **Aceptación**: `¿egreso mismo día?` + `fecha prevista egreso` (default hoy, editable).
- **Ambulancia**: reutiliza flujo completo de Remisiones (QR, tripulación, placa, empresa, llegada).
- **Confirmación de egreso**: cierra y envía al historial PHD/PAD/O2.

Nueva tabla `phd_radicados` (append-only) para historial de radicados.

## 14. Pendientes — Seguimiento
Sin cambios funcionales (cumplimiento parcial exige observación; completo cierra). Solo blindar frente a otros cambios.

## 15-16. Permisos rol Operativa
- Ocultar del menú `Dashboard General`.
- Guard de ruta `/dashboard`: si rol = operativa, redirigir a `/dashboard-entrantes` (o similar). Fail-closed también en backend (loaders/server fns que devuelven datos coordinación).
- Alertas de coordinación: **silenciosas** para operativa. Retirar del UI de operativa cualquier botón/toast/casilla/contador de alertas. Generación se mantiene en backend (cron + hooks existentes).

## 17. Reporte General Operativo — Salientes (PDF)
Añadir sección **"PHD / PAD / O2 / UNIDADES ESPECIALES ACTIVAS"** con conteo en resumen superior y tabla con columnas: F.INICIO, F.RADICACIÓN, T.TRÁMITE, SERVICIO, PACIENTE, IDENT, EDAD, CIE-10, ESP. SOLICITANTE, TIPO SOLICITUD, REQUIERE AMB, TIPO AMB, EAPB, RÉGIMEN, RADICADO (NO APLICA / PENDIENTE / valor), ESTADO. Sin columna cama. Solo activos, dedupe por case_id. Repetir encabezados, saltos de página correctos, orientación horizontal.

## Detalles técnicos

**Componentes/lógica a REUTILIZAR (no duplicar):**
- Selector fecha/hora → el usado en `seguimiento-dialog.tsx` / Remisiones
- QR + tripulación + placa + empresa → flujo Remisiones tal cual
- Cambio de unidad → componente Remisiones
- Evolución diaria (especialidades) → componente Remisiones
- Plantillas Índigo → biblioteca existente
- Cierre + envío a historial → utilitario existente
- Catálogo empresas ambulancia → si existe, extender; si no, sembrar 8 en catálogo genérico

**Backend:**
- Server fns con `requireSupabaseAuth` validando: estado actual, secuencia, rol, case_id.
- Nueva tabla `phd_radicados` con RLS + GRANT.
- 2 columnas nuevas en EAPB catálogo (`phd_requiere_radicacion`, `phd_requiere_evolucion_plataforma`).
- Extender enum/catálogo TIPO_SOLICITUD con `EVACUACIÓN_SEDES_AMBULATORIAS`.
- Extender catálogo SERVICIOS con las 3 sedes ambulatorias.
- Sembrar catálogo `EMPRESAS_AMBULANCIA` con las 8 empresas.
- Guard servidor en loaders/server fns del Dashboard General para bloquear rol `operativa`.

**Archivos previstos (aproximado):**
- `src/components/remisiones/nuevo-registro-dialog.tsx` — condicional Pendientes; sedes ambulatorias en Ref. Interna; nuevo tipo solicitud.
- `src/components/remisiones/seguimiento-dialog.tsx` — reorganizar secuencias por tipo (general vs especial vs PHD).
- `src/components/catalogo/catalogo-maestras.tsx` — flags EAPB PHD.
- `src/routes/_authenticated.tsx` — guard rol operativa para `/dashboard`.
- `src/routes/_authenticated/dashboard.tsx` — beforeLoad con redirect fail-closed.
- `src/components/app-header.tsx` / sidebar — ocultar Dashboard General para operativa.
- `src/components/coordinacion/alertas-*` — no montar en UI operativa.
- `src/lib/salientes-export.ts` — nueva sección PHD activos en PDF.
- Migración DB: tabla `phd_radicados`, columnas EAPB, seeds catálogos.

## Restricciones respetadas
- Sin cambios en Entrantes, autenticación, correos, DNS, dominio.
- Sin nuevas dependencias.
- Sin migraciones destructivas.
- Sin duplicar QR, ambulancia, fechas, evolución, radicados, cambio unidad, cierres.
- Sin rediseño global.

## Entregable final
Al terminar entrego el reporte estructurado (secciones A–J del prompt): componentes reutilizados, tabla de archivos modificados, máquinas de estado, catálogos, permisos, PDF, pruebas 1–30, seguridad, cambios no realizados y control de alcance/créditos.

---

**Nota sobre créditos:** Este es un cambio grande (7 módulos, DB nueva, reorganización de un modal crítico de seguimiento, PDF, permisos). Aunque agrupado, el volumen de código a leer/editar es considerable. Confirma que apruebas antes de proceder.
