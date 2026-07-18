import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ---------------------------------------------------------------------------
// Gestión de usuarios — SOLO ADMINISTRADOR
// Crear usuarios, asignar rol, activar/desactivar y cambiar rol.
// Todas las operaciones: validan sesión + rol admin activo y registran auditoría.
// El registro público está deshabilitado: estas son las únicas vías de alta.
// ---------------------------------------------------------------------------

const ROLES = ["admin", "operativa", "temporal"] as const;

// Política de contraseña: mínimo 12 caracteres con algo de complejidad.
const passwordSchema = z
  .string()
  .min(12, "La contraseña debe tener al menos 12 caracteres.")
  .max(72, "La contraseña es demasiado larga.")
  .refine((v) => /[a-z]/.test(v) && /[A-Z]/.test(v) && /[0-9]/.test(v), {
    message: "La contraseña debe incluir mayúsculas, minúsculas y números.",
  });

async function assertAdmin(supabase: any, userId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  return !error && !!data;
}

// --- Crear usuario -----------------------------------------------------------
const crearSchema = z.object({
  email: z.string().trim().toLowerCase().email("Correo inválido.").max(255),
  password: passwordSchema,
  nombre: z.string().trim().min(1, "Ingresa el nombre.").max(120),
  cargo: z.string().trim().max(120).optional().default(""),
  telefono: z.string().trim().max(40).optional().default(""),
  rol: z.enum(ROLES),
  activo: z.boolean().default(true),
});

export const crearUsuario = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => crearSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (!(await assertAdmin(supabase, userId))) {
      return { ok: false, error: "Acción reservada al administrador." as string | null };
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: { nombre: data.nombre },
    });

    if (error || !created?.user) {
      const dup = (error?.message ?? "").toLowerCase().includes("already");
      return {
        ok: false,
        error: (dup ? "Ya existe un usuario con ese correo." : "No se pudo crear el usuario.") as string | null,
      };
    }

    const newId = created.user.id;

    // El trigger handle_new_user ya creó el perfil. Ajustamos datos y estado.
    await (supabaseAdmin as any)
      .from("profiles")
      .update({
        nombre: data.nombre,
        cargo: data.cargo || null,
        telefono: data.telefono || null,
        activo: data.activo,
      })
      .eq("user_id", newId);

    // Asignar rol (un solo rol por usuario en esta app).
    await (supabaseAdmin as any).from("user_roles").delete().eq("user_id", newId);
    await (supabaseAdmin as any).from("user_roles").insert({ user_id: newId, role: data.rol });

    await (supabaseAdmin as any).from("audit_logs").insert({
      user_id: userId,
      accion: "crear_usuario",
      modulo: "usuarios",
      tabla: "profiles",
      registro_id: newId,
      resultado: "exito",
      detalles: { rol: data.rol, activo: data.activo },
    });

    return { ok: true, error: null as string | null };
  });

// --- Cambiar rol -------------------------------------------------------------
const rolSchema = z.object({
  userId: z.string().uuid(),
  rol: z.enum(ROLES),
});

export const cambiarRolUsuario = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => rolSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (!(await assertAdmin(supabase, userId))) {
      return { ok: false, error: "Acción reservada al administrador." as string | null };
    }
    if (data.userId === userId) {
      return { ok: false, error: "No puedes cambiar tu propio rol." as string | null };
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await (supabaseAdmin as any).from("user_roles").delete().eq("user_id", data.userId);
    const { error } = await (supabaseAdmin as any)
      .from("user_roles")
      .insert({ user_id: data.userId, role: data.rol });
    if (error) return { ok: false, error: "No se pudo actualizar el rol." as string | null };

    await (supabaseAdmin as any).from("audit_logs").insert({
      user_id: userId,
      accion: "cambiar_rol",
      modulo: "usuarios",
      tabla: "user_roles",
      registro_id: data.userId,
      resultado: "exito",
      detalles: { rol: data.rol },
    });

    return { ok: true, error: null as string | null };
  });

// --- Activar / desactivar ----------------------------------------------------
const estadoSchema = z.object({
  userId: z.string().uuid(),
  activo: z.boolean(),
});

