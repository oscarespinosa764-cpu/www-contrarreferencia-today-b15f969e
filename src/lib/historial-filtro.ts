// Filtro canónico compartido del Historial de Casos (lista + exportación).
//
// FUENTE ÚNICA DE VERDAD del periodo. La resolución real (autoritativa) se
// ejecuta server-side con el reloj del servidor; el navegador sólo envía el
// modo y, cuando aplica, año/mes o fechas puras (YYYY-MM-DD).
//
// Zona horaria institucional: America/Bogota (UTC-5 fijo, sin horario de
// verano). No se usa `toISOString()` del cliente como autoridad.

import { z } from "zod";

/** Módulos funcionales reales + GENERAL (consolidación, NO es módulo). */
export const MODULOS_HISTORIAL = [
  "ENTRANTES",
  "SALIENTES",
  "ATENCION_DOMICILIARIA",
  "REFERENCIAS_INTERNAS",
  "GENERAL",
] as const;
export type ModuloHistorial = (typeof MODULOS_HISTORIAL)[number];

export const MODOS_PERIODO = [
  "ALL",
  "TODAY",
  "THIS_WEEK",
  "THIS_MONTH",
  "PREVIOUS_MONTH",
  "MONTH",
  "RANGE",
] as const;
export type ModoPeriodo = (typeof MODOS_PERIODO)[number];

export const TAMANOS_PAGINA = [10, 25, 50, 100] as const;

const fechaPura = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida (YYYY-MM-DD)");

