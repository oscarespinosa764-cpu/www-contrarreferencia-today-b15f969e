/**
 * Helpers server-only para Telegram Bot API.
 * NUNCA se importa desde el cliente. El token se lee exclusivamente de
 * `process.env.TELEGRAM_BOT_TOKEN` (Cloud → Secrets) y jamás se devuelve,
 * loguea ni se envía como parte de una respuesta.
 */

const API_BASE = "https://api.telegram.org";

function getBotToken(): string | null {
  const t = process.env.TELEGRAM_BOT_TOKEN;
  return t && t.trim() ? t.trim() : null;
}

export function isTelegramTokenConfigured(): boolean {
  return !!getBotToken();
}

interface TgResponse<T> {
  ok: boolean;
  result?: T;
  description?: string;
  error_code?: number;
  parameters?: { retry_after?: number };
}

async function tgCall<T>(method: string, payload?: Record<string, unknown>): Promise<TgResponse<T>> {
  const token = getBotToken();
  if (!token) return { ok: false, description: "TELEGRAM_BOT_TOKEN no configurado.", error_code: 0 };
  try {
    const resp = await fetch(`${API_BASE}/bot${token}/${method}`, {
      method: payload ? "POST" : "GET",
      headers: { "Content-Type": "application/json" },
      body: payload ? JSON.stringify(payload) : undefined,
    });
    const data = (await resp.json().catch(() => ({}))) as TgResponse<T>;
    // No incluir información sensible (token) en logs
    if (!data.ok) {
      return {
        ok: false,
        description: data.description || `HTTP ${resp.status}`,
        error_code: data.error_code ?? resp.status,
        parameters: data.parameters,
      };
    }
    return data;
  } catch (e) {
    return { ok: false, description: e instanceof Error ? e.message : "Fallo de red", error_code: 0 };
  }
}

/* -------------------- getMe -------------------- */
export interface TgBot {
  id: number;
  username?: string;
  first_name?: string;
  can_join_groups?: boolean;
  can_read_all_group_messages?: boolean;
}
export async function tgGetMe(): Promise<{ ok: boolean; bot?: TgBot; error?: string }> {
  const r = await tgCall<TgBot>("getMe");
  if (!r.ok || !r.result) return { ok: false, error: r.description || "getMe falló" };
  const b = r.result;
  return {
    ok: true,
    bot: {
      id: b.id,
      username: b.username,
      first_name: b.first_name,
      can_join_groups: b.can_join_groups,
      can_read_all_group_messages: b.can_read_all_group_messages,
    },
  };
}

/* -------------------- getUpdates (detección de destinos) -------------------- */
export interface TgDetectedDestination {
  chat_id: string;
  chat_type: "private" | "group" | "supergroup" | "channel" | string;
  chat_title: string | null;
  chat_username: string | null;
  last_date: string | null;
}

interface TgUpdate {
  update_id: number;
  message?: { chat: TgChat; date: number };
  edited_message?: { chat: TgChat; date: number };
  channel_post?: { chat: TgChat; date: number };
  edited_channel_post?: { chat: TgChat; date: number };
  my_chat_member?: { chat: TgChat; date: number };
}
interface TgChat {
  id: number;
  type: string;
  title?: string;
  username?: string;
  first_name?: string;
  last_name?: string;
}

export async function tgGetUpdates(): Promise<{ ok: boolean; destinos: TgDetectedDestination[]; error?: string }> {
  // Timeout=0 (no long-polling), sin offset para no consumir el buffer.
  const r = await tgCall<TgUpdate[]>("getUpdates", { timeout: 0, limit: 100 });
  if (!r.ok || !r.result) return { ok: false, destinos: [], error: r.description };
  const seen = new Map<string, TgDetectedDestination>();
  for (const u of r.result) {
    const evt = u.message ?? u.edited_message ?? u.channel_post ?? u.edited_channel_post ?? u.my_chat_member;
    if (!evt?.chat?.id) continue;
    const key = String(evt.chat.id);
    const title = evt.chat.title || [evt.chat.first_name, evt.chat.last_name].filter(Boolean).join(" ") || null;
    const prev = seen.get(key);
    const iso = new Date((evt.date ?? 0) * 1000).toISOString();
    if (!prev || (prev.last_date && iso > prev.last_date)) {
      seen.set(key, {
        chat_id: key,
        chat_type: evt.chat.type,
        chat_title: title,
        chat_username: evt.chat.username || null,
        last_date: iso,
      });
    }
  }
  return { ok: true, destinos: Array.from(seen.values()) };
}

/* -------------------- sendMessage -------------------- */
export interface TgSendResult {
  ok: boolean;
  message_id?: number;
  error_code?: number;
  description?: string;
  retry_after?: number;
  /** true si el error es permanente (no reintentar): 400 chat not found, 403 bot bloqueado/expulsado */
  permanent?: boolean;
}

export async function tgSendMessage(
  chatId: string,
  text: string,
  opts?: { silent?: boolean; parse_mode?: "HTML" | "MarkdownV2" | null },
): Promise<TgSendResult> {
  const payload: Record<string, unknown> = {
    chat_id: chatId,
    text,
    disable_web_page_preview: true,
  };
  if (opts?.silent) payload.disable_notification = true;
  if (opts?.parse_mode) payload.parse_mode = opts.parse_mode;
  const r = await tgCall<{ message_id: number }>("sendMessage", payload);
  if (r.ok && r.result) return { ok: true, message_id: r.result.message_id };
  const code = r.error_code ?? 0;
  const desc = r.description || "Error desconocido";
  const permanent =
    code === 400 && /chat not found|not enough rights|CHAT_WRITE_FORBIDDEN/i.test(desc)
    || code === 403;
  return {
    ok: false,
    error_code: code,
    description: desc,
    retry_after: r.parameters?.retry_after,
    permanent,
  };
}

/** Enmascara chat_id para logs y UI de no-admin. */
export function maskChatId(chatId: string | null | undefined): string {
  if (!chatId) return "—";
  const s = String(chatId);
  if (s.length <= 4) return "•".repeat(s.length);
  return s.slice(0, 2) + "•".repeat(Math.max(3, s.length - 4)) + s.slice(-2);
}