export const cambiarEstadoUsuario = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => estadoSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (!(await assertAdmin(supabase, userId))) {
      return { ok: false, error: "Acción reservada al administrador." as string | null };
    }
    if (data.userId === userId) {
      return { ok: false, error: "No puedes desactivar tu propia cuenta." as string | null };
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (supabaseAdmin as any)
      .from("profiles")
      .update({ activo: data.activo })
      .eq("user_id", data.userId);
    if (error) {
      return {
        ok: false,
        error: (error.message
          ? `No se pudo actualizar el estado: ${error.message}`
          : "No se pudo actualizar el estado.") as string | null,
      };
    }

    // Defensa en profundidad: al desactivar, se banea la cuenta en Auth para
    // que su JWT deje de aceptarse de inmediato (no espera a que expire el token).
    // Al reactivar, se levanta el baneo. Si el baneo falla, NO revertimos el
    // cambio de estado del perfil (que es la fuente de verdad de la app).
    try {
      await (supabaseAdmin as any).auth.admin.updateUserById(data.userId, {
        ban_duration: data.activo ? "none" : "876000h",
      });
    } catch {
      /* el baneo es defensa en profundidad; el estado del perfil ya cambió */
    }

    await (supabaseAdmin as any).from("audit_logs").insert({
      user_id: userId,
      accion: data.activo ? "activar_usuario" : "desactivar_usuario",
      modulo: "usuarios",
      tabla: "profiles",
      registro_id: data.userId,
      resultado: "exito",
    });

    return { ok: true, error: null as string | null };
  });

// --- Editar datos de perfil --------------------------------------------------
const editarSchema = z.object({
  userId: z.string().uuid(),
  nombre: z.string().trim().min(1, "Ingresa el nombre.").max(120),
  cargo: z.string().trim().max(120).optional().default(""),
  tipo_documento: z.string().trim().max(40).optional().default(""),
  numero_documento: z.string().trim().max(40).optional().default(""),
  telefono: z.string().trim().max(40).optional().default(""),
  sede: z.string().trim().max(120).optional().default(""),
  observaciones: z.string().trim().max(500).optional().default(""),
  rol: z.enum(ROLES).optional(),
  activo: z.boolean().optional(),
});

export const editarUsuario = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => editarSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (!(await assertAdmin(supabase, userId))) {
      return { ok: false, error: "Acción reservada al administrador." as string | null };
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // El correo de autenticación NO se modifica desde aquí (solo lectura en UI).
    const { error } = await (supabaseAdmin as any)
      .from("profiles")
      .update({
        nombre: data.nombre,
        cargo: data.cargo || null,
        tipo_documento: data.tipo_documento || null,
        numero_documento: data.numero_documento || null,
        telefono: data.telefono || null,
        sede: data.sede || null,
        observaciones: data.observaciones || null,
        ...(data.activo !== undefined && data.userId !== userId ? { activo: data.activo } : {}),
      })
      .eq("user_id", data.userId);
    if (error) {
      return {
        ok: false,
        error: (error.message
          ? `No se pudo actualizar el usuario: ${error.message}`
          : "No se pudo actualizar el usuario.") as string | null,
      };
    }

    // Cambio de rol opcional (no permitido sobre uno mismo).
    if (data.rol && data.userId !== userId) {
      await (supabaseAdmin as any).from("user_roles").delete().eq("user_id", data.userId);
      await (supabaseAdmin as any).from("user_roles").insert({ user_id: data.userId, role: data.rol });
    }

    await (supabaseAdmin as any).from("audit_logs").insert({
      user_id: userId,
      accion: "editar_usuario",
      modulo: "usuarios",
      tabla: "profiles",
      registro_id: data.userId,
      resultado: "exito",
      detalles: { rol: data.rol ?? null },
    });

    return { ok: true, error: null as string | null };
  });

// --- Política de contraseña reforzada (mínimo 10 con complejidad) ------------
const strongPasswordSchema = z
  .string()
  .min(10, "La contraseña debe tener al menos 10 caracteres.")
  .max(72, "La contraseña es demasiado larga.")
  .refine(
    (v) =>
      /[a-z]/.test(v) &&
      /[A-Z]/.test(v) &&
      /[0-9]/.test(v) &&
      /[^A-Za-z0-9]/.test(v),
    { message: "La contraseña debe incluir mayúsculas, minúsculas, un número y un carácter especial." },
  );

function maskEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const [u, d] = email.split("@");
  if (!d) return null;
  const uu = u.length <= 2 ? u[0] + "*" : u[0] + "***" + u.slice(-1);
  return `${uu}@${d}`;
}

// --- Obtener correo de autenticación (admin) ---------------------------------
export const obtenerEmailUsuario = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { userId: string }) => z.object({ userId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (!(await assertAdmin(supabase, userId))) {
      return { ok: false, email: null as string | null, error: "Acción reservada al administrador." as string | null };
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: res, error } = await (supabaseAdmin as any).auth.admin.getUserById(data.userId);
    if (error || !res?.user) {
      return { ok: false, email: null, error: "No fue posible cargar el correo." as string | null };
    }
    return { ok: true, email: (res.user.email as string) ?? null, error: null as string | null };
  });

// --- Cambiar correo de autenticación (admin) ---------------------------------
export const cambiarEmailUsuario = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { userId: string; email: string }) =>
    z
      .object({
        userId: z.string().uuid(),
        email: z.string().trim().toLowerCase().email("Correo inválido.").max(255),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (!(await assertAdmin(supabase, userId))) {
      return { ok: false, error: "No tienes permiso para modificar las credenciales de este usuario." as string | null };
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Correo actual (para no-op y auditoría enmascarada).
    const { data: current } = await (supabaseAdmin as any).auth.admin.getUserById(data.userId);
    const currentEmail = (current?.user?.email as string | undefined)?.toLowerCase() ?? null;
    if (currentEmail === data.email) {
      return { ok: true, error: null as string | null };
    }

    const { error } = await (supabaseAdmin as any).auth.admin.updateUserById(data.userId, {
      email: data.email,
      email_confirm: true,
    });
    if (error) {
      const msg = (error.message ?? "").toLowerCase();
      const dup =
        msg.includes("already") ||
        msg.includes("registered") ||
        msg.includes("exists") ||
        msg.includes("duplicate");
      return {
        ok: false,
        error: (dup
          ? "El correo electrónico ya está asociado a otro usuario."
          : "No fue posible actualizar el correo electrónico. Inténtalo nuevamente.") as string | null,
      };
    }

    await (supabaseAdmin as any).from("audit_logs").insert({
      user_id: userId,
      accion: "USER_AUTH_EMAIL_UPDATED",
      modulo: "usuarios",
      tabla: "auth.users",
      registro_id: data.userId,
      resultado: "exito",
      detalles: { email_anterior: maskEmail(currentEmail), email_nuevo: maskEmail(data.email) },
    });
    return { ok: true, error: null as string | null };
  });

// --- Cambiar contraseña (admin establece manualmente) ------------------------
export const cambiarPasswordUsuario = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { userId: string; password: string }) =>
    z.object({ userId: z.string().uuid(), password: strongPasswordSchema }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (!(await assertAdmin(supabase, userId))) {
      return { ok: false, error: "No tienes permiso para modificar las credenciales de este usuario." as string | null };
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (supabaseAdmin as any).auth.admin.updateUserById(data.userId, {
      password: data.password,
    });
    if (error) {
      return { ok: false, error: "No fue posible actualizar la contraseña. Inténtalo nuevamente." as string | null };
    }
    await (supabaseAdmin as any).from("audit_logs").insert({
      user_id: userId,
      accion: "USER_PASSWORD_RESET",
      modulo: "usuarios",
      tabla: "auth.users",
      registro_id: data.userId,
      resultado: "exito",
    });
    return { ok: true, error: null as string | null };
  });

