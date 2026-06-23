// Utilidades para la bitácora de remisiones salientes.

// --- Máscaras de entrada para fecha y hora (digitación rápida) ---

/** Convierte "22062026" -> "22/06/2026" progresivamente (DD/MM/YYYY). */
export function maskFechaInput(v: string): string {
  const d = v.replace(/\D/g, "").slice(0, 8);
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`;
  return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
}

/** Convierte "1315" / "13.15" / "13:15" -> "13:15" (HH:mm). */
export function maskHoraInput(v: string): string {
  const d = v.replace(/\D/g, "").slice(0, 4);
  if (d.length <= 2) return d;
  return `${d.slice(0, 2)}:${d.slice(2)}`;
}

/** Valida una fecha real en formato DD/MM/YYYY. */
export function isFechaValida(v: string): boolean {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(v.trim());
  if (!m) return false;
  const dd = +m[1];
  const mm = +m[2];
  const yyyy = +m[3];
  if (mm < 1 || mm > 12 || dd < 1 || yyyy < 1900) return false;
  const dim = new Date(yyyy, mm, 0).getDate();
  return dd <= dim;
}

/** Valida una hora real en formato HH:mm. */
export function isHoraValida(v: string): boolean {
  const m = /^(\d{2}):(\d{2})$/.exec(v.trim());
  if (!m) return false;
  const hh = +m[1];
  const mi = +m[2];
  return hh >= 0 && hh <= 23 && mi >= 0 && mi <= 59;
}


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

/** Edad sin duplicar la unidad: "27" -> "27 años"; "27 años" -> "27 años". */
export function fmtEdad(edad: string | null | undefined): string {
  const v = (edad || "").trim();
  if (!v) return "—";
  return /[a-zA-Záéíóú]/.test(v) ? v : `${v} años`;
}

/** Texto del radicado según la lógica de la EAPB (NO APLICA / PENDIENTE / uno o varios). */
export function fmtRadicado(
  codigo: string | null | undefined,
  generaCodigo: boolean | null | undefined,
): string {
  const v = (codigo || "").trim();
  if (generaCodigo === false) return "NO APLICA";
  if (/NO APLICA/i.test(v)) return "NO APLICA";
  if (!v || /PENDIENTE/i.test(v)) return "PENDIENTE DE RADICACIÓN";
  return v
    .split(/\s*·\s*/)
    .map((s) => s.trim())
    .filter(Boolean)
    .join(" · ");
}

// --- Evolución detallada por especialidad ---
// Por cada especialidad receptora se registran tres casillas:
//   indigo         = evolucionada en el sistema Índigo
//   eapb_correo    = enviada a la EAPB por correo
//   eapb_plataforma= cargada en la plataforma de la EAPB

export type EvoEspecialidad = {
  indigo: boolean;
  eapb_correo: boolean;
  eapb_plataforma: boolean;
};

export const EVO_CANALES = [
  { key: "indigo", label: "Índigo" },
  { key: "eapb_correo", label: "EAPB Correo" },
  { key: "eapb_plataforma", label: "EAPB Plataforma" },
] as const satisfies ReadonlyArray<{ key: keyof EvoEspecialidad; label: string }>;

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
  let base: Record<string, Partial<EvoEspecialidad> & { eapb?: boolean }> = {};
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
    const b = base[e] ?? {};
    out[e] = {
      indigo: !!b.indigo,
      // Compatibilidad con el esquema anterior de 2 casillas (eapb único).
      eapb_correo: !!(b.eapb_correo ?? b.eapb),
      eapb_plataforma: !!b.eapb_plataforma,
    };
  }
  return out;
}

/** Una especialidad está completa cuando los 3 canales están marcados. */
export function espCompleta(d: EvoEspecialidad | undefined): boolean {
  return !!d && d.indigo && d.eapb_correo && d.eapb_plataforma;
}

export function evolucionFromDetalle(
  detalle: Record<string, EvoEspecialidad>,
): EvolucionEstado {
  const items = Object.values(detalle);
  if (items.length === 0) return "sin";
  const completas = items.filter(espCompleta).length;
  const algunaMarca = items.some(
    (d) => d.indigo || d.eapb_correo || d.eapb_plataforma,
  );
  if (!algunaMarca) return "sin";
  if (completas === items.length) return "completo";
  return "parcial";
}

/** Canales que faltan por completar (al menos en una especialidad). */
export function canalesFaltantes(
  detalle: Record<string, EvoEspecialidad>,
): string[] {
  const faltan: string[] = [];
  for (const { key, label } of EVO_CANALES) {
    const incompleto = Object.values(detalle).some((d) => !d[key]);
    if (incompleto) faltan.push(label);
  }
  return faltan;
}

/** Resumen del estado de evolución a partir del JSON guardado, para tarjetas. */
export function resumenEvolucion(
  json: string | null | undefined,
  especialidades: string[],
): { estado: EvolucionEstado; label: string; faltan: string[] } {
  const detalle = parseEvolucionDetalle(json, especialidades);
  const estado = especialidades.length === 0 ? "sin" : evolucionFromDetalle(detalle);
  const faltan = estado === "parcial" ? canalesFaltantes(detalle) : [];
  const label =
    estado === "completo"
      ? "Evolucionado"
      : estado === "parcial"
        ? `Evolución parcial${faltan.length ? ` · falta ${faltan.join(", ")}` : ""}`
        : "Sin evolucionar";
  return { estado, label, faltan };
}
