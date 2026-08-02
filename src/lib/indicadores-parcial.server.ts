// Helpers server-only para el cálculo parcial del mes en curso.
// Se mantiene fuera de *.functions.ts (regla de splitting de server fns).

export type LimitesPeriodoActual = {
  fecha: string; // YYYY-MM-DD (America/Bogota)
  hora: string; // HH:mm (America/Bogota)
  periodoActual: string; // YYYY-MM
  inicioMesActual: string; // YYYY-MM-01 (fecha local Bogota)
  cutoffIso: string; // instante de corte en UTC (ISO)
  zona: "America/Bogota";
};

/** Deriva los límites del periodo actual usando exclusivamente la hora del servidor. */
export function limitesPeriodoActual(now = new Date()): LimitesPeriodoActual {
  const fecha = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const hora = new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Bogota",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(now);
  const periodoActual = fecha.slice(0, 7);
  return {
    fecha,
    hora,
    periodoActual,
    inicioMesActual: `${periodoActual}-01`,
    cutoffIso: now.toISOString(),
    zona: "America/Bogota",
  };
}

/** Allowlist estricta de indicadores con cálculo operativo automático. */
export const CODIGOS_PARCIALES = [
  "IND-INST-01",
  "IND-INST-02",
  "IND-INST-03",
  "IND-INST-04",
] as const;

export type FilaParcialRpc = {
  out_codigo: string;
  out_num: number | null;
  out_den: number | null;
  out_res: number | null;
  out_unidad: string | null;
  out_casos: number | null;
  out_fuente: string | null;
};

export function normalizarFilasParciales(rows: FilaParcialRpc[]) {
  const permitidos = new Set<string>(CODIGOS_PARCIALES);
  const num = (v: unknown) => {
    if (v === null || v === undefined) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  return rows
    .filter((r) => permitidos.has(String(r.out_codigo)))
    .map((r) => ({
      codigo: String(r.out_codigo),
      numerador: num(r.out_num),
      denominador: num(r.out_den),
      resultado: num(r.out_res),
      unidad: r.out_unidad ?? "",
      casos: num(r.out_casos) ?? 0,
      fuenteOperativa: r.out_fuente ?? "",
    }));
}
