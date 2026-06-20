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
      .update({ nombre: data.nombre, cargo: data.cargo || null, activo: data.activo })
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
    if (error) return { ok: false, error: "No se pudo actualizar el estado." as string | null };

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
