// FUENTE CANÓNICA ÚNICA del módulo de Indicadores.
// Todo consumidor (tarjetas, ranking, detalle, gráficos, histórico, selector
// mensual) debe leer de aquí. No duplicar fórmulas ni reglas de SIN DATO.

import {
  type Indicador,
  type Medicion,
  type Semaforo,
  calcularResultado,
  calcularSemaforo,
} from "./indicadores-utils";

// ── Precedencia determinística de fuentes para un mismo periodo ───────────
// 1 = mayor autoridad. Un periodo tiene UNA sola versión canónica visible.
const PRECEDENCIA: Record<string, number> = {
  AJUSTE_MANUAL: 1,
  MANUAL: 2,
  MANUAL_HISTORICA_IMPORTADA: 3,
  AUTOMATICA: 4,
  AUTOMATICA_CONCILIACION: 5,
};
const PRECEDENCIA_DESCONOCIDA = 9;

export function prioridadFuente(tipo?: string | null): number {
  if (!tipo) return PRECEDENCIA_DESCONOCIDA;
  return PRECEDENCIA[String(tipo).toUpperCase()] ?? PRECEDENCIA_DESCONOCIDA;
}

export function etiquetaFuente(tipo?: string | null): string {
  switch (String(tipo ?? "").toUpperCase()) {
    case "MANUAL_HISTORICA_IMPORTADA":
      return "Oficial (Excel histórico)";
    case "MANUAL":
      return "Manual";
    case "AJUSTE_MANUAL":
      return "Ajuste manual";
    case "AUTOMATICA":
      return "Automática";
    case "AUTOMATICA_CONCILIACION":
      return "Automática (conciliación)";
    default:
      return tipo ? String(tipo) : "Sin clasificar";
  }
}

// ── Contexto temporal (fecha de corte server-side, America/Bogota) ────────
export type ContextoTemporal = {
  /** YYYY-MM-DD en America/Bogota, derivado del servidor. */
  fechaCorte: string;
  /** HH:mm en America/Bogota. */
  horaCorte: string;
  /** YYYY-MM del mes en curso. */
  periodoActual: string;
  /** YYYY-MM del último mes cerrado (mes anterior). */
  periodoUltimoCerrado: string;
};

/** Deriva el contexto temporal a partir de una fecha YYYY-MM-DD ya localizada. */
export function contextoDesdeFecha(fecha: string, hora = "00:00"): ContextoTemporal {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fecha);
  const anio = m ? Number(m[1]) : new Date().getUTCFullYear();
  const mes = m ? Number(m[2]) : new Date().getUTCMonth() + 1;
  const pad = (n: number) => String(n).padStart(2, "0");
  const prevMes = mes === 1 ? 12 : mes - 1;
  const prevAnio = mes === 1 ? anio - 1 : anio;
  return {
    fechaCorte: fecha,
    horaCorte: hora,
    periodoActual: `${anio}-${pad(mes)}`,
    periodoUltimoCerrado: `${prevAnio}-${pad(prevMes)}`,
  };
}

/** Primer y último día calendario del periodo YYYY-MM. */
export function rangoPeriodo(periodo: string): { inicio: string; fin: string } {
  const m = /^(\d{4})-(\d{2})/.exec(periodo || "");
  if (!m) return { inicio: "—", fin: "—" };
  const anio = Number(m[1]);
  const mes = Number(m[2]);
  const ultimo = new Date(Date.UTC(anio, mes, 0)).getUTCDate();
  return {
    inicio: `${m[1]}-${m[2]}-01`,
    fin: `${m[1]}-${m[2]}-${String(ultimo).padStart(2, "0")}`,
  };
}

// ── Registro canónico por periodo ─────────────────────────────────────────
export type EstadoDato = "CALCULADO" | "NO_CALCULABLE" | "SIN_REGISTRO";

export type PeriodoCanonico = {
  medicionId: string;
  indicadorId: string;
  periodo: string;
  anio: number;
  mes: number;
  fechaInicio: string;
  fechaFin: string;
  /** Hasta cuándo se calculó el dato (fin de mes o fecha de corte si es parcial). */
  fechaCorte: string;
  numerador: number | null;
  denominador: number | null;
  resultado: number | null;
  unidad: string;
  meta: number | null;
  cumplimiento: number | null;
  semaforo: Semaforo;
  estadoDato: EstadoDato;
  esParcial: boolean;
  esMesCerrado: boolean;
  tipoMedicion: string | null;
  fuente: string;
  fuenteMedicion: string | null;
  notaMetodologica: string | null;
  comentario: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  /** Existía más de un registro para el periodo y se aplicó precedencia. */
  duplicado: boolean;
  /** Duplicidad no resoluble: misma prioridad y resultados distintos. */
  duplicadoNoResoluble: boolean;
  /** Todos los registros del periodo (para conciliación). */
  variantes: Medicion[];
};

