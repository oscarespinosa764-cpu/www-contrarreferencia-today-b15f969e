// Envoltura delgada: solo declaraciones de server functions.
// Toda la lógica vive en entrantes.server.ts (server-only).
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  crearCasoEntranteSchema,
  confirmarIngresoSchema,
  ampliarCupoSchema,
  cancelarCupoSchema,
} from "@/lib/entrantes-dto";


export const crearCasoEntrante = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => crearCasoEntranteSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { crearCasoEntranteServer } = await import("@/lib/entrantes.server");
    return crearCasoEntranteServer(context.supabase, context.userId, data);
  });

export const confirmarIngresoEntrante = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => confirmarIngresoSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { confirmarIngresoServer } = await import("@/lib/entrantes.server");
    return confirmarIngresoServer(context.supabase, context.userId, data);
  });
