# Solicitudes y Ausentismo — Implementación completa (aditiva)

Todo se construye SOBRE lo que ya existe. No se rehace el módulo, no se crean sistemas paralelos, no hay migraciones destructivas y se conserva RLS.

## Qué ya existe y se reutiliza
- `shift_requests` (formulario y flujo de aprobación completos), `shift_request_recovery_logs` (bitácora), `shift_absenteeism_records` (Control de Ausentismo), `shift_types` (código→nombre→horario→horas real, ej. `M = Mañana 07:00–14:00 / 7h`), `shift_schedule_days` + `shift_schedule_members` (cuadro mensual real), `profiles`/`user_roles` (usuarios activos).
- Componentes: `solicitud-form-dialog`, `solicitudes-panel` (revisión/aprobación), `ausentismo-panel`, `cuadro-mensual-panel`, y el motor de **Alertas de Coordinación** (`alertas-panel` / reglas).
- Utilidades: `minutosEntreHoras` (ya soporta cruce de medianoche), cálculo de horas, firmas, auditoría (`registrarAuditoria`).

## Cambios de datos (aditivos, sin borrar nada)
1. **Ampliar `shift_requests`** con columnas nuevas (nulas por defecto → compatibles con solicitudes antiguas): `original_shift_name`, `original_start_time`, `original_end_time`, `requested_minutes`, `returned_minutes`, `pending_minutes`, `recovery_status` (`PENDIENTE_VERIFICACION|RECUPERADO|PARCIAL|NO_RECUPERADO|N_A`), `return_fractioned` (bool), `replacement_user_id`, `return_receiver_id`, `is_limit_exempt` (bool), `monthly_exception_id`, `support_path`, `support_metadata` (jsonb).
2. **Tabla hija nueva `shift_return_fragments`** (fracciones + pendientes de verificación en una sola estructura): `request_id`, `fragment_no`, `return_date`, `receiver_id`, `receiver_name`, `receiver_role`, `shift_code`, `start_time`, `end_time`, `minutes`, `notes`, `verification_result`, `verified_by`, `verified_at`, `verification_notes`, `verified_minutes`. Cada fila = una devolución programada y su pendiente de verificación.
3. **Tabla nueva `shift_monthly_exceptions`** (autorizaciones excepcionales): `user_id`, `year`, `month`, `request_type`, `reason`, `counts` (jsonb con solicitudes/coberturas/pendientes), `status` (`PENDIENTE|APROBADA|NEGADA`), `usage_status` (`DISPONIBLE|UTILIZADA|VENCIDA`), `used_request_id`, coordinador/fechas. Índice único parcial: una sola excepción PENDIENTE por (user, año, mes).
4. Cada tabla nueva con GRANTs y RLS: operativo ve/gestiona lo propio (`auth.uid()`), admin/coordinador todo (`has_role`).
5. **Bucket privado de soportes** (`permiso-soportes`, no público) + política de acceso: solo dueño y admin; lectura por URL firmada temporal.

## Fases de implementación

### Fase 1 — Turno real y bloques del formulario
- Bloque **Turno programado del solicitante**: al elegir fecha inicial, leer `shift_schedule_days` del solicitante y resolver nombre/horario/horas desde `shift_types`. Mostrar nombre completo + horario + código en insignia (nunca solo "M").
- **Requiere reemplazo**: `Select` autocomplete de usuarios activos (ya existe la carga de `funcionarios`), autocompletar cargo, mostrar turno/fecha/horario a cubrir. Sin texto libre para registrados.
- **Devolución del tiempo**: receptor desde usuarios activos (sugiere el reemplazo, editable), cargo automático, turno leído del cuadro, con nombre completo + horario; texto guía sobre ajuste por fracción.
- Reutiliza el `Select` global corregido y el scroll invisible ya aplicados.

### Fase 2 — Fracciones y cálculo de horas
- Checkbox **El tiempo se devolverá en varias fracciones**. Sin marcar: una programación. Marcado: lista dinámica `+ AGREGAR FRACCIÓN` (sin límite), cada una con todos los campos y botón eliminar. Se persisten en `shift_return_fragments`.
- Resumen en vivo: **Horas solicitadas / programadas / verificadas / saldo**, recalculando al agregar/editar/eliminar; suma correcta con turnos nocturnos. Advertencia si programadas ≠ solicitadas (permite continuar solo con justificación).

### Fase 3 — Aprobación transaccional + cambio efectivo del cuadro
- Server function que, al **APROBAR**, en una sola operación: marca aprobada, escribe la cobertura en `shift_schedule_days` conservando la programación original (guarda titular/turno/horario originales en la solicitud y registra cobertura con `notes`/`origin` sin sobrescribir destructivamente), crea las fracciones/pendientes, y audita. Muestra en calendario "LUISA — MAÑANA · CUBRE A: OSCAR" y en devolución "OSCAR — MAÑANA · CUBRE A: LUISA".
- Solo cambia el cuadro al aprobar (no en borrador/pendiente/negada/cancelada). Anulación posterior revierte con justificación y auditoría.
- Validaciones previas (13 checks del prompt: turno existente, reemplazo activo/sin conflicto, sin superposición, mes no cerrado, sin duplicados, límite/excepción vigente) con motivo concreto de bloqueo.

