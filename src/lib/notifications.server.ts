// Helpers server-only para notificaciones externas.
// Contiene las llamadas reales a Telegram y Slack. NUNCA se importa desde el cliente.

export interface TelegramResult {
  ok: boolean;
  error?: string;
}

export type SlackResult = TelegramResult;

/**
 * Envía un mensaje real a Slack usando un Incoming Webhook (gratis, sin proveedor de pago).
 * La URL del webhook es el secreto y nunca se registra ni se devuelve al cliente.
 * El canal de destino queda definido por el propio webhook.
 */
export async function enviarSlack(webhookUrl: string, text: string): Promise<SlackResult> {
  if (!webhookUrl) return { ok: false, error: "Webhook de Slack no configurado." };
  if (!/^https:\/\/hooks\.slack\.com\//.test(webhookUrl)) {
    return { ok: false, error: "La URL no parece un Incoming Webhook de Slack válido." };
  }
  try {
    const resp = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    const body = (await resp.text().catch(() => "")).trim();
    if (!resp.ok || (body && body !== "ok")) {
      return { ok: false, error: body || `Error HTTP ${resp.status}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Fallo de red" };
  }
}

/**
 * Envía un mensaje real a Telegram usando la Bot API (gratis, sin proveedor de pago).
 * El token nunca se registra ni se devuelve al cliente.
 */
export async function enviarTelegram(
  botToken: string,
  chatId: string,
  text: string,
): Promise<TelegramResult> {
  if (!botToken || !chatId) return { ok: false, error: "Configuración incompleta." };
  try {
    const resp = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
    });
    const data = (await resp.json().catch(() => ({}))) as { ok?: boolean; description?: string };
    if (!resp.ok || !data.ok) {
      // No exponer token; solo la descripción de Telegram.
      return { ok: false, error: data.description || `Error HTTP ${resp.status}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Fallo de red" };
  }
}

// ---------------------------------------------------------------------------
// Despacho de ALERTAS DE COORDINACIÓN a canales externos, por regla.
// Reutiliza los canales configurados (Telegram/Slack) y el registro en
// notification_logs. Solo se envía a los canales seleccionados en la regla
// que además estén habilitados y correctamente configurados.
// NUNCA se importa desde el cliente (archivo *.server.ts).
// ---------------------------------------------------------------------------
export interface DespachoCoordVars {
  tipo_alerta?: string;
  modulo?: string;
  paciente_iniciales?: string;
  documento_enmascarado?: string;
  codigo?: string;
  estado?: string;
  accion?: string;
  fecha_hora?: string;
}

export interface DespachoCoordArgs {
  canales: string[];
  requiereCrue: boolean;
  vars: DespachoCoordVars;
  referenceId?: string | null;
  module?: string | null;
  userId: string;
  dedupMinutes?: number;
}

const PLANTILLA_COORD_TELEGRAM =
  "🚨 ALERTA DE COORDINACIÓN · CEDIM IPS\nTipo: {{tipo_alerta}}\nMódulo: {{modulo}}\nCódigo caso: {{codigo}}\nEstado: {{estado}}\nAcción: {{accion}}\nFecha/hora: {{fecha_hora}}";
const PLANTILLA_COORD_SLACK =
  "*🚨 ALERTA DE COORDINACIÓN · CEDIM IPS*\n*Tipo:* {{tipo_alerta}}\n*Módulo:* {{modulo}}\n*Código caso:* {{codigo}}\n*Estado:* {{estado}}\n*Acción:* {{accion}}\n*Fecha/hora:* {{fecha_hora}}";

function renderCoord(tpl: string, vars: DespachoCoordVars): string {
  let out = tpl;
  const keys: (keyof DespachoCoordVars)[] = [
    "tipo_alerta", "modulo", "paciente_iniciales", "documento_enmascarado",
    "codigo", "estado", "accion", "fecha_hora",
  ];
  for (const k of keys) out = out.replaceAll(`{{${k}}}`, (vars[k] ?? "").toString());
  out = out.replace(/\{\{[^}]+\}\}/g, "");
  return out
    .split("\n")
    .map((l) => l.trimEnd())
    .filter((l, i, arr) => !(l === "" && arr[i - 1] === ""))
    .join("\n")
    .trim();
}

/* -------------------------------------------------------------------------
 * Etapa 4 — Despacho automático de ALERTAS DE COORDINACIÓN.
 *
 * Aplica TODOS los filtros del destino antes de enviar:
 *   1. destino habilitado
 *   2. tipo de alerta permitido (allowed_alert_types)
 *   3. prioridad permitida (allowed_priorities)
 *   4. módulo permitido (allowed_modules)
 *   5. horario permitido (schedule)
 *   6. idempotencia por (channel_id + alert_type + reference_id) en logs
 *
 * Sanitiza los mensajes para NUNCA incluir PHI (nombre, documento,
 * diagnóstico, observaciones clínicas). Los errores 400/403 de Telegram
 * se marcan permanentes (sin reintento). Los errores temporales fijan
 * next_retry_at con backoff exponencial.
 * ----------------------------------------------------------------------- */

function mapPrioridad(p?: string | null): string {
  const v = (p ?? "").toUpperCase();
  if (v === "CRITICO" || v === "CRÍTICO") return "Crítico";
  if (v === "ALTO") return "Alerta";
  if (v === "BAJO" || v === "MEDIO") return "Informativo";
  return p ?? "";
}

function mapModulo(mod?: string | null, subventana?: string | null): string {
  const s = (subventana ?? "").toUpperCase();
  if (s === "ENTRANTES") return "entrantes";
  if (s === "SALIENTES") return "salientes";
  const m = (mod ?? "").toLowerCase();
  if (m.includes("phd")) return "phd";
  if (m.includes("cuadro") || m.includes("turno")) return "cuadro_turno";
  if (m.includes("coord")) return "coordinacion";
  return m || "otros";
}

// schedule = { enabled?, days?[0..6], start?"HH:MM", end?"HH:MM", tz? }.
function dentroDeHorario(schedule: unknown): boolean {
  const s = (schedule ?? {}) as {
    enabled?: boolean; days?: number[]; start?: string; end?: string; tz?: string;
  };
  if (!s || typeof s !== "object" || !s.enabled) return true;
  const tz = s.tz ?? "America/Bogota";
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(new Date());
  const wdMap: Record<string, number> = { Sun:0, Mon:1, Tue:2, Wed:3, Thu:4, Fri:5, Sat:6 };
  const wd = wdMap[parts.find((p) => p.type === "weekday")?.value ?? "Mon"] ?? 1;
  const hh = parts.find((p) => p.type === "hour")?.value ?? "00";
  const mm = parts.find((p) => p.type === "minute")?.value ?? "00";
  const nowMin = parseInt(hh, 10) * 60 + parseInt(mm, 10);
  if (Array.isArray(s.days) && s.days.length > 0 && !s.days.includes(wd)) return false;
  const toMin = (t?: string) => {
    if (!t) return null;
    const m = /^(\d{1,2}):(\d{2})$/.exec(t);
    return m ? parseInt(m[1], 10) * 60 + parseInt(m[2], 10) : null;
  };
  const a = toMin(s.start); const b = toMin(s.end);
  if (a == null || b == null) return true;
  return a <= b ? nowMin >= a && nowMin <= b : nowMin >= a || nowMin <= b;
}

// Solo campos NO clínicos. Cualquier PHI recibida por error se descarta.
function sanitizarVars(vars: DespachoCoordVars): Required<Pick<DespachoCoordVars,
  "tipo_alerta" | "modulo" | "codigo" | "estado" | "accion" | "fecha_hora">> {
  const clip = (v?: string) => (v ?? "").toString().slice(0, 140).replace(/[\u0000-\u001F\u007F]/g, " ").trim();
  return {
    tipo_alerta: clip(vars.tipo_alerta),
    modulo: clip(vars.modulo),
    codigo: clip(vars.codigo),
    estado: clip(vars.estado),
    accion: clip(vars.accion),
    fecha_hora: clip(vars.fecha_hora) || new Date().toLocaleString("es-CO"),
  };
}

function backoffProximo(intentos: number): string {
  const escalones = [1, 5, 15, 60]; // minutos
  const min = escalones[Math.min(intentos, escalones.length - 1)];
  return new Date(Date.now() + min * 60_000).toISOString();
}

export async function despacharAlertaCoordinacion(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseAdmin: any,
  args: DespachoCoordArgs & { prioridad?: string | null; subventana?: string | null },
): Promise<{ enviados: number; intentados: number; motivos: string[] }> {
  const motivos: string[] = [];
  const seleccion = (args.canales ?? []).filter((c) => c === "telegram" || c === "slack");
  if (seleccion.length === 0) return { enviados: 0, intentados: 0, motivos: ["sin_canales_regla"] };

  const { data: canales } = await supabaseAdmin
    .from("notification_channels")
    .select("id, channel_type, enabled, bot_token, destination_id, destination_label, allowed_alert_types, allowed_priorities, allowed_modules, schedule, silent")
    .eq("enabled", true)
    .in("channel_type", seleccion);

  const lista = (canales ?? []) as Array<Record<string, unknown>>;
  if (lista.length === 0) return { enviados: 0, intentados: 0, motivos: ["sin_destinos_activos"] };

  const alertType = "ALERTA_COORDINACION";
  const prioLabel = mapPrioridad(args.prioridad);
  const moduloDest = mapModulo(args.module, args.subventana);
  const varsSeguras = sanitizarVars(args.vars);

  let enviados = 0;
  let intentados = 0;

  for (const cfg of lista) {
    const chId = cfg.id as string;
    const chType = cfg.channel_type as string;
    const chSilent = !!cfg.silent;
    const allowedTypes = (Array.isArray(cfg.allowed_alert_types) ? cfg.allowed_alert_types : []) as string[];
    const allowedPrios = (Array.isArray(cfg.allowed_priorities) ? cfg.allowed_priorities : []) as string[];
    const allowedMods = (Array.isArray(cfg.allowed_modules) ? cfg.allowed_modules : []) as string[];

    if (allowedTypes.length > 0 && !allowedTypes.includes(alertType)) {
      motivos.push(`${chId}:tipo_no_permitido`); continue;
    }
    if (allowedPrios.length > 0 && prioLabel && !allowedPrios.includes(prioLabel)) {
      motivos.push(`${chId}:prioridad_no_permitida`); continue;
    }
    if (allowedMods.length > 0 && !allowedMods.includes(moduloDest)) {
      motivos.push(`${chId}:modulo_no_permitido`); continue;
    }
    if (!dentroDeHorario(cfg.schedule)) {
      motivos.push(`${chId}:fuera_de_horario`); continue;
    }

    const idemKey = args.referenceId ? `${chId}:${alertType}:${args.referenceId}` : null;
    if (idemKey) {
      const { data: prev } = await supabaseAdmin
        .from("notification_logs")
        .select("id")
        .eq("idempotency_key", idemKey)
        .eq("status", "sent")
        .limit(1);
      if (prev && prev.length > 0) {
        motivos.push(`${chId}:duplicado`); continue;
      }
    }

    intentados++;

    let res: { ok: boolean; error?: string; permanent?: boolean; retry_after?: number; error_code?: number };
    if (chType === "telegram") {
      const destId = cfg.destination_id as string | null;
      if (!destId) { motivos.push(`${chId}:sin_destino`); continue; }
      const { tgSendMessage, isTelegramTokenConfigured } = await import("./telegram.server");
      if (!isTelegramTokenConfigured()) {
        res = { ok: false, error: "TELEGRAM_BOT_TOKEN no configurado", permanent: true };
      } else {
        const text = renderCoord(PLANTILLA_COORD_TELEGRAM, varsSeguras) + (args.requiereCrue ? "\n\n🚑 NOTIFICAR AL CRUE" : "");
        const r = await tgSendMessage(destId, text, { silent: chSilent });
        res = { ok: r.ok, error: r.description, permanent: r.permanent, retry_after: r.retry_after, error_code: r.error_code };
      }
    } else {
      const token = cfg.bot_token as string | null;
      if (!token) { motivos.push(`${chId}:sin_webhook`); continue; }
      const text = renderCoord(PLANTILLA_COORD_SLACK, varsSeguras) + (args.requiereCrue ? "\n\n:rotating_light: *NOTIFICAR AL CRUE*" : "");
      res = await enviarSlack(token, text);
    }

    const now = new Date().toISOString();
    await supabaseAdmin
      .from("notification_channels")
      .update(
        res.ok
          ? { last_success_at: now, last_error_at: null, last_error_message: null, config_status: "conectado" }
          : { last_error_at: now, last_error_message: (res.error || "Error").slice(0, 200) },
      )
      .eq("id", chId);

    let logStatus: "sent" | "error" | "retry";
    let nextRetry: string | null = null;
    if (res.ok) logStatus = "sent";
    else if (res.permanent || (res.error_code && [400, 401, 403].includes(res.error_code))) logStatus = "error";
    else {
      logStatus = "retry";
      nextRetry = res.retry_after ? new Date(Date.now() + res.retry_after * 1000).toISOString() : backoffProximo(1);
    }

    await supabaseAdmin.from("notification_logs").insert({
      channel_id: chId,
      channel_type: chType,
      alert_type: alertType,
      module: moduloDest,
      reference_id: args.referenceId || null,
      idempotency_key: idemKey,
      recipient: chType === "slack" ? (cfg.destination_label as string) || "webhook" : (cfg.destination_id as string),
      message_preview: renderCoord(PLANTILLA_COORD_TELEGRAM, varsSeguras).slice(0, 140),
      status: logStatus,
      error_message: res.ok ? null : `[${res.error_code ?? 0}] ${(res.error ?? "").slice(0, 180)}`,
      sent_at: res.ok ? now : null,
      next_retry_at: nextRetry,
      created_by: args.userId,
    });
    if (res.ok) enviados++;
  }

  return { enviados, intentados, motivos };
}
