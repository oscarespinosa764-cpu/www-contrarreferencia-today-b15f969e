// Lógica de cálculo de indicadores (resultado, semáforo, tendencia) portada de
// la bitácora operativa original para mantener el mismo comportamiento.

export type Indicador = {
  id: string;
  codigo: string | null;
  nombre: string | null;
  tipo: string | null;
  descripcion: string | null;
  numerador: string | null;
  denominador: string | null;
  meta: number | null;
  unidad: string | null;
  sentido: string | null;
  fuente: string | null;
  responsable: string | null;
  activo: boolean;
  archivado: boolean;
};

export type Medicion = {
  id: string;
  indicador_id: string;
  periodo: string | null;
  numerador_valor: number | null;
  denominador_valor: number | null;
  resultado: number | null;
  meta: number | null;
  unidad: string | null;
  semaforo: string | null;
  comentario: string | null;
  fecha: string | null;
  created_at: string;
};

export type Semaforo = "VERDE" | "AMARILLO" | "ROJO" | "GRIS";

export const TIPOS_INDICADOR = ["PROPORCION", "OPORTUNIDAD", "PROMEDIO"];
export const UNIDADES_INDICADOR = ["%", "HORAS", "DIAS", "CASOS"];
export const SENTIDOS_INDICADOR = ["MAYOR_ES_MEJOR", "MENOR_ES_MEJOR"];

const norm = (v: unknown) =>
  String(v ?? "")
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

function redondear(n: number, dec = 2) {
  const p = Math.pow(10, dec);
  return Math.round((Number(n) || 0) * p) / p;
}

/** Calcula el resultado según el tipo de indicador. Devuelve null si no es calculable. */
export function calcularResultado(
  tipo: string | null,
  numerador: number,
  denominador: number,
): number | null {
  const t = norm(tipo || "PROPORCION");
  const num = Number(numerador || 0);
  const den = Number(denominador || 0);
  if (t === "PROPORCION") return den > 0 ? redondear((num / den) * 100) : null;
  if (t === "OPORTUNIDAD" || t === "PROMEDIO") return den > 0 ? redondear(num / den) : redondear(num);
  return redondear(num);
}

/** Determina el color de semáforo a partir del resultado, la meta y el sentido. */
export function calcularSemaforo(
  resultado: number | null,
  meta: number | null,
  sentido: string | null,
): Semaforo {
  if (resultado === null || resultado === undefined || Number.isNaN(Number(resultado))) return "GRIS";
  const r = Number(resultado);
  const m = Number(meta || 0);
  if (!m) return "GRIS";
  if (norm(sentido) === "MENOR_ES_MEJOR") {
    if (r <= m) return "VERDE";
    if (r <= m * 1.2) return "AMARILLO";
    return "ROJO";
  }
  if (r >= m) return "VERDE";
  if (r >= m * 0.8) return "AMARILLO";
  return "ROJO";
}

/** Devuelve la última medición (por periodo) de cada indicador. */
export function ultimaMedicionPorIndicador(mediciones: Medicion[]): Record<string, Medicion> {
  const out: Record<string, Medicion> = {};
  for (const m of mediciones) {
    const prev = out[m.indicador_id];
    const key = (x: Medicion) => String(x.periodo || x.created_at || "");
    if (!prev || key(m) > key(prev)) out[m.indicador_id] = m;
  }
  return out;
}

/** Historial ordenado por periodo (ascendente) para un indicador, últimos 12. */
export function historialIndicador(mediciones: Medicion[], indicadorId: string): Medicion[] {
  return mediciones
    .filter((m) => m.indicador_id === indicadorId)
    .sort((a, b) => String(a.periodo || "").localeCompare(String(b.periodo || "")))
    .slice(-12);
}

/** Texto de tendencia comparando las dos últimas mediciones. */
export function tendenciaTexto(historial: Medicion[], sentido: string | null): string {
  const vals = historial.map((m) => Number(m.resultado)).filter((v) => !Number.isNaN(v));
  if (vals.length < 2) return "Sin tendencia suficiente";
  const last = vals[vals.length - 1];
  const prev = vals[vals.length - 2];
  if (last === prev) return "Tendencia estable";
  const menorMejor = norm(sentido || "MAYOR_ES_MEJOR") === "MENOR_ES_MEJOR";
  const mejora = menorMejor ? last < prev : last > prev;
  return mejora ? "Tendencia mejora" : "Tendencia por revisar";
}

/** Lectura/brecha frente a la meta. */
export function lecturaBrecha(ind: Indicador, med: Medicion | undefined): string {
  const resultado = med ? Number(med.resultado) : NaN;
  const meta = Number(med?.meta ?? ind.meta ?? 0);
  const unidad = med?.unidad || ind.unidad || "";
  if (Number.isNaN(resultado) || !meta) return "Pendiente de medición o meta.";
  const menorMejor = norm(ind.sentido || "MAYOR_ES_MEJOR") === "MENOR_ES_MEJOR";
  const diff = redondear(Math.abs(resultado - meta));
  if ((menorMejor && resultado <= meta) || (!menorMejor && resultado >= meta)) {
    return `Cumple la meta. Margen favorable: ${diff} ${unidad}.`;
  }
  return `Brecha frente a la meta: ${diff} ${unidad}.`;
}

/** Porcentaje de avance contra la meta (0-100) y etiqueta. */
export function avanceContraMeta(
  ind: Indicador,
  med: Medicion | undefined,
): { ancho: number; etiqueta: string } {
  const resultado = med ? Number(med.resultado) : NaN;
  const meta = Number(med?.meta ?? ind.meta ?? 0);
  const tiene = med?.resultado !== undefined && med?.resultado !== null && !Number.isNaN(resultado);
  if (!tiene || meta <= 0) return { ancho: 0, etiqueta: "Pendiente" };
  const menorMejor = norm(ind.sentido || "MAYOR_ES_MEJOR") === "MENOR_ES_MEJOR";
  const bruto = menorMejor ? (meta / Math.max(resultado, 0.0001)) * 100 : (resultado / meta) * 100;
  return { ancho: Math.max(0, Math.min(100, bruto)), etiqueta: `${Math.round(bruto)}%` };
}

/** Formatea un periodo "2026-06" como "junio de 2026". */
export function formatearPeriodo(periodo: string | null): string {
  if (!periodo) return "Sin periodo";
  const m = periodo.match(/^(\d{4})-(\d{2})/);
  if (!m) return periodo;
  const fecha = new Date(Number(m[1]), Number(m[2]) - 1, 1);
  if (Number.isNaN(fecha.getTime())) return periodo;
  return fecha.toLocaleDateString("es-CO", { month: "long", year: "numeric" });
}

export const SEMAFORO_LABEL: Record<Semaforo, string> = {
  VERDE: "EN META",
  AMARILLO: "ALERTA",
  ROJO: "CRÍTICO",
  GRIS: "SIN DATO",
};
