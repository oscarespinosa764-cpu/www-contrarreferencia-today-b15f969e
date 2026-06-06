// Utilidades para la bitácora de remisiones salientes.

export function fmtTranscurrido(fromISO: string | null | undefined): string {
  if (!fromISO) return "—";
  const start = new Date(fromISO).getTime();
  if (Number.isNaN(start)) return "—";
  const diff = Math.max(0, Date.now() - start);
  const totalSeg = Math.floor(diff / 1000);
  const dias = Math.floor(totalSeg / 86400);
  const horas = Math.floor((totalSeg % 86400) / 3600);
  const min = Math.floor((totalSeg % 3600) / 60);
  const pad = (n: number) => String(n).padStart(2, "0");
  const partes: string[] = [];
  if (dias > 0) partes.push(`${dias} día${dias === 1 ? "" : "s"}`);
  partes.push(`${pad(horas)} h`, `${pad(min)} min`);
  return partes.join(", ");
}

export type Tono = "verde" | "amarillo" | "rojo";

const tonoChip: Record<Tono, string> = {
  verde: "bg-status-green/15 text-status-green",
  amarillo: "bg-status-amber/15 text-status-amber",
  rojo: "bg-status-red/15 text-status-red",
};

/** Color del tiempo transcurrido: <12 h verde, 12–120 h amarillo, ≥120 h rojo. */
export function tiempoTono(fromISO: string | null | undefined): Tono {
  if (!fromISO) return "verde";
  const start = new Date(fromISO).getTime();
  if (Number.isNaN(start)) return "verde";
  const horas = Math.max(0, Date.now() - start) / 3_600_000;
  if (horas < 12) return "verde";
  if (horas < 120) return "amarillo";
  return "rojo";
}

export function tiempoChip(fromISO: string | null | undefined): string {
  return tonoChip[tiempoTono(fromISO)];
}

/** Mapea la prioridad (baja/media/alta) a clases de color para badge y borde. */
export function prioridadMeta(prioridad: string | null | undefined): {
  tono: Tono;
  badge: string;
  borderL: string;
} {
  const s = (prioridad || "").toLowerCase();
  let tono: Tono = "amarillo";
  if (/baj/.test(s)) tono = "verde";
  else if (/alt/.test(s)) tono = "rojo";
  else if (/medi/.test(s)) tono = "amarillo";
  const badge: Record<Tono, string> = {
    verde: "border-status-green/40 text-status-green",
    amarillo: "border-status-amber/40 text-status-amber",
    rojo: "border-status-red/40 text-status-red",
  };
  const borderL: Record<Tono, string> = {
    verde: "border-l-status-green",
    amarillo: "border-l-status-amber",
    rojo: "border-l-status-red",
  };
  return { tono, badge: badge[tono], borderL: borderL[tono] };
}

export type EvolucionEstado = "sin" | "parcial" | "completo";

export function normEvolucion(v: string | null | undefined): EvolucionEstado {
  const s = (v || "").toLowerCase();
  if (/parcial|alguna|amaril/.test(s)) return "parcial";
  if (/evolucion|complet|verde/.test(s)) return "completo";
  return "sin";
}

export const evolucionMeta: Record<
  EvolucionEstado,
  { label: string; dot: string; chip: string }
> = {
  sin: {
    label: "Sin evolucionar",
    dot: "bg-status-red",
    chip: "bg-status-red/15 text-status-red",
  },
  parcial: {
    label: "Evolución parcial",
    dot: "bg-status-amber",
    chip: "bg-status-amber/15 text-status-amber",
  },
  completo: {
    label: "Evolucionado",
    dot: "bg-status-green",
    chip: "bg-status-green/15 text-status-green",
  },
};

export function fmtFechaHora(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// --- Evolución detallada por especialidad ---
// Por cada especialidad receptora se registran dos casillas:
//   indigo = evolucionada en el sistema Índigo
//   eapb   = enviada a la EAPB por correo / plataformas

export type EvoEspecialidad = { indigo: boolean; eapb: boolean };

export function splitEspecialidades(v: string | null | undefined): string[] {
  return (v || "")
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function parseEvolucionDetalle(
  json: string | null | undefined,
  especialidades: string[],
): Record<string, EvoEspecialidad> {
  let base: Record<string, EvoEspecialidad> = {};
  if (json) {
    try {
      const parsed = JSON.parse(json);
      if (parsed && typeof parsed === "object") base = parsed;
    } catch {
      /* ignore */
    }
  }
  const out: Record<string, EvoEspecialidad> = {};
  for (const e of especialidades) {
    out[e] = { indigo: !!base[e]?.indigo, eapb: !!base[e]?.eapb };
  }
  return out;
}

export function evolucionFromDetalle(
  detalle: Record<string, EvoEspecialidad>,
): EvolucionEstado {
  const items = Object.values(detalle);
  if (items.length === 0) return "sin";
  const completas = items.filter((d) => d.indigo && d.eapb).length;
  if (completas === 0) return "sin";
  if (completas === items.length) return "completo";
  return "parcial";
}