// --- Generar contraseña temporal (admin) -------------------------------------
function generarPasswordSegura(): string {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghijkmnopqrstuvwxyz";
  const digits = "23456789";
  const symbols = "!@#$%&*?+-";
  const all = upper + lower + digits + symbols;
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const pick = (set: string, i: number) => set[bytes[i] % set.length];
  // Garantiza al menos uno de cada clase.
  const req = [pick(upper, 0), pick(lower, 1), pick(digits, 2), pick(symbols, 3)];
  const rest: string[] = [];
  for (let i = 4; i < 16; i++) rest.push(pick(all, i));
  const arr = [...req, ...rest];
  // Fisher–Yates con bytes adicionales.
  const shuf = new Uint8Array(arr.length);
  crypto.getRandomValues(shuf);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = shuf[i] % (i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.join("");
}

export const generarPasswordTemporalUsuario = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { userId: string }) => z.object({ userId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (!(await assertAdmin(supabase, userId))) {
      return {
        ok: false,
        password: null as string | null,
        error: "No tienes permiso para modificar las credenciales de este usuario." as string | null,
      };
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const password = generarPasswordSegura();
    const { error } = await (supabaseAdmin as any).auth.admin.updateUserById(data.userId, { password });
    if (error) {
      return { ok: false, password: null, error: "No fue posible generar la contraseña temporal." as string | null };
    }
    await (supabaseAdmin as any).from("audit_logs").insert({
      user_id: userId,
      accion: "USER_TEMP_PASSWORD_GENERATED",
      modulo: "usuarios",
      tabla: "auth.users",
      registro_id: data.userId,
      resultado: "exito",
    });
    return { ok: true, password, error: null as string | null };
  });

// ---------------------------------------------------------------------------
// FLUJO DE INVITACIÓN Y ACTIVACIÓN
// ---------------------------------------------------------------------------

function getSiteUrl(): string {
  return (process.env.PUBLIC_SITE_URL || "https://www.contrarreferencia.today").replace(/\/$/, "");
}

// Rate-limit simple en memoria: máx 1 reenvío por 60 s por userId.
const lastInviteResendAt = new Map<string, number>();

// --- Invitar usuario (envía correo con enlace de activación) -----------------
const invitarSchema = z.object({
  email: z.string().trim().toLowerCase().email("Correo inválido.").max(255),
  nombre: z.string().trim().min(1, "Ingresa el nombre.").max(120),
  cargo: z.string().trim().max(120).optional().default(""),
  telefono: z.string().trim().max(40).optional().default(""),
  sede: z.string().trim().max(120).optional().default(""),
  observaciones: z.string().trim().max(500).optional().default(""),
  rol: z.enum(ROLES),
  activo: z.boolean().default(true),
});

export const invitarUsuario = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => invitarSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (!(await assertAdmin(supabase, userId))) {
      return { ok: false, error: "Acción reservada al administrador." as string | null };
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const redirectTo = `${getSiteUrl()}/activar-cuenta`;

    const { data: invited, error } = await (supabaseAdmin as any).auth.admin.inviteUserByEmail(
      data.email,
      { redirectTo, data: { nombre: data.nombre } },
    );

    if (error || !invited?.user) {
      const msg = (error?.message ?? "").toLowerCase();
      const dup = msg.includes("already") || msg.includes("registered") || msg.includes("exists");
      return {
        ok: false,
        error: (dup
          ? "El correo electrónico ya está asociado a otro usuario."
          : "No fue posible enviar la invitación.") as string | null,
      };
    }

    const newId = invited.user.id;

    // El trigger handle_new_user creó el perfil. Complementamos datos.
    await (supabaseAdmin as any)
      .from("profiles")
      .update({
        nombre: data.nombre,
        cargo: data.cargo || null,
        telefono: data.telefono || null,
        sede: data.sede || null,
        observaciones: data.observaciones || null,
        activo: data.activo,
      })
      .eq("user_id", newId);

    await (supabaseAdmin as any).from("user_roles").delete().eq("user_id", newId);
    await (supabaseAdmin as any).from("user_roles").insert({ user_id: newId, role: data.rol });

    await (supabaseAdmin as any).from("audit_logs").insert({
      user_id: userId,
      accion: "USER_INVITED",
      modulo: "usuarios",
      tabla: "auth.users",
      registro_id: newId,
      resultado: "exito",
      detalles: { email: maskEmail(data.email), rol: data.rol },
    });

    lastInviteResendAt.set(newId, Date.now());
    return { ok: true, error: null as string | null };
  });

