import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  renderPlantilla,
  PLANTILLA_TELEGRAM_DEFAULT,
  labelAlerta,
  type PlantillaVars,
} from "./notifications-utils";

const SAFE_COLS =
  "id, channel_type, enabled, display_name, destination_label, destination_id, token_configured, config_status, allowed_alert_types, message_template, settings, last_test_at, last_success_at, last_error_at, last_error_message, updated_at, updated_by";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function esAdmin(supabase: any, userId: string): Promise<boolean> {
  const { data } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  return !!data;
}

/* ------------------------------------------------------------------ */
/* Lectura de canales (sin token) — solo admin.                        */
/* ------------------------------------------------------------------ */
export const getNotificationChannels = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    if (!(await esAdmin(supabase, userId))) return { ok: false, channels: [], error: "No autorizado." };
    const { data, error } = await (supabase as any)
      .from("notification_channels")
      .select(SAFE_COLS);
    if (error) return { ok: false, channels: [], error: "No se pudo leer la configuración." };
    return { ok: true, channels: data ?? [], error: null };
  });

/* ------------------------------------------------------------------ */
/* Guardar configuración de Telegram — solo admin.                     */
/* ------------------------------------------------------------------ */
export const saveTelegramConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    enabled: boolean;
    display_name?: string;
    destination_label?: string;
    destination_id?: string;
    allowed_alert_types: string[];
    message_template?: string;
    new_token?: string; // opcional: solo si se cambia
  }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (!(await esAdmin(supabase, userId))) return { ok: false, error: "No autorizado." };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const patch: Record<string, unknown> = {
      channel_type: "telegram",
      enabled: !!data.enabled,
      display_name: data.display_name || "Telegram CEDIM",
      destination_label: data.destination_label || null,
      destination_id: data.destination_id || null,
      allowed_alert_types: data.allowed_alert_types || [],
      message_template: data.message_template || PLANTILLA_TELEGRAM_DEFAULT,
      updated_by: userId,
    };

    if (data.new_token && data.new_token.trim()) {
      patch.bot_token = data.new_token.trim();
      patch.token_configured = true;
    }

    // Determina estado de configuración.
    const { data: existing } = await (supabaseAdmin as any)
      .from("notification_channels")
      .select("token_configured")
      .eq("channel_type", "telegram")
      .maybeSingle();
    const tokenOk = data.new_token?.trim() ? true : !!existing?.token_configured;
    patch.config_status = tokenOk && data.destination_id ? "configurado" : "sin_configurar";

    const { error } = await (supabaseAdmin as any)
      .from("notification_channels")
      .upsert(patch, { onConflict: "channel_type" });
    if (error) return { ok: false, error: "No se pudo guardar la configuración." };

    return { ok: true, error: null };
  });

/* ------------------------------------------------------------------ */
/* Limpiar token / configuración — solo admin.                         */
/* ------------------------------------------------------------------ */
export const clearTelegramToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { full?: boolean }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (!(await esAdmin(supabase, userId))) return { ok: false, error: "No autorizado." };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const patch: Record<string, unknown> = {
      bot_token: null,
      token_configured: false,
      config_status: "sin_configurar",
      updated_by: userId,
    };
    if (data.full) {
      patch.enabled = false;
      patch.destination_id = null;
      patch.destination_label = null;
    }
    const { error } = await (supabaseAdmin as any)
      .from("notification_channels")
      .update(patch)
      .eq("channel_type", "telegram");
    if (error) return { ok: false, error: "No se pudo limpiar la configuración." };
    return { ok: true, error: null };
  });

/* ------------------------------------------------------------------ */
/* Envío interno reutilizable (lee token con service role).            */
/* ------------------------------------------------------------------ */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function enviarPorTelegram(supabaseAdmin: any, text: string): Promise<{ ok: boolean; error?: string; chatId?: string }> {
  const { data: cfg } = await supabaseAdmin
    .from("notification_channels")
    .select("bot_token, destination_id")
    .eq("channel_type", "telegram")
    .maybeSingle();
  if (!cfg?.bot_token || !cfg?.destination_id)
    return { ok: false, error: "Telegram no tiene token o chat destino configurado." };
  const res = await enviarTelegram(cfg.bot_token, cfg.destination_id, text);
  return { ...res, chatId: cfg.destination_id };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function marcarResultado(supabaseAdmin: any, ok: boolean, error?: string) {
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = ok
    ? { last_success_at: now, last_error_at: null, last_error_message: null, config_status: "conectado" }
    : { last_error_at: now, last_error_message: error || "Error desconocido" };
  await supabaseAdmin.from("notification_channels").update(patch).eq("channel_type", "telegram");
}

/* ------------------------------------------------------------------ */
/* Probar conexión real — solo admin.                                  */
/* ------------------------------------------------------------------ */
export const testTelegramConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    if (!(await esAdmin(supabase, userId))) return { ok: false, error: "No autorizado." };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: prof } = await (supabase as any).from("profiles").select("nombre").eq("user_id", userId).maybeSingle();
    const fecha = new Date().toLocaleString("es-CO");
    const text =
      `✅ PRUEBA DE CONEXIÓN CEDIM IPS\nCanal: Telegram\nEstado: Configuración activa\nUsuario: ${prof?.nombre || "Administrador"}\nFecha/hora: ${fecha}`;

    const res = await enviarPorTelegram(supabaseAdmin, text);
    await supabaseAdmin
      .from("notification_channels")
      .update({ last_test_at: new Date().toISOString() })
      .eq("channel_type", "telegram");
    await marcarResultado(supabaseAdmin, res.ok, res.error);

    await supabaseAdmin.from("notification_logs").insert({
      channel_type: "telegram",
      alert_type: "AVISO_MANUAL",
      module: "control_mando",
      recipient: res.chatId ?? null,
      message_preview: "Prueba de conexión",
      status: res.ok ? "sent" : "error",
      error_message: res.ok ? null : res.error,
      sent_at: res.ok ? new Date().toISOString() : null,
      created_by: userId,
    });

    return { ok: res.ok, error: res.ok ? null : res.error };
  });

