import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  renderPlantilla,
  plantillaPorCanal,
  labelAlerta,
  sanitizarMensajeManual,
  type PlantillaVars,
} from "./notifications-utils";

const SAFE_COLS =
  "id, channel_type, enabled, display_name, destination_label, destination_id, token_configured, config_status, allowed_alert_types, message_template, settings, last_test_at, last_success_at, last_error_at, last_error_message, updated_at, updated_by";

const CANALES_ACTIVOS = ["telegram", "slack"] as const;
type CanalActivo = (typeof CANALES_ACTIVOS)[number];

function esCanalValido(t: string): t is CanalActivo {
  return (CANALES_ACTIVOS as readonly string[]).includes(t);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function esAdmin(supabase: any, userId: string): Promise<boolean> {
  const { data } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  return !!data;
}

/* ------------------------------------------------------------------ */
/* Envío real según el tipo de canal (lee token/webhook server-side).  */
/* ------------------------------------------------------------------ */
interface CanalCfg {
  channel_type: string;
  bot_token?: string | null;
  destination_id?: string | null;
  destination_label?: string | null;
}

async function enviarPorCanal(
  cfg: CanalCfg,
  text: string,
): Promise<{ ok: boolean; error?: string; recipient?: string | null }> {
  if (cfg.channel_type === "telegram") {
    if (!cfg.bot_token || !cfg.destination_id)
      return { ok: false, error: "Telegram sin token o destino configurado." };
    const { enviarTelegram } = await import("./notifications.server");
    const r = await enviarTelegram(cfg.bot_token, cfg.destination_id, text);
    return { ...r, recipient: cfg.destination_id };
  }
  if (cfg.channel_type === "slack") {
    if (!cfg.bot_token) return { ok: false, error: "Slack sin webhook configurado." };
    const { enviarSlack } = await import("./notifications.server");
    const r = await enviarSlack(cfg.bot_token, text);
    return { ...r, recipient: cfg.destination_label || "webhook" };
  }
  return { ok: false, error: "Canal no soportado." };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function marcarResultado(supabaseAdmin: any, channelType: string, ok: boolean, error?: string) {
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = ok
    ? { last_success_at: now, last_error_at: null, last_error_message: null, config_status: "conectado" }
    : { last_error_at: now, last_error_message: error || "Error desconocido" };
  await supabaseAdmin.from("notification_channels").update(patch).eq("channel_type", channelType);
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
/* Guardar configuración de un canal (Telegram/Slack) — solo admin.    */
/* Para Slack, new_token es la URL del Incoming Webhook.               */
/* ------------------------------------------------------------------ */
export const saveChannelConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    channel_type: string;
    enabled: boolean;
    display_name?: string;
    destination_label?: string;
    destination_id?: string;
    allowed_alert_types: string[];
    message_template?: string;
    new_token?: string; // token (Telegram) o URL de webhook (Slack)
  }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (!(await esAdmin(supabase, userId))) return { ok: false, error: "No autorizado." };
    if (!esCanalValido(data.channel_type)) return { ok: false, error: "Canal no soportado." };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const nombrePorDefecto = data.channel_type === "slack" ? "Slack CEDIM" : "Telegram CEDIM";
    const patch: Record<string, unknown> = {
      channel_type: data.channel_type,
      enabled: !!data.enabled,
      display_name: data.display_name || nombrePorDefecto,
      destination_label: data.destination_label || null,
      destination_id: data.destination_id || null,
      allowed_alert_types: data.allowed_alert_types || [],
      message_template: data.message_template || plantillaPorCanal(data.channel_type),
      updated_by: userId,
    };

    if (data.new_token && data.new_token.trim()) {
      patch.bot_token = data.new_token.trim();
      patch.token_configured = true;
    }

    const { data: existing } = await (supabaseAdmin as any)
      .from("notification_channels")
      .select("token_configured")
      .eq("channel_type", data.channel_type)
      .maybeSingle();
    const tokenOk = data.new_token?.trim() ? true : !!existing?.token_configured;
    // Slack no requiere destination_id (el webhook ya apunta al canal).
    const destinoOk = data.channel_type === "slack" ? true : !!data.destination_id;
    patch.config_status = tokenOk && destinoOk ? "configurado" : "sin_configurar";

    const { error } = await (supabaseAdmin as any)
      .from("notification_channels")
      .upsert(patch, { onConflict: "channel_type" });
    if (error) return { ok: false, error: "No se pudo guardar la configuración." };

    return { ok: true, error: null };
  });

/* ------------------------------------------------------------------ */
/* Limpiar token/webhook o configuración de un canal — solo admin.     */
/* ------------------------------------------------------------------ */
export const clearChannelToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { channel_type: string; full?: boolean }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (!(await esAdmin(supabase, userId))) return { ok: false, error: "No autorizado." };
    if (!esCanalValido(data.channel_type)) return { ok: false, error: "Canal no soportado." };
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
      .eq("channel_type", data.channel_type);
    if (error) return { ok: false, error: "No se pudo limpiar la configuración." };
    return { ok: true, error: null };
  });