const numOrNull = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export function esMenorEsMejor(ind: Pick<Indicador, "sentido">): boolean {
  return String(ind.sentido || "MAYOR_ES_MEJOR").toUpperCase() === "MENOR_ES_MEJOR";
}

/**
 * Cumplimiento porcentual respetando el sentido del indicador.
 * NO es el resultado: para MENOR_ES_MEJOR es meta/resultado.
 */
export function calcularCumplimiento(
  sentido: string | null,
  resultado: number | null,
  meta: number | null,
): number | null {
  if (resultado === null || !Number.isFinite(resultado)) return null;
  const m = meta === null ? null : Number(meta);
  if (m === null || !Number.isFinite(m) || m === 0) return null;
  if (String(sentido || "MAYOR_ES_MEJOR").toUpperCase() === "MENOR_ES_MEJOR") {
    if (resultado <= 0) return 100;
    return (m / resultado) * 100;
  }
  return (resultado / m) * 100;
}

function normalizarFila(
  ind: Indicador,
  med: Medicion,
  variantes: Medicion[],
  ctx: ContextoTemporal,
  duplicadoNoResoluble: boolean,
): PeriodoCanonico {
  const periodo = String(med.periodo ?? "").slice(0, 7);
  const [anioStr, mesStr] = periodo.split("-");
  const numerador = numOrNull(med.numerador_valor);
  const denominador = numOrNull(med.denominador_valor);
  // El resultado almacenado manda; solo se deriva si falta y hay num/den.
  let resultado = numOrNull(med.resultado);
  let estadoDato: EstadoDato = "CALCULADO";
  if (resultado === null) {
    if (denominador !== null && denominador === 0) {
      estadoDato = "NO_CALCULABLE";
    } else if (numerador !== null && denominador !== null) {
      resultado = calcularResultado(ind.tipo, numerador, denominador);
      if (resultado === null) estadoDato = "NO_CALCULABLE";
    } else {
      estadoDato = "NO_CALCULABLE";
    }
  }
  const meta = numOrNull(med.meta) ?? numOrNull(ind.meta);
  const unidad = med.unidad || ind.unidad || "";
  const cumplimiento = calcularCumplimiento(ind.sentido, resultado, meta);
  // Un semáforo almacenado vacío NO significa "sin dato": se recalcula.
  const semaforoGuardado = String(med.semaforo ?? "").toUpperCase();
  const semaforo: Semaforo =
    semaforoGuardado === "VERDE" || semaforoGuardado === "AMARILLO" || semaforoGuardado === "ROJO"
      ? (semaforoGuardado as Semaforo)
      : calcularSemaforo(resultado, meta, ind.sentido);
  const rango = rangoPeriodo(periodo);
  const esParcial = periodo === ctx.periodoActual;
  return {
    medicionId: med.id,
    indicadorId: med.indicador_id,
    periodo,
    anio: Number(anioStr) || 0,
    mes: Number(mesStr) || 0,
    fechaInicio: rango.inicio,
    fechaFin: rango.fin,
    fechaCorte: esParcial ? ctx.fechaCorte : rango.fin,
    numerador,
    denominador,
    resultado,
    unidad,
    meta,
    cumplimiento,
    semaforo,
    estadoDato,
    esParcial,
    esMesCerrado: periodo < ctx.periodoActual,
    tipoMedicion: med.tipo_medicion ?? null,
    fuente: etiquetaFuente(med.tipo_medicion),
    fuenteMedicion: med.fuente_medicion ?? null,
    notaMetodologica: med.nota_metodologica ?? null,
    comentario: med.comentario ?? null,
    createdAt: med.created_at ?? null,
    updatedAt: med.calculado_at ?? med.fecha ?? med.created_at ?? null,
    duplicado: variantes.length > 1,
    duplicadoNoResoluble,
    variantes,
  };
}

/**
 * Serie canónica completa de un indicador, ascendente por periodo.
 * Incluye TODOS los años cargados (sin límite de 12 registros).
 */
