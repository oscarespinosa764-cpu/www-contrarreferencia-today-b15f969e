// Server function wrapper so the SECURITY DEFINER RPC
// `public.registrar_cambio_unidad_ri` is NOT exposed to `authenticated`.
// EXECUTE is revoked from anon/authenticated; only service_role invokes it
// after this handler verifies the caller session and active membership.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const schema = z.object({
  casoId: z.string().uuid(),
  nuevaUnidadCodigo: z.enum(["UCI_ADULTOS", "URGENCIAS", "HOSPITALIZACION", "QUIROFANO"]),
  nuevaCama: z.string().trim().min(1).max(30),
  observaciones: z.string().trim().max(1000).nullable().optional(),
  plantillaIndigo: z.string().trim().max(20000).nullable().optional(),
});

export const registrarCambioUnidadRI = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => schema.parse(input))
  .handler(async ({ data, context }) => {
    const { data: isActive } = await context.supabase.rpc("is_active_member", {
      _user_id: context.userId,
    });
    if (!isActive) {
      return { ok: false, error: "Usuario no autorizado" };
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rpcData, error } = await (
      supabaseAdmin.rpc as unknown as (
        name: string,
        args: Record<string, unknown>,
      ) => Promise<{ data: unknown; error: { message: string } | null }>
    )("registrar_cambio_unidad_ri", {
      _caso_id: data.casoId,
      _nueva_unidad_codigo: data.nuevaUnidadCodigo,
      _nueva_cama: data.nuevaCama,
      _observaciones: data.observaciones ?? null,
      _plantilla_indigo: data.plantillaIndigo ?? null,
      // Actor real validado por requireSupabaseAuth + is_active_member. La RPC
      // corre con service_role, por lo que auth.uid() es NULL; pasar el UID
      // aquí garantiza atribución correcta de auditoría y evita "No autenticado".
      _actor_uid: context.userId,
    });
    if (error) return { ok: false, error: error.message };
    return (rpcData ?? { ok: false, error: "Sin respuesta" }) as {
      ok: boolean;
      error?: string;
    };
  });
