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
    /** GENERAL = las cuatro hojas; INDIVIDUAL = una sola hoja canónica. */
    scope: z.enum(["GENERAL", "INDIVIDUAL"]).default("GENERAL"),
    modules: z.array(z.enum(MODULOS)).min(1).max(4),
    /** Subtipo funcional (sólo ATENCION DOMICILIARIA: PHD/PAD/O2/ESPECIALES). */
    subtype: z.enum(["TODOS", "PHD", "PAD", "O2", "ESPECIALES"]).nullable().optional(),
    /** Filtros funcionales compartidos con el listado (allowlist estricta). */
    status: z.string().max(40).nullable().optional(),
    sede: z.string().max(60).nullable().optional(),
    documento: z.string().max(20).nullable().optional(),
    servicio: z.string().max(60).nullable().optional(),
    searchTerm: z.string().max(60).nullable().optional(),
    periodMode: z
      .enum(["ALL", "TODAY", "THIS_WEEK", "THIS_MONTH", "PREVIOUS_MONTH", "MONTH", "RANGE"])
      .default("ALL"),
    year: z.number().int().min(2000).max(2100).nullable().optional(),
    month: z.number().int().min(1).max(12).nullable().optional(),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
    // Allowlist de casos concretos (exportación puntual desde Historial).
    casoIds: z.array(z.string().uuid()).max(50).nullable().optional(),
  })
  .strict()
  .refine((d) => d.scope !== "INDIVIDUAL" || d.modules.length === 1, {
    message: "La exportación individual admite exactamente un módulo.",
  });

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
      .min(1)
      .max(8),
  })
  .strict();

/** Exportación server-authoritative: datos, periodo y permisos en servidor. */
export const exportarGuFr50 = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => esquemaExport.parse(d))
  .handler(async ({ data, context }) => {
    const { consultarModulo } = await import("./gu-fr-50.server");
    const { resolverFiltroTemporalHistorial, normalizarFiltrosFuncionales } = await import(
      "./historial-filtro"
    );
    const { registrarAuditoriaServer } = await import("./auditoria.server");
    // El periodo SIEMPRE se resuelve con el reloj del servidor (America/Bogota)
    // y un ÚNICO corte para todos los módulos del mismo archivo.
    const rango = resolverFiltroTemporalHistorial(
      {
        periodMode: data.periodMode,
        year: data.year ?? null,
        month: data.month ?? null,
        startDate: data.startDate ?? null,
        endDate: data.endDate ?? null,
      },
      new Date(),
    );
    const filtros = normalizarFiltrosFuncionales({
      status: data.status ?? null,
      sede: data.sede ?? null,
      documento: data.documento ?? null,
      servicio: data.servicio ?? null,
      searchTerm: data.searchTerm ?? null,
      subtype: data.subtype ?? null,
    });
    const filas: Record<string, Record<string, string | number | null>[]> = {};
    let total = 0;
    let lotes = 0;
    for (const m of data.modules) {
      const r = await consultarModulo(
        context.supabase,
        m,
        rango.startAt,
        rango.endExclusive,
        data.casoIds ?? null,
        filtros,
      );
      filas[m] = r.filas as Record<string, string | number | null>[];
      total += r.total;
      lotes += r.lotes;
    }
    await registrarAuditoriaServer(context.userId, {
      accion: "GU_FR_50_EXPORT",
      modulo: "importaciones",
      resultado: "exito",
      detalles: {
        plantilla: "GU-FR-50",
        version: "02",
        alcance: data.scope,
        modulos: data.modules.join(", "),
        periodo: rango.label,
        corte: rango.cutoffAt,
        intervalo_tecnico: `${rango.startAt ?? "-"} a ${rango.endExclusive ?? "-"} (excl.)`,
        intervalo_visible: `${rango.startDateVisible ?? "-"} a ${rango.endDateVisible}`,
        subtipo: filtros.subtype ?? "TODOS",
        filtros: JSON.stringify(filtros),
        lotes,
        filas: total,
      },
    }).catch(() => {});
    return { ok: true as const, filas, total, lotes, rango, filtros };
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

