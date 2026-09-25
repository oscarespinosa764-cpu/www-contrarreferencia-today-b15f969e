// Historial · vista maestro-detalle (pura, client-safe).
// EPISODIO → FASE (estado del CASO) → ACTUACIONES.
// Una fase sólo cambia con evidencia determinística de transición del ciclo
// del caso. El resultado de una actuación (NO ACEPTA, PENDIENTE…) y los hitos
// (solicitud, registro, radicado, seguimientos) NUNCA abren fase.

export interface ActuacionFase {
  accion?: string;
  estado: string;
  _orden?: number;
}

export interface Fase<T extends ActuacionFase> {
  estado: string;
  inicio: number | null;
  fin: number | null;
  actuaciones: T[];
}

export const SIN_ESTADO = "SIN ESTADO REGISTRADO";

/**
 * Transiciones del ciclo por módulo, derivadas de los hitos canónicos de
 * `caso-timeline.ts` (título del evento → estado del caso que produce).
 * Sólo Atención Domiciliaria registra hitos de transición con fecha real
 * (fecha_aceptacion, fecha_coordinacion_ambulancia, fecha_egreso, fecha_cierre).
 */
export const TRANSICIONES: Record<string, Record<string, string>> = {
  phd: {
    "ACEPTACIÓN": "ACEPTADA",
    "COORDINACIÓN DE AMBULANCIA": "AMBULANCIA COORDINADA",
    EGRESO: "EGRESO",
    CIERRE: "CERRADO",
  },
};

export interface OpcionesFases {
  /** Estado actual del episodio (fila maestra). */
  estadoActual: string;
  /** Inicio del episodio (ms). */
  inicio: number | null;
  /** Estado inicial definido por el módulo, si existe. */
  estadoInicial?: string;
  /** Título de actuación (mayúsculas) → estado del caso que produce. */
  transiciones?: Record<string, string>;
}

const norm = (s: string | null | undefined) => (s ?? "").trim().toUpperCase();

export function derivarFases<T extends ActuacionFase>(acts: T[], o: OpcionesFases): Fase<T>[] {
  const actual = norm(o.estadoActual) || SIN_ESTADO;
  const tr = o.transiciones ?? {};
  const tiempo = (a: T) =>
    typeof a._orden === "number" && Number.isFinite(a._orden) ? a._orden : null;
  const hayTransicion = acts.some((a) => tr[norm(a.accion)]);

  // Regla 3.7: sin evidencia de transición → una sola fase con el estado actual.
  if (!hayTransicion) {
    const ultimo = acts.length ? tiempo(acts[acts.length - 1]) : null;
    return [{ estado: actual, inicio: o.inicio, fin: ultimo, actuaciones: [...acts] }];
  }

  const fases: Fase<T>[] = [
    {
      estado: norm(o.estadoInicial) || SIN_ESTADO,
      inicio: o.inicio,
      fin: o.inicio,
      actuaciones: [],
    },
  ];
  for (const a of acts) {
    const t = tiempo(a);
    const destino = tr[norm(a.accion)];
    if (destino) {
      // La transición siempre abre fase nueva (también un estado repetido).
      fases.push({ estado: destino, inicio: t, fin: t, actuaciones: [a] });
    } else {
      const f = fases[fases.length - 1];
      f.actuaciones.push(a);
      if (t != null) f.fin = t;
    }
  }
  const limpias = fases.filter((f, i) => i > 0 || f.actuaciones.length > 0);
  // Regla 3.8: la última fase corresponde al estado actual del episodio.
  limpias[limpias.length - 1].estado = actual;
  return limpias;
}

const pad = (n: number) => String(n).padStart(2, "0");

function fmt(iso: string, conHora: boolean): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  // America/Bogota (UTC-5, sin horario de verano).
  const b = new Date(d.getTime() - 5 * 3600_000);
  const f = `${pad(b.getUTCDate())}/${pad(b.getUTCMonth() + 1)}/${b.getUTCFullYear()}`;
  return conHora ? `${f} ${pad(b.getUTCHours())}:${pad(b.getUTCMinutes())}` : f;
}

/** Etiqueta del episodio según módulo. Nunca usa la palabra "trámite". */
export function etiquetaEpisodio(
  vista: "entrantes" | "salientes" | "phd" | "interna",
  fechaInicio: string,
  tipo?: string,
): string {
  if (vista === "entrantes" || vista === "salientes") {
    const f = fmt(fechaInicio, true);
    return f ? `REMISIÓN del ${f}` : "REMISIÓN";
  }
  const base =
    (tipo ?? "").trim().toUpperCase() ||
    (vista === "phd" ? "ATENCIÓN DOMICILIARIA" : "REFERENCIA INTERNA");
  const f = fmt(fechaInicio, false);
  return f ? `${base} del ${f}` : base;
}
