// Helpers server-only para notificaciones externas.
// Contiene la llamada real a Telegram. NUNCA se importa desde el cliente.

export interface TelegramResult {
  ok: boolean;
  error?: string;
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
