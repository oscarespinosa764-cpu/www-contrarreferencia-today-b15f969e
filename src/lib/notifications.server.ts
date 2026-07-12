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

/**
 * Despacha una alerta de coordinación a los canales externos indicados en la regla.
 * Idempotente por (canal + referencia) dentro de la ventana de deduplicación.
 * `supabaseAdmin` se pasa desde el handler para no importar client.server aquí.
 */
export async function despacharAlertaCoordinacion(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseAdmin: any,
  args: DespachoCoordArgs,
): Promise<{ enviados: number; intentados: number }> {
  const seleccion = (args.canales ?? []).filter((c) => c === "telegram" || c === "slack");
  if (seleccion.length === 0) return { enviados: 0, intentados: 0 };

  const { data: canales } = await supabaseAdmin
    .from("notification_channels")
    .select("channel_type, enabled, message_template, bot_token, destination_id, destination_label")
    .eq("enabled", true)
    .in("channel_type", seleccion);

  const lista: any[] = canales ?? []; // eslint-disable-line @typescript-eslint/no-explicit-any
  if (lista.length === 0) return { enviados: 0, intentados: 0 };

  const win = args.dedupMinutes ?? 60;
  const alertType = "ALERTA_COORDINACION";
  let enviados = 0;
  let intentados = 0;

  for (const cfg of lista) {
    if (!cfg.bot_token) continue;
    if (cfg.channel_type === "telegram" && !cfg.destination_id) continue;

    if (args.referenceId) {
      const since = new Date(Date.now() - win * 60000).toISOString();
      const { data: prev } = await supabaseAdmin
        .from("notification_logs")
        .select("id")
        .eq("channel_type", cfg.channel_type)
        .eq("alert_type", alertType)
        .eq("reference_id", args.referenceId)
        .eq("status", "sent")
        .gte("created_at", since)
        .limit(1);
      if (prev && prev.length > 0) continue;
    }

    intentados++;
    const base = cfg.channel_type === "slack" ? PLANTILLA_COORD_SLACK : PLANTILLA_COORD_TELEGRAM;
    let text = renderCoord(base, args.vars);
    if (args.requiereCrue) {
      text += cfg.channel_type === "slack" ? "\n\n:rotating_light: *NOTIFICAR AL CRUE*" : "\n\n🚑 NOTIFICAR AL CRUE";
    }

    const res =
      cfg.channel_type === "slack"
        ? await enviarSlack(cfg.bot_token, text)
        : await enviarTelegram(cfg.bot_token, cfg.destination_id, text);

    const now = new Date().toISOString();
    await supabaseAdmin
      .from("notification_channels")
      .update(
        res.ok
          ? { last_success_at: now, last_error_at: null, last_error_message: null, config_status: "conectado" }
          : { last_error_at: now, last_error_message: res.error || "Error desconocido" },
      )
      .eq("channel_type", cfg.channel_type);

    await supabaseAdmin.from("notification_logs").insert({
      channel_type: cfg.channel_type,
      alert_type: alertType,
      module: args.module || null,
      reference_id: args.referenceId || null,
      recipient: cfg.channel_type === "slack" ? cfg.destination_label || "webhook" : cfg.destination_id,
      message_preview: text.slice(0, 140),
      status: res.ok ? "sent" : "error",
      error_message: res.ok ? null : res.error,
      sent_at: res.ok ? now : null,
      created_by: args.userId,
    });
    if (res.ok) enviados++;
  }

  return { enviados, intentados };
}
