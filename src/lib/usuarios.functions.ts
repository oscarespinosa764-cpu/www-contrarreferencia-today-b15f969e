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