// --- Reenviar invitación -----------------------------------------------------
export const reenviarInvitacion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { userId: string }) => z.object({ userId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (!(await assertAdmin(supabase, userId))) {
      return { ok: false, error: "Acción reservada al administrador." as string | null };
    }
    const prev = lastInviteResendAt.get(data.userId) ?? 0;
    if (Date.now() - prev < 60_000) {
      return { ok: false, error: "Espera unos segundos antes de reenviar la invitación." as string | null };
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: current } = await (supabaseAdmin as any).auth.admin.getUserById(data.userId);
    const email = current?.user?.email as string | undefined;
    if (!email) return { ok: false, error: "No se encontró el correo del usuario." as string | null };

    const redirectTo = `${getSiteUrl()}/activar-cuenta`;
    const { error } = await (supabaseAdmin as any).auth.admin.inviteUserByEmail(email, { redirectTo });
    if (error) {
      // Si ya existe/activo, intentamos con recovery en su lugar.
      const { error: err2 } = await (supabaseAdmin as any).auth.admin.generateLink({
        type: "recovery",
        email,
        options: { redirectTo },
      });
      if (err2) return { ok: false, error: "No fue posible enviar la invitación." as string | null };
    }

    lastInviteResendAt.set(data.userId, Date.now());
    await (supabaseAdmin as any).from("audit_logs").insert({
      user_id: userId,
      accion: "USER_INVITATION_RESENT",
      modulo: "usuarios",
      tabla: "auth.users",
      registro_id: data.userId,
      resultado: "exito",
      detalles: { email: maskEmail(email) },
    });
    return { ok: true, error: null as string | null };
  });

// --- Enviar enlace de restablecimiento ---------------------------------------
// IMPORTANTE: resetPasswordForEmail debe invocarse desde un cliente NO admin
// (clave publishable). El cliente service_role no dispara el webhook
// send-email de GoTrue y el correo nunca sale. Con la clave publishable el
// hook /lovable/email/auth/webhook recibe el evento 'recovery' y se encola.
export const enviarResetPasswordUsuario = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { userId: string }) => z.object({ userId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (!(await assertAdmin(supabase, userId))) {
      return { ok: false, error: "No tienes permiso para administrar las credenciales de este usuario." as string | null };
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: current } = await (supabaseAdmin as any).auth.admin.getUserById(data.userId);
    const u = current?.user;
    const email = u?.email as string | undefined;
    if (!email) return { ok: false, error: "No se encontró el correo del usuario." as string | null };

    // Validaciones de estado real (fail-closed)
    const bannedUntil = u.banned_until ? new Date(u.banned_until) : null;
    if (bannedUntil && bannedUntil.getTime() > Date.now()) {
      return { ok: false, error: "La cuenta está bloqueada. Desbloquéala antes de enviar el enlace." as string | null };
    }
    if (!u.email_confirmed_at && !u.confirmed_at) {
      return { ok: false, error: "Esta cuenta aún no está activa. Debe usarse la invitación." as string | null };
    }
    const { data: prof } = await (supabaseAdmin as any)
      .from("profiles").select("activo").eq("user_id", data.userId).maybeSingle();
    if (prof && prof.activo === false) {
      return { ok: false, error: "La cuenta está inactiva. Actívala antes de enviar el enlace." as string | null };
    }

    // Cliente publishable server-side (dispara el hook send-email).
    const { createClient } = await import("@supabase/supabase-js");
    const url = process.env.SUPABASE_URL!;
    const anonKey = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY!;
    const pub = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
      global: {
        fetch: (input: any, init?: any) => {
          const h = new Headers(init?.headers);
          if (anonKey.startsWith("sb_") && h.get("Authorization") === `Bearer ${anonKey}`) h.delete("Authorization");
          h.set("apikey", anonKey);
          return fetch(input, { ...init, headers: h });
        },
      },
    });

    const redirectTo = `${getSiteUrl()}/activar-cuenta`;
    const { error } = await pub.auth.resetPasswordForEmail(email, { redirectTo });
    if (error) {
      await (supabaseAdmin as any).from("audit_logs").insert({
        user_id: userId,
        accion: "USER_PASSWORD_RESET_FAILED",
        modulo: "usuarios",
        tabla: "auth.users",
        registro_id: data.userId,
        resultado: "error",
        detalles: { email: maskEmail(email), error: (error.message ?? "").slice(0, 200) },
      });
      return { ok: false, error: "No fue posible enviar el enlace de restablecimiento." as string | null };
    }

    await (supabaseAdmin as any).from("audit_logs").insert({
      user_id: userId,
      accion: "USER_PASSWORD_RESET_LINK_SENT",
      modulo: "usuarios",
      tabla: "auth.users",
      registro_id: data.userId,
      resultado: "exito",
      detalles: { email: maskEmail(email) },
    });
    return { ok: true, error: null as string | null };
  });

