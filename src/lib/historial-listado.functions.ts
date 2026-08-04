// Historial de Casos · Server Functions canónicas (listado y búsqueda).
// Módulo delgado: sólo declaraciones de server functions e imports.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

import { historialQuerySchema } from "./historial-listado";

/** Listado server-authoritative del Historial (RLS del usuario autenticado). */
export const listarHistorialCasos = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => historialQuerySchema.parse(data))
  .handler(async ({ data, context }) => {
    const { listarHistorialServer } = await import("./historial-listado.server");
    return listarHistorialServer(context.supabase as never, data);
  });

/** Búsqueda de pacientes (documento o nombre) server-side, máximo 50. */
export const buscarPacientesHistorial = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ termino: z.string().max(60) }).strict().parse(data))
  .handler(async ({ data, context }) => {
    const { buscarPacientesServer } = await import("./historial-listado.server");
    return buscarPacientesServer(context.supabase as never, data.termino);
  });