### Fase 4 — Verificación, bitácora y alertas
- Panel nuevo **Pendientes de Verificación** (subpestaña dentro de Solicitudes y Ausentismo) alimentado por `shift_return_fragments` sin verificar.
- El día de la devolución se genera alerta **VERIFICAR DEVOLUCIÓN DE TIEMPO** reutilizando **Alertas de Coordinación** (mismo motor, sin crear otro). Acción "Verificar devolución".
- Resultado CUMPLIDA / PARCIAL / NO CUMPLIDA: actualiza saldo, bitácora (`shift_request_recovery_logs` con horarios reales, no códigos; "VERIFICADO POR: PENDIENTE" → nombre), permite reprogramar (nueva fracción) en parcial, y genera alerta administrativa en no cumplida.
- Al verificarse, alimenta **Control de Ausentismo** (`shift_absenteeism_records`) sin duplicar, con estado RECUPERADO/PARCIAL/NO RECUPERADO/PENDIENTE y origen `solicitud_aprobada`.

### Fase 5 — Límite mensual y excepciones
- Server function de conteo por mes calendario: solicitudes propias + coberturas, con reservas por estado (pendiente reserva, aprobada consume, negada/cancelada liberan), 1 conteo por funcionario por solicitud, fracciones no cuentan como varias. Excluye **Cita médica** y **Calamidad**.
- Al presionar **Solicitar** (validado en front y back): si <3 muestra aviso de cupo; si =3 y no exceptuado abre modal **Límite mensual alcanzado** → flujo de **Autorización excepcional** (motivo obligatorio, crea `shift_monthly_exceptions` PENDIENTE sin crear la solicitud ni tocar el cuadro, evita duplicadas).
- Coordinación recibe alerta interna (reutilizada) con acciones APROBAR/NEGAR. Aprobación crea autorización de un solo uso, del funcionario y mes, no transferible; se marca UTILIZADA al usarse y VENCIDA al cerrar el mes.
- **Panel Control Mensual** en Solicitudes y Cambios: por funcionario (solicitudes/coberturas/pendientes/total/disponible/excepciones/exceptuados/estado) con semáforo verde/amarillo/rojo/azul y filtros año/mes/funcionario/cargo/estado. Operativo solo ve lo suyo.

### Fase 6 — Soportes (Cita médica / Calamidad)
- Al seleccionar estos motivos: aviso de soporte obligatorio, no consumen cupo, requieren evidencia. Adjuntar PDF/JPG/JPEG/PNG/WEBP con validación de extensión + MIME + tamaño; sin soporte no se envía.
- Subida a bucket privado; metadata mínima en `support_metadata` (sin diagnósticos). Acceso solo dueño/admin por URL firmada. Nunca base64, nunca en `audit_logs`, nunca por canales externos. Validación también en backend.

### Fase 7 — Historial, PDF, auditoría, roles
- Historial de solicitud con turno completo (nombre+horario), reemplazo, devolución/fracciones, horas/saldo, excepción, soporte con acceso autorizado, verificación y estado de ausentismo.
- PDF oficial (`solicitud-pdf`, bajo demanda, no se guarda) diligencia bitácora con horarios reales y filas por fracción.
- Auditoría de todos los eventos sin datos sensibles. Permisos por rol validados en front y back.

## Notas técnicas
- Lógica de aprobación/anulación y consumo de excepción como `createServerFn` con `requireSupabaseAuth` para atomicidad y control de rol; front solo dispara y refresca queries.
- Se amplían tipos en `cuadro-turno-utils.ts` y helpers de resolución de turno desde `shift_types`.
- Migraciones solo aditivas (ADD COLUMN, CREATE TABLE, GRANT, POLICY). Sin DROP/ALTER destructivo.
- Sin cambios de rutas; todo dentro de `cuadro-turno` y componentes hijos existentes.

## Pruebas clave (del prompt)
Turno M muestra "Mañana"+horario; N cruza medianoche; reemplazo llena cargo; conflicto bloquea; devolución única y en 3 fracciones suman bien; aprobar modifica calendario conservando original; alerta de verificación; bitácora con horas reales; 2 propias+1 cobertura = 3/3; 4ª ordinaria abre modal; excepción de un solo uso y vence; cita médica/calamidad no suman pero exigen soporte; ejecutable renombrado se rechaza; soporte solo visible a autorizados; doble clic no duplica.
