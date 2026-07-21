# Plan — Reloj de hora + Ref. Internas (Coord. ambulancia / Activación TEP / Cambio de unidad)

## Alcance (estricto)

- **NO** se toca ningún selector de fecha. Los calendarios actuales (shadcn `Calendar` dentro de `Popover`) siguen intactos.
- **SÍ** se reemplaza únicamente el control de hora (los actuales `type="time"` / `datetime-local` / listas verticales del navegador) por un reloj analógico 24h reutilizable.
- Nuevo tipo de solicitud **COORDINAR AMBULANCIA** en Ref. Internas → Nuevo registro.
- Seguimiento de Ref. Internas: **ACTIVACIÓN DE PROVEEDOR CONTRATADO DE TEP** y **CAMBIO DE UNIDAD** con sus campos dinámicos y plantilla Índigo.

## 1. Componente central `AppTimePicker`

Nuevo `src/components/ui/app-time-picker.tsx`:

- Diálogo compacto (`Dialog` shadcn) con reloj analógico SVG 24h.
- Anillo exterior 1–11, anillo interior 13–23, 00 y 12 arriba.
- Dos pasos: HORA → MINUTOS (marcas 00,05…55) + input manual 00–59.
- Header con `HH:mm` editable por teclado. Botones CANCELAR / ACEPTAR. Escape/Enter.
- Wrapper `AppDateTimeField` que compone el **calendario actual** (sin modificarlo) + `AppTimePicker` y devuelve un único ISO local.
- Wrapper `AppTimeField` para campos de solo hora.

## 2. Migración quirúrgica de campos de hora

Reemplazar sólo estos ocupantes de `type="time"` / `datetime-local` (inventario `rg`):

| Archivo | Campos |
|---|---|
| `src/components/remisiones/form-bits.tsx` | rama `type="datetime-local"` de `Field` → delega a `AppDateTimeField`. |
| `src/components/remisiones/nuevo-registro-dialog.tsx` | fechas/hora operativas del formulario (registro, coordinación). |
| `src/components/remisiones/seguimiento-dialog.tsx` | inputs `datetime-local` del seguimiento. |
| `src/components/remisiones/phd-seguimiento-dialog.tsx` | igual. |
| `src/components/rc/registrar-wizard.tsx` | inputs `datetime-local`. |
| `src/components/coordinacion/usuario-actividad-dialog.tsx` | rangos con hora. |

Campos de solo fecha, timestamps automáticos, filtros y fechas históricas: **sin cambios**.

## 3. Nuevo Registro Ref. Internas → COORDINAR AMBULANCIA

En `nuevo-registro-dialog.tsx` (rama Ref. Interna ya existente):

- Agregar `COORDINAR AMBULANCIA` a la lista `tiposRefInterna` (ya incluida en L1145 según grep; verificar y garantizar).
- Cuando `tipo_solicitud === "COORDINAR AMBULANCIA"`, mostrar:
  - `Fecha y hora de coordinación` (obligatoria) usando `AppDateTimeField`.
  - `Proveedor de ambulancia` (Combobox alimentado por catálogo `TIPO_AMBULANCIA` / proveedores de ambulancia existente, filtrando activos).
  - Preseleccionar el proveedor cuyo nombre normalizado matchee `SERVICIOS DE EMERGENCIAS MEDICAS DEL CAQUETA` o alias `SEM`. Si no existe, dejar vacío y mostrar toast informativo.
- Persistir en `metadata` del caso: `coordinacion_ambulancia: { fecha_hora, proveedor_id?, proveedor_nombre }`.

## 4. Seguimiento Ref. Internas

En `seguimiento-dialog.tsx` (modal actual, sin duplicar):

### 4.1 ACTIVACIÓN DE PROVEEDOR CONTRATADO DE TEP
- Mostrar `Fecha y hora de activación` (`AppDateTimeField`) + `Proveedor TEP` (Combobox catálogo proveedores TEP existente, activos, SEM por defecto).
- Guardar estructurado dentro del payload del seguimiento (`metadata.activacion_tep`).
- Plantilla Índigo:
  ```
  SE ACTIVA PROVEEDOR CONTRATADO DE TEP.
  PROVEEDOR: <nombre>
  FECHA Y HORA DE ACTIVACIÓN: <DD/MM/YYYY, HH:mm>
  PACIENTE: … DOCUMENTO: … SERVICIO/UBICACIÓN: … TIPO DE SOLICITUD: …
  OBSERVACIONES: …
  ```
  Regenera al cambiar proveedor/fecha/hora; ya no imprime `PROVEEDOR: —`.

### 4.2 CAMBIO DE UNIDAD
- Campos: `Unidad` (Combobox catálogo unidades/servicios existente, activos) y `Cama` (texto uppercase).
- Guardar `metadata.cambio_unidad: { unidad_anterior, unidad_nueva, cama }`; actualizar `caso.unidad` con la nueva conservando la anterior en metadata (trazabilidad, sin sobrescribir historial).
- Plantilla Índigo con Paciente, Documento, Unidad anterior, Nueva unidad, Cama, Fecha automática, Observaciones. Sin bloque de proveedor.

### 4.3 UI condicional
Al cambiar `tipo_seguimiento`, ocultar/limpiar campos no aplicables y regenerar plantilla; el botón Registrar sigue deshabilitado hasta completar los obligatorios.

## 5. Catálogos (reutilización)

- Proveedores de ambulancia: fuente ya usada en el formulario (`TIPO_AMBULANCIA` u opción concreta de proveedores en Red). Se lee el mismo hook `useCatalogo` / `useCatalogos`. No se crea tabla.
- Proveedores TEP: idem, catálogo existente `PROVEEDOR_TEP` (o el que use el seguimiento hoy).
- Unidades: catálogo `SEDE`/`UNIDAD` ya presente (usar el mismo que el resto de la app). No hardcode.

## 6. Validación / auditoría

- El servidor que persiste caso/seguimiento ya valida usuario, dispositivo y RLS; se agrega validación mínima de tipos/valores en handler (`ISO date`, `proveedor_id` presente en catálogo activo, `unidad` en catálogo activo) donde ya se hace la escritura.
- Se emiten eventos en `audit_logs` con `tipo`, `fecha`, `proveedor_id/unidad_id/cama` (sin PHI extra) reutilizando `registrar_auditoria`.

## 7. Fuera de alcance (no se toca)

Remisiones (fuera de Ref. Internas), Entrantes, PHD/PAD/O2, Cuadro de Turno, Auth, dispositivos, firma QR, reportes. Ningún calendario. Ningún campo de solo fecha. Ningún timestamp automático.

## Archivos a crear / editar

- **Nuevo**: `src/components/ui/app-time-picker.tsx` (reloj + wrappers).
- **Editar**:
  - `src/components/remisiones/form-bits.tsx` (rama datetime-local).
  - `src/components/remisiones/nuevo-registro-dialog.tsx` (COORDINAR AMBULANCIA + campos dinámicos).
  - `src/components/remisiones/seguimiento-dialog.tsx` (Activación TEP + Cambio de unidad + plantilla).
  - `src/components/remisiones/phd-seguimiento-dialog.tsx`, `src/components/rc/registrar-wizard.tsx`, `src/components/coordinacion/usuario-actividad-dialog.tsx` (sustitución puntual de `datetime-local`).

Confirma para implementar.
