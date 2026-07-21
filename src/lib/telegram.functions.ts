/**
 * Server functions para administrar la integración con Telegram.
 * - Token: solo desde Cloud Secrets (nunca en cliente, tabla, log ni respuesta).
 * - Todas requieren admin autenticado.
 * - Auditadas en audit_logs. Nunca guardan PHI.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const CHANNEL_TYPE = "telegram";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function esAdmin(supabase: any, userId: string): Promise<boolean> {
  const { data } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  return !!data;
}

async function auditar(
  userId: string,
  accion: string,
  detalles?: Record<string, unknown>,
  resultado: "exito" | "fallo" = "exito",
) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin.rpc("registrar_auditoria_srv", {
    _user_id: userId,
    _accion: accion,
    _modulo: "notificaciones_telegram",
    _tabla: "notification_channels",
    _resultado: resultado,
    _detalles: detalles ?? null,
  });
}

/* ---------------------------- STATUS ---------------------------- */
export const telegramStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    if (!(await esAdmin(supabase, userId))) return { ok: false as const, error: "No autorizado." };
    const { isTelegramTokenConfigured } = await import("./telegram.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { count } = await (supabaseAdmin as any)
      .from("notification_channels")
      .select("id", { count: "exact", head: true })
      .eq("channel_type", CHANNEL_TYPE);
    const { count: enabledCount } = await (supabaseAdmin as any)
      .from("notification_channels")
      .select("id", { count: "exact", head: true })
      .eq("channel_type", CHANNEL_TYPE)
      .eq("enabled", true);
    return {
      ok: true as const,
      token_configured: isTelegramTokenConfigured(),
      destinos_total: count ?? 0,
      destinos_activos: enabledCount ?? 0,
    };
  });

/* --------------------------- VALIDATE BOT --------------------------- */
export const telegramValidateBot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    if (!(await esAdmin(supabase, userId))) return { ok: false as const, error: "No autorizado." };
    const { tgGetMe } = await import("./telegram.server");
    const r = await tgGetMe();
    if (!r.ok || !r.bot) {
      await auditar(userId, "TELEGRAM_BOT_VALIDATED", { error: r.error }, "fallo");
      return { ok: false as const, error: r.error || "No se pudo validar el bot." };
    }
    await auditar(userId, "TELEGRAM_BOT_VALIDATED", { username: r.bot.username, id: r.bot.id });
    return {
      ok: true as const,
      bot: {
        id: r.bot.id,
        username: r.bot.username,
        first_name: r.bot.first_name,
        can_join_groups: r.bot.can_join_groups,
        can_read_all_group_messages: r.bot.can_read_all_group_messages,
      },
    };
  });

/* -------------------------- DETECT DESTINOS -------------------------- */
export const telegramDetectDestinations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    if (!(await esAdmin(supabase, userId))) return { ok: false as const, error: "No autorizado.", destinos: [] };
    const { tgGetUpdates } = await import("./telegram.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const r = await tgGetUpdates();
    if (!r.ok) return { ok: false as const, error: r.error || "No se pudieron detectar destinos.", destinos: [] };
    // Marcar cuáles ya están guardados
    const { data: existentes } = await (supabaseAdmin as any)
      .from("notification_channels")
      .select("destination_id, id")
      .eq("channel_type", CHANNEL_TYPE);
    const yaGuardados = new Set<string>((existentes ?? []).map((e: any) => String(e.destination_id)));
    return {
      ok: true as const,
      destinos: r.destinos.map((d) => ({ ...d, ya_guardado: yaGuardados.has(d.chat_id) })),
    };
  });

