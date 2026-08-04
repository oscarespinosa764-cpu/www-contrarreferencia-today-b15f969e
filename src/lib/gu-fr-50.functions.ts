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
    // Allowlist de casos concretos (exportación puntual desde Historial).
    casoIds: z.array(z.string().uuid()).max(50).nullable().optional(),
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
    const filas: Record<string, Record<string, string | number | null>[]> = {};
    let total = 0;
    for (const m of data.modules) {
      const f = await consultarModulo(
        context.supabase,
        m,
        data.startDate ?? null,
        data.endDate ?? null,
      );
      filas[m] = f as Record<string, string | number | null>[];
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
    const { analizarLote, huellaLote } = await import("./gu-fr-50.server");
    const { registrarAuditoriaServer } = await import("./auditoria.server");
    const importId = crypto.randomUUID();
    // No se confía en la previsualización del navegador: se revalida todo.
    const r = await analizarLote(context.supabase, data.hojas as never);
    const hash = huellaLote(r.lote);
    const modulos = Object.keys(r.lote).join(", ");
    if (r.estructura.length > 0 || !r.ok) {
      // Auditoría de intento fallido: fuera de cualquier transacción de importación.
      await registrarAuditoriaServer(context.userId, {
        accion: "GU_FR_50_IMPORT_FAILED",
        modulo: "importaciones",
        resultado: "error",
        detalles: {
          plantilla: "GU-FR-50", version: "02", import_id: importId, hash,
          modulos, etapa: "VALIDACION", codigo: "VALIDACION_FALLIDA",
          errores: r.errores.length, timestamp: new Date().toISOString(),
        },
      }).catch((e) => console.error("[GU-FR-50] auditoría de fallo no registrada", e));
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
      { _actor: context.userId, _lote: r.lote, _import_id: importId } as never,
    );
    if (error) {
      // La transacción de la RPC ya fue revertida por completo; esta auditoría
      // se registra en una operación server-side independiente.
      await registrarAuditoriaServer(context.userId, {
        accion: "GU_FR_50_IMPORT_FAILED",
        modulo: "importaciones",
        resultado: "error",
        detalles: {
          plantilla: "GU-FR-50", version: "02", import_id: importId, hash,
          modulos, etapa: "TRANSACCION", codigo: error.code ?? "RPC_ERROR",
          motivo: error.message.slice(0, 120), timestamp: new Date().toISOString(),
        },
      }).catch((e) => console.error("[GU-FR-50] auditoría de fallo no registrada", e));
      return { ok: false as const, error: error.message, estructura: [], errores: [] };
    }
    const out = (res ?? {}) as {
      recibidas?: number; insertadas?: number; omitidas?: number; ambiguas?: number;
    };
    return {
      ok: true as const,
      importId,
      recibidas: Number(out.recibidas ?? 0),
      insertadas: Number(out.insertadas ?? 0),
      omitidas: Number(out.omitidas ?? 0),
      ambiguas: Number(out.ambiguas ?? 0),
    };
  });

