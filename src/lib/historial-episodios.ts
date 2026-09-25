// Historial · vista maestro-detalle (pura, client-safe).
// Deriva ETIQUETA del episodio y FASES (estados) a partir de las actuaciones
// de la línea de tiempo canónica. No inventa estados ni fechas.

export interface ActuacionFase {
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

const limpio = (s: string | null | undefined) => {
  const t = (s ?? "").trim();
  return t === "—" || t === "-" ? "" : t;
};

/**
 * Agrupa actuaciones (ya ordenadas ascendentemente) en fases consecutivas por
 * estado. Devuelve `null` cuando ninguna actuación registra estado (el módulo
 * no permite derivar fases: se muestran directamente bajo el episodio).
 */
export function derivarFases<T extends ActuacionFase>(acts: T[]): Fase<T>[] | null {
  if (!acts.some((a) => limpio(a.estado))) return null;
  const fases: Fase<T>[] = [];
  for (const a of acts) {
    const est = limpio(a.estado).toUpperCase();
    const actual = fases[fases.length - 1];
    const t = typeof a._orden === "number" && Number.isFinite(a._orden) ? a._orden : null;
    if (!est) {
      if (actual) {
        actual.actuaciones.push(a);
        if (t != null) actual.fin = t;
      } else {
        fases.push({ estado: SIN_ESTADO, inicio: t, fin: t, actuaciones: [a] });
      }
      continue;
    }
    if (actual && actual.estado === est) {
      actual.actuaciones.push(a);
      if (t != null) actual.fin = t;
    } else {
      fases.push({ estado: est, inicio: t, fin: t, actuaciones: [a] });
    }
  }
  return fases;
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
