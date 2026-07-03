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