/** DTO estricto: no acepta propiedades adicionales (ni TRAMITES como módulo). */
export const historialFilterSchema = z
  .object({
    module: z.enum(MODULOS_HISTORIAL),
    periodMode: z.enum(MODOS_PERIODO).default("ALL"),
    year: z.number().int().min(2000).max(2100).nullable().optional(),
    month: z.number().int().min(1).max(12).nullable().optional(),
    startDate: fechaPura.nullable().optional(),
    endDate: fechaPura.nullable().optional(),
    subtype: z.string().max(40).nullable().optional(),
    page: z.number().int().min(1).max(10000).default(1),
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

export type HistorialFilterInput = z.input<typeof historialFilterSchema>;
export type HistorialFilter = z.output<typeof historialFilterSchema>;

export const TZ_HISTORIAL = "America/Bogota";
/** Bogotá no aplica horario de verano: desplazamiento fijo de -5 horas. */
const OFFSET_MIN = -5 * 60;

/** Instante UTC correspondiente a una fecha/hora local de Bogotá. */
function utcDesdeLocal(y: number, m: number, d: number): Date {
  return new Date(Date.UTC(y, m - 1, d, 0, 0, 0) - OFFSET_MIN * 60_000);
}

/** Partes de la fecha local de Bogotá para un instante dado. */
function partesLocales(ahora: Date): { y: number; m: number; d: number; dow: number } {
  const local = new Date(ahora.getTime() + OFFSET_MIN * 60_000);
  return {
    y: local.getUTCFullYear(),
    m: local.getUTCMonth() + 1,
    d: local.getUTCDate(),
    dow: local.getUTCDay(), // 0 = domingo
  };
}

const dd = (n: number) => String(n).padStart(2, "0");
const fecha = (y: number, m: number, d: number) => `${y}-${dd(m)}-${dd(d)}`;

const MESES = [
  "ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO",
  "JULIO", "AGOSTO", "SEPTIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE",
];

export interface FiltroTemporalResuelto {
  mode: ModoPeriodo;
  /** Inicio inclusivo (ISO UTC) o null cuando es TODO EL HISTÓRICO. */
  startAt: string | null;
  /** Final EXCLUSIVO (ISO UTC) o null cuando llega hasta el corte actual. */
  endExclusive: string | null;
  /** Fecha inicial VISIBLE (YYYY-MM-DD, Bogotá) o null en TODO EL HISTÓRICO. */
  startDateVisible: string | null;
  /** Fecha final VISIBLE INCLUSIVA (YYYY-MM-DD, Bogotá). Nunca endExclusive. */
  endDateVisible: string;
  /** Corte autoritativo del servidor (ISO UTC). */
  cutoffAt: string;
  label: string;
  timezone: string;
  /** Sufijo canónico para el nombre de archivo (usa el intervalo VISIBLE). */
  fileSuffix: string;
}

/** Fecha local (Bogotá) de un instante UTC, en formato YYYY-MM-DD. */
function fechaLocal(inst: Date): string {
  const p = partesLocales(inst);
  return fecha(p.y, p.m, p.d);
}

/** Día VISIBLE inclusivo a partir de un final EXCLUSIVO técnico. */
function visibleDesdeExclusivo(finExcl: Date): string {
  return fechaLocal(new Date(finExcl.getTime() - 1));
}

/**
 * Resolución canónica del periodo. `ahora` DEBE ser el reloj del servidor
 * cuando se usa como autoridad (exportación/consulta).
 */
export function resolverFiltroTemporalHistorial(
  f: Pick<HistorialFilter, "periodMode" | "year" | "month" | "startDate" | "endDate">,
  ahora: Date = new Date(),
): FiltroTemporalResuelto {
  const cutoffAt = ahora.toISOString();
  const { y, m, d, dow } = partesLocales(ahora);
  const base = { mode: f.periodMode, cutoffAt, timezone: TZ_HISTORIAL };
  const hoyStr = fecha(y, m, d);

  const conRango = (ini: Date, finExcl: Date | null, label: string): FiltroTemporalResuelto => {
    const startDateVisible = fechaLocal(ini);
    // El final visible SIEMPRE es inclusivo: nunca se muestra endExclusive.
    const endDateVisible = finExcl ? visibleDesdeExclusivo(finExcl) : hoyStr;
    return {
      ...base,
      startAt: ini.toISOString(),
      endExclusive: finExcl ? finExcl.toISOString() : null,
      startDateVisible,
      endDateVisible,
      label,
      fileSuffix: `${startDateVisible}_a_${endDateVisible}`,
    };
  };

  if (f.periodMode === "TODAY") {
    return conRango(utcDesdeLocal(y, m, d), utcDesdeLocal(y, m, d + 1), `HOY ${hoyStr}`);
  }
  if (f.periodMode === "THIS_WEEK") {
    const desplazamiento = (dow + 6) % 7; // semana inicia lunes
    return conRango(utcDesdeLocal(y, m, d - desplazamiento), null, "ESTA SEMANA");
  }
  if (f.periodMode === "THIS_MONTH") {
    return conRango(utcDesdeLocal(y, m, 1), null, `${MESES[m - 1]} ${y}`);
  }
  if (f.periodMode === "PREVIOUS_MONTH") {
    const py = m === 1 ? y - 1 : y;
    const pm = m === 1 ? 12 : m - 1;
    return conRango(utcDesdeLocal(py, pm, 1), utcDesdeLocal(y, m, 1), `${MESES[pm - 1]} ${py}`);
  }
  if (f.periodMode === "MONTH") {
    const my = f.year!;
    const mm = f.month!;
    const ini = utcDesdeLocal(my, mm, 1);
    const fin = utcDesdeLocal(mm === 12 ? my + 1 : my, mm === 12 ? 1 : mm + 1, 1);
    if (ini.getTime() > ahora.getTime()) {
      throw new Error("El mes seleccionado es futuro.");
    }
    return conRango(ini, fin, `${MESES[mm - 1]} ${my}`);
  }
  if (f.periodMode === "RANGE") {
    const [sy, sm, sd] = f.startDate!.split("-").map(Number);
    const [ey, em, ed] = f.endDate!.split("-").map(Number);
    const ini = utcDesdeLocal(sy, sm, sd);
    const fin = utcDesdeLocal(ey, em, ed + 1); // final inclusivo visualmente
    if (ini.getTime() > ahora.getTime()) throw new Error("La fecha inicial es futura.");
    return conRango(ini, fin, `${f.startDate} A ${f.endDate}`);
  }
  return {
    ...base,
    startAt: null,
    endExclusive: null,
    startDateVisible: null,
    endDateVisible: hoyStr,
    label: "TODO EL HISTÓRICO",
    fileSuffix: `hasta_${hoyStr}`,
  };
}

// ============================================================
// Filtros funcionales canónicos (DTO estricto compartido)
// ============================================================

/** Subtipos reales de ATENCIÓN DOMICILIARIA. NO son módulos ni hojas. */
export const SUBTIPOS_AD = ["TODOS", "PHD", "PAD", "O2", "ESPECIALES"] as const;
export type SubtipoAD = (typeof SUBTIPOS_AD)[number];

const texto = (max: number) =>
  z
    .string()
    .max(max)
    .transform((s) => s.replace(/\s+/g, " ").trim());

/**
 * Filtros funcionales autorizados. Allowlist estricta: nunca se aceptan
 * nombres de tabla, columna, orden ni SQL desde el cliente.
 */
export const filtrosFuncionalesSchema = z
  .object({
    /** Estado funcional (texto normalizado contra columna `estado`). */
    status: texto(40).nullable().optional(),
    /** Sede/unidad institucional. */
    sede: texto(60).nullable().optional(),
    /** Documento del paciente (siempre texto, nunca número). */
    documento: texto(20).nullable().optional(),
    /** Servicio/unidad funcional. */
    servicio: texto(60).nullable().optional(),
    /** Término libre acotado (se aplica sobre columnas predefinidas). */
    searchTerm: texto(60).nullable().optional(),
    /** Subtipo exclusivo de ATENCIÓN DOMICILIARIA. */
    subtype: z.enum(SUBTIPOS_AD).nullable().optional(),
  })
  .strict();

export type FiltrosFuncionales = z.output<typeof filtrosFuncionalesSchema>;

/** Normaliza a mayúsculas sin tildes y descarta valores vacíos o comodín. */
export function normalizarFiltrosFuncionales(f: FiltrosFuncionales | null | undefined) {
  const limpio = (s: string | null | undefined, max = 60): string | null => {
    if (!s) return null;
    const v = s
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .toUpperCase()
      .slice(0, max);
    if (!v) return null;
    if (v.startsWith("TODOS") || v.startsWith("TODAS")) return null;
    return v;
  };
  const sub = f?.subtype && f.subtype !== "TODOS" ? f.subtype : null;
  return {
    status: limpio(f?.status, 40),
    sede: limpio(f?.sede),
    documento: f?.documento ? f.documento.replace(/[^0-9A-Za-z-]/g, "").slice(0, 20) || null : null,
    servicio: limpio(f?.servicio),
    searchTerm: limpio(f?.searchTerm),
    subtype: sub,
  };
}

export type FiltrosFuncionalesNormalizados = ReturnType<typeof normalizarFiltrosFuncionales>;

