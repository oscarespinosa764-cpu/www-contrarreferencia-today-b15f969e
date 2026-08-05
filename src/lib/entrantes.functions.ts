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

export const ampliarCupoEntrante = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ampliarCupoSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { ampliarCupoServer } = await import("@/lib/entrantes.server");
    return ampliarCupoServer(context.supabase, context.userId, data);
  });

export const cancelarCupoEntrante = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => cancelarCupoSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { cancelarCupoServer } = await import("@/lib/entrantes.server");
    return cancelarCupoServer(context.supabase, context.userId, data);
  });