// --- Estado de acceso (para modal "Datos básicos de acceso") -----------------
export type NormalizedAuthStatus =
  | "ACTIVE"
  | "INVITATION_PENDING"
  | "INACTIVE"
  | "BLOCKED"
  | "PROFILE_WITHOUT_AUTH"
  | "AUTH_ERROR";

export type AllowedAction =
  | "COPY_USER"
  | "RESEND_INVITATION"
  | "SEND_RESET"
  | "CHANGE_PASSWORD_MANUAL"
  | "GENERATE_TEMP_PASSWORD"
  | "ACTIVATE_ACCOUNT"
  | "REVIEW_BLOCK";

export const obtenerEstadoAccesoUsuario = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { userId: string }) => z.object({ userId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (!(await assertAdmin(supabase, userId))) {
      return {
        ok: false,
        info: null as null | {
          email: string | null;
          normalizedStatus: NormalizedAuthStatus;
          estadoCuenta: string;
          estadoPassword: string;
          activationAt: string | null;
          lastAdminChangeAt: string | null;
          lastResetSentAt: string | null;
          lastResetStatus: string | null;
          resetInFlight: boolean;
          allowedActions: AllowedAction[];
        },
        error: "Acción reservada al administrador." as string | null,
      };
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: res, error } = await (supabaseAdmin as any).auth.admin.getUserById(data.userId);

    // Perfil
    const { data: prof } = await (supabaseAdmin as any)
      .from("profiles").select("activo").eq("user_id", data.userId).maybeSingle();

    if (error || !res?.user) {
      const normalizedStatus: NormalizedAuthStatus = prof ? "PROFILE_WITHOUT_AUTH" : "AUTH_ERROR";
      return {
        ok: true,
        info: {
          email: null,
          normalizedStatus,
          estadoCuenta: normalizedStatus === "PROFILE_WITHOUT_AUTH" ? "PERFIL SIN CUENTA DE ACCESO" : "ERROR DE VERIFICACIÓN",
          estadoPassword: "SIN INFORMACIÓN",
          activationAt: null,
          lastAdminChangeAt: null,
          lastResetSentAt: null,
          lastResetStatus: null,
          resetInFlight: false,
          allowedActions: [] as AllowedAction[],
        },
        error: null as string | null,
      };
    }

    const u = res.user;
    const bannedUntil = u.banned_until ? new Date(u.banned_until) : null;
    const isBanned = !!(bannedUntil && bannedUntil.getTime() > Date.now());
    const confirmed = !!u.email_confirmed_at || !!u.confirmed_at;
    const lastSignIn = u.last_sign_in_at as string | null;
    const emailAuth = (u.email as string) ?? null;

    let normalizedStatus: NormalizedAuthStatus;
    let estadoCuenta: string;
    if (prof && prof.activo === false) { normalizedStatus = "INACTIVE"; estadoCuenta = "CUENTA INACTIVA"; }
    else if (isBanned) { normalizedStatus = "BLOCKED"; estadoCuenta = "CUENTA BLOQUEADA"; }
    else if (!confirmed) { normalizedStatus = "INVITATION_PENDING"; estadoCuenta = "INVITACIÓN PENDIENTE"; }
    else { normalizedStatus = "ACTIVE"; estadoCuenta = "CUENTA ACTIVA"; }

    // Auditoría de últimos eventos de credenciales.
    const { data: logs } = await (supabaseAdmin as any)
      .from("audit_logs")
      .select("accion, created_at")
      .eq("registro_id", data.userId)
      .in("accion", [
        "USER_ACCOUNT_ACTIVATED",
        "USER_PASSWORD_RESET",
        "USER_PASSWORD_RESET_LINK_SENT",
        "USER_PASSWORD_RESET_FAILED",
        "USER_TEMP_PASSWORD_GENERATED",
      ])
      .order("created_at", { ascending: false })
      .limit(30);

    const findLatest = (accion: string) =>
      (logs ?? []).find((l: any) => l.accion === accion)?.created_at ?? null;

    const activationAt = findLatest("USER_ACCOUNT_ACTIVATED") ?? (confirmed ? u.confirmed_at ?? u.email_confirmed_at ?? null : null);
    const manualResetAt = findLatest("USER_PASSWORD_RESET");
    const tempPasswordAt = findLatest("USER_TEMP_PASSWORD_GENERATED");
    const lastAdminChangeAt = manualResetAt ?? tempPasswordAt ?? null;
    const lastResetSentAt = findLatest("USER_PASSWORD_RESET_LINK_SENT");

    // Correlacionar con email_send_log (último 'recovery' para este correo).
    let lastResetStatus: string | null = null;
    let resetInFlight = false;
    if (emailAuth && lastResetSentAt) {
      const { data: mailRows } = await (supabaseAdmin as any)
        .from("email_send_log")
        .select("status, created_at")
        .eq("template_name", "recovery")
        .eq("recipient_email", emailAuth)
        .gte("created_at", lastResetSentAt)
        .order("created_at", { ascending: false })
        .limit(10);
      const rows = mailRows ?? [];
      // Preferimos el estado más "avanzado" (sent/failed/dlq) sobre pending.
      const terminal = rows.find((r: any) => ["sent", "failed", "dlq", "bounced", "suppressed"].includes(r.status));
      const pending = rows.find((r: any) => r.status === "pending");
      lastResetStatus = terminal?.status ?? pending?.status ?? null;
      // "en curso" = hay pending SIN estado terminal Y llegó hace menos de 20 min (TTL 15m + margen).
      if (!terminal && pending) {
        const ageMs = Date.now() - new Date(pending.created_at).getTime();
        resetInFlight = ageMs < 20 * 60_000;
      }
    }

    let estadoPassword = "CONFIGURADA — NO CONSULTABLE POR SEGURIDAD";
    if (!confirmed) estadoPassword = "PENDIENTE DE CONFIGURACIÓN";
    else if (resetInFlight) estadoPassword = "RESTABLECIMIENTO EN PROCESO";
    else if (lastResetStatus && ["failed", "dlq", "bounced"].includes(lastResetStatus)) {
      estadoPassword = "ERROR EN ÚLTIMO ENVÍO DE RESTABLECIMIENTO";
    } else if (
      lastResetSentAt &&
      lastResetStatus === "sent" &&
      (!lastSignIn || new Date(lastSignIn) < new Date(lastResetSentAt)) &&
      (!tempPasswordAt || new Date(lastResetSentAt) >= new Date(tempPasswordAt))
    ) {
      estadoPassword = "RESTABLECIMIENTO PENDIENTE";
    } else if (tempPasswordAt && (!lastSignIn || new Date(lastSignIn) < new Date(tempPasswordAt))) {
      estadoPassword = "CONTRASEÑA TEMPORAL GENERADA";
    }

    // Acciones permitidas por estado
    const allowedActions: AllowedAction[] = ["COPY_USER"];
    if (normalizedStatus === "INVITATION_PENDING") {
      allowedActions.push("RESEND_INVITATION");
    } else if (normalizedStatus === "ACTIVE") {
      if (!resetInFlight) allowedActions.push("SEND_RESET");
      allowedActions.push("CHANGE_PASSWORD_MANUAL", "GENERATE_TEMP_PASSWORD");
    } else if (normalizedStatus === "INACTIVE") {
      allowedActions.push("ACTIVATE_ACCOUNT");
    } else if (normalizedStatus === "BLOCKED") {
      allowedActions.push("REVIEW_BLOCK");
    }

    return {
      ok: true,
      info: {
        email: emailAuth,
        normalizedStatus,
        estadoCuenta,
        estadoPassword,
        activationAt,
        lastAdminChangeAt,
        lastResetSentAt,
        lastResetStatus,
        resetInFlight,
        allowedActions,
      },
      error: null as string | null,
    };
  });


