## Contexto verificado

- **Red/IPS**: la reorganización de subventanas (pestaña 1 = JORNADAS/CÓDIGOS TEP, IPS unificada con ámbito Caquetá/Nacional, AMBULANCIAS unificada, ESPECIALIDADES CEDIM) **ya existe** en `red-ips-utils.ts`. Solo falta limpieza de UI y campos.
- **Cuadro de turno**: 7 pestañas separadas hoy → se consolidan en 3.
- **Formatos reales confirmados** desde los Excel adjuntos:
  - TH-FR-10: 1 fila por colaborador `Colaborador | Cargo | Sede | 1..N` + hoja `Convenciones`. Códigos reales: ADM, D, M, M/T, N, T.
  - TH-FR-09: motivos recuperable/no recuperable.

---

## 1) RED / DISPONIBILIDAD IPS (ajustes menores, estructura ya existe)

Archivo: `src/routes/_authenticated/red-ips.tsx` + `src/components/red/red-card.tsx`
- Quitar el bloque "Novedades del turno" y los toggles "Disponible / Marcar disponibilidad" (estados `dispTarget`, `pedirCambio`, `aplicarDisponibilidad`, columna de indicadores de disponibilidad y el `AlertDialog` de disponibilidad).
- La tarjeta pasa a solo mostrar/ver detalle (sin switch).
- Verificar que el formulario (`red-form-dialog.tsx`) capture, por tipo:
  - IPS: nombre, ciudad/departamento, correo, teléfonos, especialidades, servicios, EAPB.
  - Ambulancias: empresa, ciudad/depto, correo, teléfonos, tipos (TAB/TAM/TAM-N/AÉREA), servicios, EAPB.
  - Jornadas: especialidad, fecha inicio, fecha fin, IPS.
  - Códigos TEP: empresa TEP, CUPS, tipo ambulancia, tipo recorrido, descripción CUPS.

## 2) CUADRO DE TURNO — consolidación a 3 pestañas

Archivo ruta: `src/routes/_authenticated/cuadro-turno.tsx`
- **Pestaña A — "Cuadro de turno"**: integra Cuadro mensual + Mi turno, con toggle interno **Calendario (default)** / Matriz.
- **Pestaña B — "Solicitudes y ausentismo"**: integra Solicitudes + Historial de cambios + Control de ausentismo (subsecciones internas).
- **Pestaña C — "Administración"** (solo admin): integra Firmas + Configuración.

### 2A. Vista Calendario (nueva, default)
Nuevo componente `calendario-turnos.tsx`:
- Grilla mensual tipo calendario; cada día muestra turnos por colaborador con **color + abreviatura** (M, T, N, M/T, ADM…).
- Click en un día → **modal simple de detalle** (funcionario, día, turno, horario, novedad). Admin/coordinador puede editar/borrar ahí; el alta principal sigue siendo por "Agregar".
- Matriz existente pasa a vista secundaria (reutiliza la tabla actual).

### 2B. Botones principales
- Eliminar "Plantilla TH-FR-10" y "Asignar plantilla de turno".
- Dejar solo **Exportar Excel** (rename de "Exportar cuadro TH-FR-10") e **Importar Excel**.

### 2C. Colaborador + Cargo + Agregar
- Colaborador = **lista desplegable** con funcionarios (`profiles`).
- Cargo se **autollena** al elegir colaborador.
- "Agregar" abre el **modal de asignación por bloques**.

### 2D. Modal de asignación por bloques (nuevo `asignar-turnos-dialog.tsx`)
- Colaborador (preseleccionado o elegible) + cargo visible.
- Repetir bloques: elegir **turno** + **días exactos** del mes (multi-selección) → agregar bloque → agregar otro bloque → guardar todo.
- Turnos desde tipos parametrizados (`shift_types`): M, T, N, M/T, M/N, T/N, ADM, etc.

## 3) Export / Import Excel (formato real TH-FR-10)

Archivo: `src/lib/cuadro-excel.ts`
- Reescribir export a **1 fila por colaborador** (`Colaborador|Cargo|Sede|1..N`) + hoja `Convenciones` (código/nombre/horas), igual al archivo real.
- Ajustar el import para leer ese layout (ya soporta detección de encabezado; alinear a 1 fila/colaborador).

## 4) Modal "Nuevo registro de ausentismo"

Archivo: `src/components/cuadro-turno/ausentismo-panel.tsx`
- Trabajador = **desplegable** de funcionarios; autollena **C.C.** y **Cargo**.
- Fecha de registro = **hoy** automática.
- Quitar: EPS, ARL, Salario día, Recursos requeridos, Detalles adicionales.
- Mantener: Trabajador, C.C., Cargo, Fecha registro, Fecha inicio/fin, Hora inicio/fin, No. minutos, No. días, Evento, Motivo.
- **Cálculo automático** de minutos y días desde fechas/horas.
- Alimentar ausentismo también desde **solicitudes aprobadas**.

## 5) Historial integrado (dentro de pestaña B)
- Últimos 5 cambios aprobados + lista de funcionarios que solicitaron + botón "Ver actividad" (historial completo).

---

## Notas técnicas
- Reutilizar componentes existentes (matriz, solicitudes, firmas, config) moviéndolos dentro de las pestañas nuevas — sin reescribir lo que ya sirve.
- No se tocan otros módulos ni el backend salvo que un campo falte (se avisaría antes de migrar).
- Permisos admin/coordinador vs operativo se conservan con `isAdmin`/`canEdit`.

## Orden de ejecución
1. Limpieza Red/IPS (rápido). 2. Export/Import TH-FR-10 real. 3. Modal ausentismo. 4. Consolidación de pestañas + calendario + modal de asignación por bloques. 5. Verificación (build + prueba en preview).