export function serieCanonica(
  ind: Indicador,
  mediciones: Medicion[],
  ctx: ContextoTemporal,
): PeriodoCanonico[] {
  const porPeriodo = new Map<string, Medicion[]>();
  for (const m of mediciones) {
    if (m.indicador_id !== ind.id) continue;
    const p = String(m.periodo ?? "").slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(p)) continue;
    const arr = porPeriodo.get(p);
    if (arr) arr.push(m);
    else porPeriodo.set(p, [m]);
  }
  const out: PeriodoCanonico[] = [];
  for (const [periodo, variantes] of porPeriodo) {
    const ordenadas = [...variantes].sort((a, b) => {
      const d = prioridadFuente(a.tipo_medicion) - prioridadFuente(b.tipo_medicion);
      if (d !== 0) return d;
      // Empate: gana la más reciente.
      return String(b.created_at ?? "").localeCompare(String(a.created_at ?? ""));
    });
    const elegida = ordenadas[0]!;
    const empatadas = ordenadas.filter(
      (m) => prioridadFuente(m.tipo_medicion) === prioridadFuente(elegida.tipo_medicion),
    );
    const noResoluble =
      empatadas.length > 1 &&
      new Set(empatadas.map((m) => String(m.resultado ?? ""))).size > 1;
    out.push(normalizarFila(ind, elegida, ordenadas, ctx, noResoluble));
    void periodo;
  }
  return out.sort((a, b) => a.periodo.localeCompare(b.periodo));
}

// ── Regla canónica del ranking ────────────────────────────────────────────
export type OrigenCanonico = "PARCIAL" | "MES_CERRADO" | "ULTIMO_HISTORICO" | "SIN_DATO";

export type ResolucionCanonica = {
  fila: PeriodoCanonico | null;
  origen: OrigenCanonico;
  etiquetaPeriodo: string;
};

const MES_CORTO = [
  "ENE", "FEB", "MAR", "ABR", "MAY", "JUN",
  "JUL", "AGO", "SEP", "OCT", "NOV", "DIC",
];

export function etiquetaPeriodoCorta(periodo: string): string {
  const m = /^(\d{4})-(\d{2})/.exec(periodo || "");
  if (!m) return "—";
  return `${MES_CORTO[Number(m[2]) - 1] ?? m[2]} ${m[1]}`;
}

/**
 * Prioridad: 1) parcial del mes actual · 2) último mes cerrado ·
 * 3) último periodo histórico válido · 4) SIN DATO (solo si no hay ninguno).
 * Un resultado 0 es válido: no se degrada a SIN DATO.
 */
export function resolverCanonico(
  serie: PeriodoCanonico[],
  ctx: ContextoTemporal,
): ResolucionCanonica {
  const validos = serie.filter((f) => f.resultado !== null);
  const parcial = validos.find((f) => f.periodo === ctx.periodoActual);
  if (parcial) {
    return {
      fila: parcial,
      origen: "PARCIAL",
      etiquetaPeriodo: `PARCIAL AL ${ctx.fechaCorte.split("-").reverse().join("/")}`,
    };
  }
  const cerrado = validos.find((f) => f.periodo === ctx.periodoUltimoCerrado);
  if (cerrado) {
    return {
      fila: cerrado,
      origen: "MES_CERRADO",
      etiquetaPeriodo: etiquetaPeriodoCorta(cerrado.periodo),
    };
  }
  const ultimo = validos.at(-1);
  if (ultimo) {
    return {
      fila: ultimo,
      origen: "ULTIMO_HISTORICO",
      etiquetaPeriodo: `ÚLTIMO DATO: ${etiquetaPeriodoCorta(ultimo.periodo)}`,
    };
  }
  // Sin resultado válido pero con registro: NO CALCULABLE, no SIN DATO.
  const cualquiera = serie.at(-1);
  if (cualquiera) {
    return {
      fila: cualquiera,
      origen: "ULTIMO_HISTORICO",
      etiquetaPeriodo: `NO CALCULABLE · ${etiquetaPeriodoCorta(cualquiera.periodo)}`,
    };
  }
  return { fila: null, origen: "SIN_DATO", etiquetaPeriodo: "SIN DATO" };
}

/** Formatea un valor numérico conservando el cero como valor válido. */
export function fmtNum(v: number | null | undefined, sufijo = ""): string {
  if (v === null || v === undefined || !Number.isFinite(Number(v))) return "NO APLICA";
  const n = Number(v);
  const s = Number.isInteger(n) ? String(n) : n.toFixed(2);
  return sufijo ? `${s} ${sufijo}`.trim() : s;
}
