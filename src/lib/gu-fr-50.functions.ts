// GU-FR-50 · Server Functions canónicas (exportar / previsualizar / confirmar).
// Módulo delgado: sólo declaraciones de server functions e imports.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const MODULOS = [
  "ENTRANTES",
  "SALIENTES",
  "ATENCION DOMICILIARIA",
  "REFERENCIAS INTERNAS",
] as const;

const esquemaExport = z
  .object({
    modules: z.array(z.enum(MODULOS)).min(1).max(4),
    startDate: z.string().datetime().nullable().optional(),
    endDate: z.string().datetime().nullable().optional(),
  })
  .strict();

const esquemaHojas = z
  .object({
    hojas: z
      .array(
        z
          .object({
            nombre: z.string().max(64),
            encabezados: z.array(z.unknown()).max(64),
            filas: z.array(z.array(z.unknown()).max(64)).max(20000),
          })
          .strict(),
      )
      .max(8),
  })
  .strict();

/** Exportación server-authoritative: datos y permisos resueltos en servidor. */
export const exportarGuFr50 = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => esquemaExport.parse(d))
  .handler(async ({ data, context }) => {
    const { consultarModulo } = await import("./gu-fr-50.server");
    const { registrarAuditoriaServer } = await import("./auditoria.server");
    const filas: Record<string, unknown[]> = {};
    let total = 0;
    for (const m of data.modules) {
      const f = await consultarModulo(
        context.supabase,
        m,
        data.startDate ?? null,
        data.endDate ?? null,
      );
      filas[m] = f;
      total += f.length;
    }
    await registrarAuditoriaServer(context.userId, {
      accion: "GU_FR_50_EXPORT",
      modulo: "importaciones",
      resultado: "exito",
      detalles: {
        plantilla: "GU-FR-50",
        version: "02",
        modulos: data.modules.join(", "),
        filas: total,
      },
    }).catch(() => {});
    return { ok: true as const, filas, total };
  });

/** Previsualización: valida estructura, catálogos y duplicados. No escribe. */
export const previsualizarImportacionGuFr50 = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => esquemaHojas.parse(d))
  .handler(async ({ data, context }) => {
    const { analizarLote } = await import("./gu-fr-50.server");
    const { registrarAuditoriaServer } = await import("./auditoria.server");
    const r = await analizarLote(context.supabase, data.hojas as never);
    await registrarAuditoriaServer(context.userId, {
      accion: "GU_FR_50_PREVIEW",
      modulo: "importaciones",
      resultado: r.estructura.length === 0 ? "exito" : "error",
      detalles: { plantilla: "GU-FR-50", version: "02", errores: r.errores.length },
    }).catch(() => {});
    return {
      ok: r.ok,
      estructura: r.estructura,
      resumen: r.resumen,
      errores: r.errores.slice(0, 200),
    };
  });

/** Confirmación transaccional: revalida todo y ejecuta una única RPC atómica. */
export const confirmarImportacionGuFr50 = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => esquemaHojas.parse(d))
  .handler(async ({ data, context }) => {
    const { analizarLote } = await import("./gu-fr-50.server");
    const { registrarAuditoriaServer } = await import("./auditoria.server");
    // No se confía en la previsualización del navegador: se revalida todo.
    const r = await analizarLote(context.supabase, data.hojas as never);
    if (r.estructura.length > 0 || !r.ok) {
      await registrarAuditoriaServer(context.userId, {
        accion: "GU_FR_50_IMPORT_FAILED",
        modulo: "importaciones",
        resultado: "error",
        detalles: { plantilla: "GU-FR-50", version: "02", errores: r.errores.length },
      }).catch(() => {});
      return {
        ok: false as const,
        error: "El archivo tiene errores. Corrígelos y vuelve a previsualizar.",
        estructura: r.estructura,
        errores: r.errores.slice(0, 200),
      };
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: res, error } = await supabaseAdmin.schema("private" as never).rpc(
      "importar_gu_fr_50" as never,
      { _actor: context.userId, _lote: r.lote } as never,
    );
    if (error) {
      await registrarAuditoriaServer(context.userId, {
        accion: "GU_FR_50_IMPORT_FAILED",
        modulo: "importaciones",
        resultado: "error",
        detalles: { plantilla: "GU-FR-50", version: "02", motivo: error.message.slice(0, 120) },
      }).catch(() => {});
      return { ok: false as const, error: error.message, estructura: [], errores: [] };
    }
    return { ok: true as const, resultado: res as Record<string, unknown> };
  });
