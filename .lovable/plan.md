## Contexto verificado (no se modifica lo existente)

Ya existe infraestructura reutilizable — se aprovecha íntegra:

- Tabla `notification_channels` (con `bot_token`, `destination_id`, `allowed_alert_types`, `message_template`, `enabled`, `config_status`, `last_*`).
- Tabla `notification_logs` (con `alert_type`, `module`, `reference_id`, `recipient`, `status`, `sent_at`, `created_by`).
- Server functions en `src/lib/notifications.functions.ts`: `getNotificationChannels`, `saveChannelConfig`, `clearChannelToken`, `testChannelConnection`, `sendManualNotification`, `dispatchEventNotification`, `getNotificationLogs`.
- Helpers server-only en `src/lib/notifications.server.ts` (`enviarTelegram` ya llama `sendMessage`).
- Panel `NotificacionesExternasPanel` en Control de Mando.
- Motor de alertas en `alertas-coordinacion.functions.ts` + evaluador cron.

**Limitación detectada:** `notification_channels` hoy es 1 fila por `channel_type` (upsert por `channel_type`). Para soportar **varios destinos Telegram** (grupo Coordinación, grupo Red, grupo Admin) se necesita permitir múltiples filas por tipo. Se hace con migración no destructiva.

**Decisión de arquitectura:** El token del bot deja de vivir en `notification_channels.bot_token` para Telegram y pasa a leerse **solo** desde el Secret `TELEGRAM_BOT_TOKEN`. Cada fila Telegram guarda únicamente el destino (chat_id + metadatos). Slack (webhook por canal) permanece como está — no se toca.

## Ejecución progresiva (según sección 15 del prompt)

### Etapa 1 — Secret + esquema multi-destino (esta iteración)

1. Solicitar `TELEGRAM_BOT_TOKEN` vía `add_secret`.
2. Migración:
   - Quitar el constraint `UNIQUE(channel_type)` en `notification_channels`.
   - Añadir columnas: `chat_type` (private/group/supergroup/channel), `allowed_priorities text[]`, `allowed_modules text[]`, `schedule jsonb`, `silent bool`, `created_by uuid`.
   - Añadir índice compuesto `(channel_type, enabled)`.
   - Para Telegram, `bot_token` deja de usarse (se ignora en el nuevo flujo; se mantiene la columna por compatibilidad con Slack).
   - Migrar la fila Telegram existente (si existe): conservarla como primer destino.
3. Ajustar RLS: los admin siguen viendo todo; añadir GRANTs si falta.

### Etapa 2 — Edge function `telegram-bot` (una sola, multi-acción)

Nueva Edge Function en `supabase/functions/telegram-bot/index.ts` que expone acciones internas (invocada solo desde server functions con service role, nunca desde React):

- `getMe` — valida token, devuelve `id/username/first_name` (sin token).
- `getUpdates` — corre una sola vez, devuelve lista de destinos únicos (`chat.id/type/title/username/last_date`); no guarda nada.
- `sendMessage` — envía a un `chat_id` concreto, respeta `retry_after` de Telegram, devuelve `{ok, message_id, error_code, description}` sanitizado.

El token se lee **solo** con `Deno.env.get("TELEGRAM_BOT_TOKEN")`. Nunca sale de la función.

### Etapa 3 — Server functions Telegram (admin-only)

En un nuevo archivo `src/lib/telegram.functions.ts` (para no inflar `notifications.functions.ts`), todas con `requireSupabaseAuth` + verificación admin:

- `telegramStatus()` → `{token_configured, bot_username, destinos_count}`.
- `telegramValidateBot()` → llama `getMe`, guarda auditoría `TELEGRAM_BOT_VALIDATED`.
- `telegramDetectDestinations()` → llama `getUpdates`, devuelve lista candidata (no persiste).
- `telegramSaveDestination({display_name, chat_id, chat_type, chat_title, description, allowed_alert_types, allowed_priorities, allowed_modules, schedule, silent, enabled})` → inserta/actualiza fila `channel_type='telegram'`.
- `telegramDeleteDestination(id)`, `telegramToggleDestination(id, enabled)`.
- `telegramSendTest(id)` → envía mensaje canónico de prueba (sin PHI), registra log + auditoría.
- `telegramListDestinations()` → devuelve destinos con `chat_id` enmascarado para no-admin (los admin ven completo).
- `telegramResendAlert(log_id, motivo)` → reenvío autorizado con auditoría.

