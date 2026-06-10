import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

// Resuelve el correo institucional a partir del número de documento.
// Permite iniciar sesión con el documento manteniendo la autenticación por correo.
export const resolverEmailPorDocumento = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z.object({ documento: z.string().min(3).max(30).regex(/^[0-9A-Za-z.\-]+$/) }).parse(d),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: prof } = await supabaseAdmin
      .from("profiles")
      .select("user_id")
      .eq("numero_documento", data.documento.trim())
      .eq("activo", true)
      .maybeSingle();
    if (!prof?.user_id) return { email: null as string | null };
    const { data: u } = await supabaseAdmin.auth.admin.getUserById(prof.user_id);
    return { email: u.user?.email ?? null };
  });