/* ---------------------------- LIST DESTINOS ---------------------------- */
export const telegramListDestinations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    if (!(await esAdmin(supabase, userId))) return { ok: false as const, error: "No autorizado.", destinos: [] };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await (supabaseAdmin as any)
      .from("notification_channels")
      .select(
        "id, display_name, destination_id, destination_label, chat_type, chat_title, description, enabled, silent, allowed_alert_types, allowed_priorities, allowed_modules, schedule, link_url, config_status, last_test_at, last_success_at, last_error_at, last_error_message, created_at, updated_at",
      )
      .eq("channel_type", CHANNEL_TYPE)
      .order("created_at", { ascending: true });
    if (error) return { ok: false as const, error: "No se pudieron leer los destinos.", destinos: [] };
    return { ok: true as const, destinos: data ?? [] };
  });

/* ---------------------------- SAVE DESTINO ---------------------------- */
const saveSchema = z.object({
  id: z.string().uuid().optional(),
  display_name: z.string().min(1).max(120),
  destination_id: z.string().min(1).max(64),
  chat_type: z.enum(["private", "group", "supergroup", "channel"]),
  chat_title: z.string().max(200).optional().nullable(),
  destination_label: z.string().max(200).optional().nullable(),
  description: z.string().max(500).optional().nullable(),
  allowed_alert_types: z.array(z.string().max(60)).max(50).default([]),
  allowed_priorities: z.array(z.string().max(40)).max(10).default([]),
  allowed_modules: z.array(z.string().max(60)).max(50).default([]),
  schedule: z.record(z.unknown()).optional().default({}),
  silent: z.boolean().default(false),
  link_url: z.string().url().max(300).optional().nullable(),
  enabled: z.boolean().default(true),
});

export const telegramSaveDestination = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => saveSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (!(await esAdmin(supabase, userId))) return { ok: false as const, error: "No autorizado." };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const patch: Record<string, unknown> = {
      channel_type: CHANNEL_TYPE,
      display_name: data.display_name,
      destination_id: data.destination_id,
      destination_label: data.destination_label ?? data.chat_title ?? null,
      chat_type: data.chat_type,
      chat_title: data.chat_title ?? null,
      description: data.description ?? null,
      allowed_alert_types: data.allowed_alert_types,
      allowed_priorities: data.allowed_priorities,
      allowed_modules: data.allowed_modules,
      schedule: data.schedule ?? {},
      silent: data.silent,
      link_url: data.link_url ?? null,
      enabled: data.enabled,
      token_configured: true, // el token vive en Cloud Secrets, no en la fila
      config_status: "configurado",
      updated_by: userId,
    };

    let result;
    if (data.id) {
      result = await (supabaseAdmin as any)
        .from("notification_channels")
        .update(patch)
        .eq("id", data.id)
        .eq("channel_type", CHANNEL_TYPE)
        .select("id")
        .maybeSingle();
    } else {
      // Evitar duplicado por (channel_type, destination_id)
      const { data: existente } = await (supabaseAdmin as any)
        .from("notification_channels")
        .select("id")
        .eq("channel_type", CHANNEL_TYPE)
        .eq("destination_id", data.destination_id)
        .maybeSingle();
      if (existente?.id) {
        result = await (supabaseAdmin as any)
          .from("notification_channels")
          .update(patch)
          .eq("id", existente.id)
          .select("id")
          .maybeSingle();
      } else {
        (patch as Record<string, unknown>).created_by = userId;
        result = await (supabaseAdmin as any)
          .from("notification_channels")
          .insert(patch)
          .select("id")
          .maybeSingle();
      }
    }
    if (result?.error) {
      await auditar(userId, data.id ? "TELEGRAM_DESTINATION_UPDATED" : "TELEGRAM_DESTINATION_CREATED",
        { error: result.error.message }, "fallo");
      return { ok: false as const, error: "No se pudo guardar el destino." };
    }
    const { maskChatId } = await import("./telegram.server");
    await auditar(userId, data.id ? "TELEGRAM_DESTINATION_UPDATED" : "TELEGRAM_DESTINATION_CREATED", {
      destino_id: result?.data?.id,
      display_name: data.display_name,
      chat_id_masked: maskChatId(data.destination_id),
      chat_type: data.chat_type,
    });
    return { ok: true as const, id: result?.data?.id };
  });