### Etapa 4 — Adaptar despacho de eventos

Modificar `dispatchEventNotification` y `despacharAlertaCoordinacion` para Telegram:

- Iterar sobre **todos** los destinos Telegram habilitados (no una única fila).
- Filtrar por `allowed_alert_types` **y** `allowed_priorities` **y** `allowed_modules` **y** `schedule` de cada destino.
- Idempotencia: `idempotency_key = alert_type + reference_id + destino_id + version`. Añadir columna `idempotency_key text` + índice único parcial en `notification_logs` para status='sent'.
- Reintentos: si Telegram devuelve `retry_after`, marcar `REINTENTO` con `next_retry_at`. Errores de permisos (403 bot expulsado, 400 chat not found) → `FALLIDA` sin reintentar, alerta al admin.
- Estados en logs: `pending/sent/error/retry/discarded`.
- Enviar **solo por Edge Function** (nada desde el navegador).

### Etapa 5 — UI en Control de Mando → Notificaciones externas

Rediseñar la sección Telegram de `notificaciones-externas-panel.tsx`:

- Card superior: estado (`TOKEN CONFIGURADO: SÍ/NO`, bot username, destinos activos, última prueba, último error).
- Botones: **Validar bot**, **Detectar destinos**, **Agregar destino manual**, **Desactivar todo**.
- Tabla de destinos: nombre, tipo (PRIVATE/GROUP/SUPERGROUP/CHANNEL), chat_id enmascarado, tipos permitidos, prioridades permitidas, módulos, estado, última prueba. Acciones por fila: **Probar**, **Editar**, **Habilitar/Deshabilitar**, **Eliminar**.
- Diálogo "Detectar destinos": muestra instrucciones (agregar bot, enviar mensaje, presionar detectar), lista resultado de `getUpdates` con botón *Agregar como destino*.
- Diálogo "Editar destino": selectores múltiples para tipos de alerta / prioridades / módulos, horario, silencioso, enlace.
- **En ningún momento** se muestra el token; solo `TOKEN CONFIGURADO: SÍ/NO`.

### Etapa 6 — Auditoría + pruebas guiadas

- Registrar en `audit_logs` cada acción (`TELEGRAM_BOT_VALIDATED`, `TELEGRAM_DESTINATION_CREATED/UPDATED/DISABLED`, `TELEGRAM_TEST_SENT`, `TELEGRAM_ALERT_SENT/FAILED`, `TELEGRAM_RULE_LINKED/UNLINKED`, `TELEGRAM_RESEND`). Nunca token ni PHI.
- Ejecutar en preview las pruebas 1–4 del prompt (token ausente / válido / grupo / canal sin permisos) y reportar.
- Confirmar antes de activar despacho automático de alertas reales.

## Alcance explícitamente EXCLUIDO

- Sin Zapier / Make / n8n / WhatsApp / otros.
- Sin webhook de Telegram (solo `sendMessage` saliente + `getUpdates` manual).
- Sin llamadas a Telegram desde React.
- Sin exponer token en frontend, tablas, logs ni respuestas.
- Sin crear un segundo motor de alertas o segunda tabla de reglas.
- Slack, correo, avisos operativos, motor clínico: no se tocan.

## Confirmación necesaria

Voy a ejecutar **Etapa 1 + Etapa 2 + Etapa 3** en la siguiente iteración (secret, migración, edge function, server functions y auditoría), sin activar despacho automático. Etapa 4 (adaptación del despacho) y Etapa 5 (UI de detección/gestión multi-destino) van en una segunda iteración una vez validemos `getMe` y detectemos el primer grupo. Etapa 6 al final.

¿Sigo con esta secuencia?
