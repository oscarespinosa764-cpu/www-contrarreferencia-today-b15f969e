// Server function that exposes the active-member directory to signed-in users
// without granting EXECUTE on the underlying SECURITY DEFINER function to the
// `authenticated` role. The DB function is callable only via service_role;
// this wrapper verifies the caller session + active membership before invoking.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getDirectorioActivos = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    // Verify caller is an active member using the RLS-scoped client.
    const { data: isActive, error: memberErr } = await context.supabase.rpc(
      "is_active_member",
      { _user_id: context.userId },
    );
    if (memberErr || !isActive) {
      throw new Error("No autorizado");
    }
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    const { data, error } = await supabaseAdmin.rpc("get_directorio_activos");
    if (error) throw new Error(error.message);
    return (data ?? []) as Array<{
      user_id: string;
      nombre: string | null;
      cargo: string | null;
      sede: string | null;
    }>;
  });