/* ---------------------- TOGGLE / DELETE DESTINO ---------------------- */
export const telegramToggleDestination = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; enabled: boolean }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (!(await esAdmin(supabase, userId))) return { ok: false as const, error: "No autorizado." };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (supabaseAdmin as any)
      .from("notification_channels")
      .update({ enabled: !!data.enabled, updated_by: userId })
      .eq("id", data.id)
      .eq("channel_type", CHANNEL_TYPE);
    if (error) return { ok: false as const, error: "No se pudo actualizar." };
    await auditar(userId, data.enabled ? "TELEGRAM_DESTINATION_ENABLED" : "TELEGRAM_DESTINATION_DISABLED", { id: data.id });
    return { ok: true as const };
  });

export const telegramDeleteDestination = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (!(await esAdmin(supabase, userId))) return { ok: false as const, error: "No autorizado." };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (supabaseAdmin as any)
      .from("notification_channels")
      .delete()
      .eq("id", data.id)
      .eq("channel_type", CHANNEL_TYPE);
    if (error) return { ok: false as const, error: "No se pudo eliminar." };
    await auditar(userId, "TELEGRAM_DESTINATION_DELETED", { id: data.id });
    return { ok: true as const };
  });

/* ---------------------------- SEND TEST ---------------------------- */
export const telegramSendTest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (!(await esAdmin(supabase, userId))) return { ok: false as const, error: "No autorizado." };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: dest } = await (supabaseAdmin as any)
      .from("notification_channels")
      .select("id, display_name, destination_id, silent")
      .eq("id", data.id)
      .eq("channel_type", CHANNEL_TYPE)
      .maybeSingle();
    if (!dest?.destination_id) return { ok: false as const, error: "Destino no encontrado." };

    const fecha = new Date().toLocaleString("es-CO");
    const text = [
      "✅ PRUEBA DE CONEXIÓN EXITOSA",
      "SISTEMA DE REFERENCIA Y CONTRARREFERENCIA CEDIM IPS",
      `CANAL: ${dest.display_name}`,
      `FECHA: ${fecha}`,
    ].join("\n");

    const started = Date.now();
    const { tgSendMessage, maskChatId } = await import("./telegram.server");
    const res = await tgSendMessage(dest.destination_id, text, { silent: !!dest.silent });
    const elapsed = Date.now() - started;

    const now = new Date().toISOString();
    await (supabaseAdmin as any)
      .from("notification_channels")
      .update(
        res.ok
          ? { last_test_at: now, last_success_at: now, last_error_at: null, last_error_message: null, config_status: "conectado" }
          : { last_test_at: now, last_error_at: now, last_error_message: res.description || "Error" },
      )
      .eq("id", dest.id);

    await (supabaseAdmin as any).from("notification_logs").insert({
      channel_type: CHANNEL_TYPE,
      channel_id: dest.id,
      alert_type: "PRUEBA_CONEXION",
      module: "control_mando",
      recipient: maskChatId(dest.destination_id),
      message_preview: "Prueba de conexión",
      status: res.ok ? "sent" : "error",
      error_message: res.ok ? null : `[${res.error_code ?? 0}] ${res.description ?? ""}`.slice(0, 200),
      sent_at: res.ok ? now : null,
      created_by: userId,
    });

    await auditar(userId, "TELEGRAM_TEST_SENT", {
      destino_id: dest.id,
      chat_id_masked: maskChatId(dest.destination_id),
      ok: res.ok,
      elapsed_ms: elapsed,
      message_id: res.message_id,
    }, res.ok ? "exito" : "fallo");

    return res.ok
      ? { ok: true as const, message_id: res.message_id, elapsed_ms: elapsed }
      : { ok: false as const, error: res.description || "Fallo en el envío", error_code: res.error_code };
  });