/* ------------------------------------------------------------------ */
/* Envío manual — solo admin.                                          */
/* ------------------------------------------------------------------ */
export const sendManualNotification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { alert_type: string; module?: string; priority: string; message: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (!(await esAdmin(supabase, userId))) return { ok: false, error: "No autorizado." };
    if (!data.message?.trim()) return { ok: false, error: "El mensaje es obligatorio." };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: prof } = await (supabase as any).from("profiles").select("nombre").eq("user_id", userId).maybeSingle();
    const prefijo = data.priority === "Crítico" ? "🚨" : data.priority === "Alerta" ? "⚠️" : "ℹ️";
    const text =
      `${prefijo} AVISO CEDIM IPS\nTipo: ${labelAlerta(data.alert_type)}\n${data.module ? `Módulo: ${data.module}\n` : ""}Prioridad: ${data.priority}\n\n${data.message.trim()}\n\nEnviado por: ${prof?.nombre || "Administrador"}`;

    const res = await enviarPorTelegram(supabaseAdmin, text);
    await marcarResultado(supabaseAdmin, res.ok, res.error);

    await supabaseAdmin.from("notification_logs").insert({
      channel_type: "telegram",
      alert_type: data.alert_type,
      module: data.module || "control_mando",
      recipient: res.chatId ?? null,
      message_preview: data.message.trim().slice(0, 140),
      status: res.ok ? "sent" : "error",
      error_message: res.ok ? null : res.error,
      sent_at: res.ok ? new Date().toISOString() : null,
      created_by: userId,
    });

    return { ok: res.ok, error: res.ok ? null : res.error };
  });

/* ------------------------------------------------------------------ */
/* Despacho por eventos — cualquier miembro activo puede disparar.     */
/* Verifica canal activo, tipo habilitado y control de duplicados.     */
/* ------------------------------------------------------------------ */
export const dispatchEventNotification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    alert_type: string;
    module?: string;
    reference_id?: string;
    vars: PlantillaVars;
    dedup_minutes?: number;
  }) => d)
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: cfg } = await (supabaseAdmin as any)
      .from("notification_channels")
      .select("enabled, allowed_alert_types, message_template, bot_token, destination_id")
      .eq("channel_type", "telegram")
      .maybeSingle();

    if (!cfg?.enabled) return { ok: false, status: "skipped", reason: "Telegram inactivo." };
    const allowed: string[] = Array.isArray(cfg.allowed_alert_types) ? cfg.allowed_alert_types : [];
    if (!allowed.includes(data.alert_type)) return { ok: false, status: "skipped", reason: "Tipo de alerta no habilitado." };
    if (!cfg.bot_token || !cfg.destination_id) return { ok: false, status: "skipped", reason: "Sin token o destino." };

    // Control de duplicados: mismo tipo + referencia dentro de la ventana.
    const win = data.dedup_minutes ?? 30;
    if (data.reference_id) {
      const since = new Date(Date.now() - win * 60000).toISOString();
      const { data: prev } = await (supabaseAdmin as any)
        .from("notification_logs")
        .select("id")
        .eq("channel_type", "telegram")
        .eq("alert_type", data.alert_type)
        .eq("reference_id", data.reference_id)
        .eq("status", "sent")
        .gte("created_at", since)
        .limit(1);
      if (prev && prev.length > 0) {
        return { ok: false, status: "duplicate", reason: "Envío reciente omitido." };
      }
    }

    const vars: PlantillaVars = {
      ...data.vars,
      tipo_alerta: data.vars.tipo_alerta || labelAlerta(data.alert_type),
      fecha_hora: data.vars.fecha_hora || new Date().toLocaleString("es-CO"),
    };
    const text = renderPlantilla(cfg.message_template || PLANTILLA_TELEGRAM_DEFAULT, vars);

    const res = await enviarTelegram(cfg.bot_token, cfg.destination_id, text);
    await marcarResultado(supabaseAdmin, res.ok, res.error);

    await supabaseAdmin.from("notification_logs").insert({
      channel_type: "telegram",
      alert_type: data.alert_type,
      module: data.module || null,
      reference_id: data.reference_id || null,
      recipient: cfg.destination_id,
      message_preview: text.slice(0, 140),
      status: res.ok ? "sent" : "error",
      error_message: res.ok ? null : res.error,
      sent_at: res.ok ? new Date().toISOString() : null,
      created_by: userId,
    });

    return { ok: res.ok, status: res.ok ? "sent" : "error", reason: res.error };
  });

/* ------------------------------------------------------------------ */
/* Historial de envíos — solo admin.                                   */
/* ------------------------------------------------------------------ */
export const getNotificationLogs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    if (!(await esAdmin(supabase, userId))) return { ok: false, logs: [], error: "No autorizado." };
    const { data, error } = await (supabase as any)
      .from("notification_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) return { ok: false, logs: [], error: "No se pudo leer el historial." };
    return { ok: true, logs: data ?? [], error: null };
  });
