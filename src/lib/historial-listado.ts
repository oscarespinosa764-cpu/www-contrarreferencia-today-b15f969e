// ============================================================
// Historial de Casos · CONTRATO CANÓNICO de consulta y respuesta.
//
// Este módulo es client-safe: define el DTO estricto, la respuesta tipada
// y la construcción determinista de la query key. La resolución real del
// periodo y de los filtros se hace SIEMPRE server-side reutilizando
// src/lib/historial-filtro.ts (misma normalización que la exportación).
// ============================================================

import { z } from "zod";

import {
  MODOS_PERIODO,
  MODULOS_HISTORIAL,
  SUBTIPOS_AD,
  TAMANOS_PAGINA,
  normalizarFiltrosFuncionales,
  type ModuloHistorial,
} from "./historial-filtro";

const fechaPura = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida (YYYY-MM-DD)");

/**
 * DTO estricto del listado. No acepta propiedades adicionales: nombres de
 * tabla, columna, orden, rol, cargo, userId, total o cutoffAt provenientes
 * del cliente son rechazados por el propio schema.
 */
export const historialQuerySchema = z
  .object({
    module: z.enum(MODULOS_HISTORIAL),
    periodMode: z.enum(MODOS_PERIODO).default("ALL"),
    year: z.number().int().min(2000).max(2100).nullable().optional(),
    month: z.number().int().min(1).max(12).nullable().optional(),
    startDate: fechaPura.nullable().optional(),
    endDate: fechaPura.nullable().optional(),
    /** Tipo de caso (sólo ENTRANTES: ACEP/NEG/CAN/ING/AMP...). */
    caseType: z.string().max(20).nullable().optional(),
    status: z.string().max(40).nullable().optional(),
    sede: z.string().max(60).nullable().optional(),
    documento: z.string().max(20).nullable().optional(),
    servicio: z.string().max(60).nullable().optional(),
    searchTerm: z.string().max(60).nullable().optional(),
    subtype: z.enum(SUBTIPOS_AD).nullable().optional(),
    page: z.number().int().min(1).max(100000).default(1),
    pageSize: z
      .number()
      .int()
      .refine((n) => (TAMANOS_PAGINA as readonly number[]).includes(n), "pageSize no permitido")
      .default(25),
  })
  .strict()
  .superRefine((d, ctx) => {
    if (d.periodMode === "MONTH" && (!d.year || !d.month)) {
      ctx.addIssue({ code: "custom", message: "Mes específico requiere año y mes." });
    }
    if (d.periodMode === "RANGE") {
      if (!d.startDate || !d.endDate) {
        ctx.addIssue({ code: "custom", message: "El rango requiere fecha inicial y final." });
      } else if (d.startDate > d.endDate) {
        ctx.addIssue({ code: "custom", message: "La fecha inicial no puede ser posterior a la final." });
      }
    }
  });

export type HistorialQueryInput = z.input<typeof historialQuerySchema>;
export type HistorialQuery = z.output<typeof historialQuerySchema>;

/** Unidad VISUAL canónica (una tarjeta), no una fila intermedia. */
export interface HistorialUnidad {
  modulo: ModuloHistorial;
  /** Clave funcional del grupo (cod_ref/código en Entrantes; id en el resto). */
  unitKey: string;
  /** Ids de las filas que componen la unidad ("hist-<uuid>" para históricos). */
  ids: string[];
  fechaFuncional: string | null;
}

export interface HistorialQueryResult {
  rows: HistorialUnidad[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  appliedFilter: {
    module: ModuloHistorial;
    periodMode: string;
    caseType: string | null;
    status: string | null;
    sede: string | null;
    documento: string | null;
    servicio: string | null;
    searchTerm: string | null;
    subtype: string | null;
  };
  visibleInterval: { start: string | null; end: string };
  technicalInterval: { startAt: string | null; endExclusive: string | null };
  cutoffAt: string;
  label: string;
  missingFunctionalDateCount: number;
  /** Sólo en GENERAL: total por módulo real (nunca una quinta fuente). */
  totalsByModule: Record<string, number>;
}

/**
 * Query key determinista: incluye TODOS los valores que alteran la respuesta,
 * ya normalizados (mismo saneamiento que aplica el servidor).
 */
export function historialQueryKey(f: HistorialQueryInput): (string | number | null)[] {
  const n = normalizarFiltrosFuncionales({
    status: f.status ?? null,
    sede: f.sede ?? null,
    documento: f.documento ?? null,
    servicio: f.servicio ?? null,
    searchTerm: f.searchTerm ?? null,
    subtype: f.subtype ?? null,
  });
  const caseType = f.caseType && !f.caseType.startsWith("TODO") ? f.caseType.toUpperCase() : null;
  return [
    "historial-listado",
    f.module,
    f.periodMode ?? "ALL",
    f.year ?? null,
    f.month ?? null,
    f.startDate ?? null,
    f.endDate ?? null,
    caseType,
    n.status,
    n.sede,
    n.documento,
    n.servicio,
    n.searchTerm,
    n.subtype,
    f.page ?? 1,
    f.pageSize ?? 25,
  ];
}