/* ------------------------------------------------------------------ */
/* Probar conexión real de un canal — solo admin.                      */
/* ------------------------------------------------------------------ */
export const testChannelConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { channel_type: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (!(await esAdmin(supabase, userId))) return { ok: false, error: "No autorizado." };
    if (!esCanalValido(data.channel_type)) return { ok: false, error: "Canal no soportado." };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: cfg } = await (supabaseAdmin as any)
      .from("notification_channels")
      .select("channel_type, bot_token, destination_id, destination_label")
      .eq("channel_type", data.channel_type)
      .maybeSingle();

    const { data: prof } = await (supabase as any).from("profiles").select("nombre").eq("user_id", userId).maybeSingle();
    const fecha = new Date().toLocaleString("es-CO");
    const canalLabel = data.channel_type === "slack" ? "Slack" : "Telegram";
    const text =
      `✅ PRUEBA DE CONEXIÓN CEDIM IPS\nCanal: ${canalLabel}\nEstado: Configuración activa\nUsuario: ${prof?.nombre || "Administrador"}\nFecha/hora: ${fecha}`;

    const res = cfg
      ? await enviarPorCanal(cfg, text)
      : { ok: false, error: "Canal sin configuración." };

    await supabaseAdmin
      .from("notification_channels")
      .update({ last_test_at: new Date().toISOString() })
      .eq("channel_type", data.channel_type);
    await marcarResultado(supabaseAdmin, data.channel_type, res.ok, res.error);

    await supabaseAdmin.from("notification_logs").insert({
      channel_type: data.channel_type,
      alert_type: "AVISO_MANUAL",
      module: "control_mando",
      recipient: res.recipient ?? null,
      message_preview: "Prueba de conexión",
      status: res.ok ? "sent" : "error",
      error_message: res.ok ? null : res.error,
      sent_at: res.ok ? new Date().toISOString() : null,
      created_by: userId,
    });

    return { ok: res.ok, error: res.ok ? null : res.error };
  });

/* ------------------------------------------------------------------ */
/* Envío manual a todos los canales activos y configurados — admin.    */
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

    const { data: canales } = await (supabaseAdmin as any)
      .from("notification_channels")
      .select("channel_type, enabled, bot_token, destination_id, destination_label")
      .eq("enabled", true)
      .in("channel_type", CANALES_ACTIVOS as unknown as string[]);

    const lista: CanalCfg[] = canales ?? [];
    if (lista.length === 0) return { ok: false, error: "No hay canales activos configurados." };

    let algunoOk = false;
    const errores: string[] = [];
    for (const cfg of lista) {
      const res = await enviarPorCanal(cfg, text);
      await marcarResultado(supabaseAdmin, cfg.channel_type, res.ok, res.error);
      await supabaseAdmin.from("notification_logs").insert({
        channel_type: cfg.channel_type,
        alert_type: data.alert_type,
        module: data.module || "control_mando",
        recipient: res.recipient ?? null,
        message_preview: data.message.trim().slice(0, 140),
        status: res.ok ? "sent" : "error",
        error_message: res.ok ? null : res.error,
        sent_at: res.ok ? new Date().toISOString() : null,
        created_by: userId,
      });
      if (res.ok) algunoOk = true;
      else errores.push(`${cfg.channel_type}: ${res.error}`);
    }

    return { ok: algunoOk, error: algunoOk ? null : errores.join(" · ") };
  });

/* ------------------------------------------------------------------ */
/* Despacho por eventos a todos los canales activos y habilitados.     */
/* Cualquier miembro activo puede disparar. Dedup por canal+referencia.*/
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

    const { data: canales } = await (supabaseAdmin as any)
      .from("notification_channels")
      .select("channel_type, enabled, allowed_alert_types, message_template, bot_token, destination_id, destination_label")
      .eq("enabled", true)
      .in("channel_type", CANALES_ACTIVOS as unknown as string[]);

    const lista = canales ?? [];
    if (lista.length === 0) return { ok: false, status: "skipped", reason: "Sin canales activos." };

    const win = data.dedup_minutes ?? 30;
    const vars: PlantillaVars = {
      ...data.vars,
      tipo_alerta: data.vars.tipo_alerta || labelAlerta(data.alert_type),
      fecha_hora: data.vars.fecha_hora || new Date().toLocaleString("es-CO"),
    };

    let algunoOk = false;
    let algunoIntentado = false;

    for (const cfg of lista) {
      const allowed: string[] = Array.isArray(cfg.allowed_alert_types) ? cfg.allowed_alert_types : [];
      if (!allowed.includes(data.alert_type)) continue;
      if (!cfg.bot_token) continue;
      if (cfg.channel_type === "telegram" && !cfg.destination_id) continue;

      // Control de duplicados por canal + referencia dentro de la ventana.
      if (data.reference_id) {
        const since = new Date(Date.now() - win * 60000).toISOString();
        const { data: prev } = await (supabaseAdmin as any)
          .from("notification_logs")
          .select("id")
          .eq("channel_type", cfg.channel_type)
          .eq("alert_type", data.alert_type)
          .eq("reference_id", data.reference_id)
          .eq("status", "sent")
          .gte("created_at", since)
          .limit(1);
        if (prev && prev.length > 0) continue;
      }

      algunoIntentado = true;
      const text = renderPlantilla(cfg.message_template || plantillaPorCanal(cfg.channel_type), vars);
      const res = await enviarPorCanal(cfg, text);
      await marcarResultado(supabaseAdmin, cfg.channel_type, res.ok, res.error);

      await supabaseAdmin.from("notification_logs").insert({
        channel_type: cfg.channel_type,
        alert_type: data.alert_type,
        module: data.module || null,
        reference_id: data.reference_id || null,
        recipient: res.recipient ?? null,
        message_preview: text.slice(0, 140),
        status: res.ok ? "sent" : "error",
        error_message: res.ok ? null : res.error,
        sent_at: res.ok ? new Date().toISOString() : null,
        created_by: userId,
      });
      if (res.ok) algunoOk = true;
    }

    if (!algunoIntentado) return { ok: false, status: "skipped", reason: "Ningún canal habilitado para este tipo." };
    return { ok: algunoOk, status: algunoOk ? "sent" : "error" };
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
