import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Public-facing audit entry point for the client. The action metadata comes
// from the caller, but the user id is taken from the verified session on the
// server — a browser can no longer forge entries for other users or bypass
// the active-member check.
export const registrarAuditoria = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: {
      accion: string;
      modulo?: string | null;
      tabla?: string | null;
      registroId?: string | null;
      resultado?: string | null;
      detalles?: Record<string, unknown> | null;
    }) => {
      if (!data || typeof data.accion !== "string" || data.accion.length === 0) {
        throw new Error("accion requerida");
      }
      return {
        accion: data.accion.slice(0, 120),
        modulo: data.modulo ?? null,
        tabla: data.tabla ?? null,
        registroId: data.registroId ?? null,
        resultado: data.resultado ?? "exito",
        detalles: data.detalles ?? null,
      };
    },
  )
  .handler(async ({ data, context }) => {
    const { registrarAuditoriaServer } = await import("./auditoria.server");
    await registrarAuditoriaServer(context.userId, data);
    return { ok: true };
  });
