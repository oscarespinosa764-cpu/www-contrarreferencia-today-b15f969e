// Historial · vista maestro-detalle (pura, client-safe).
// EPISODIO → FASE (estado del CASO) → ACTUACIONES.
// Una fase sólo cambia con evidencia determinística de transición del ciclo
// del caso. El resultado de una actuación (NO ACEPTA, PENDIENTE…) y los hitos
// (solicitud, registro, radicado, seguimientos) NUNCA abren fase.

export interface ActuacionFase {
  accion?: string;
  estado: string;
  _orden?: number;
  /** Estado del caso que produce esta actuación (registro de cambio de estado). */
  _destino?: string;
}

export interface Fase<T extends ActuacionFase> {
  estado: string;
  inicio: number | null;
  fin: number | null;
  actuaciones: T[];
}

export const SIN_ESTADO = "SIN ESTADO REGISTRADO";

/**
 * Transiciones del ciclo por módulo (título de actuación → estado del caso).
 * Atención Domiciliaria: hitos con fecha real. Entrantes: eventos operativos
 * (ingreso, ampliación, cancelación); la clasificación ACEPTADO/NEGADO/CRUE
 * no es estado operativo y NO abre fase. Salientes y RI usan los registros
 * de `caso_cambios_estado` (campo `_destino`).
 */
export const TRANSICIONES: Record<string, Record<string, string>> = {
  phd: {
    "ACEPTACIÓN": "ACEPTADA",
    "COORDINACIÓN DE AMBULANCIA": "AMBULANCIA COORDINADA",
    EGRESO: "EGRESO",
    CIERRE: "CERRADO",
  },
  entrantes: {
    "INGRESO CONFIRMADO": "INGRESO CONFIRMADO",
    "AMPLIACIÓN": "RESERVA AMPLIADA",
    "CANCELACIÓN": "RESERVA CANCELADA",
  },
};

/** Registro de cambio de estado persistido (tabla caso_cambios_estado). */
export interface CambioEstado {
  caso_id: string;
  estado_anterior: string | null;
  estado_nuevo: string | null;
  actor_nombre: string;
  created_at: string;
}

/** Convierte un cambio de estado en la actuación que abre su fase. */
export function actuacionCambioEstado(c: CambioEstado) {
  const ant = (c.estado_anterior ?? "").trim() || SIN_ESTADO;
  const nue = (c.estado_nuevo ?? "").trim() || SIN_ESTADO;
  return {
    accion: "CAMBIO DE ESTADO",
    estado: nue,
    observaciones: `Cambio de estado: ${ant} → ${nue} · Responsable: ${c.actor_nombre || "SISTEMA"}`,
    funcionario: c.actor_nombre || "SISTEMA",
    entidad: "—",
    _orden: new Date(c.created_at).getTime(),
    _destino: nue,
    _anterior: ant,
  };
}


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
  const destinoDe = (a: T) => (a._destino ? norm(a._destino) : tr[norm(a.accion)]);
  const hayTransicion = acts.some((a) => destinoDe(a));

  // Regla 3.7: sin evidencia de transición → una sola fase con el estado actual.
  if (!hayTransicion) {
    const ultimo = acts.length ? tiempo(acts[acts.length - 1]) : null;
    return [{ estado: actual, inicio: o.inicio, fin: ultimo, actuaciones: [...acts] }];
  }

  const primerCambio = acts.find((a) => a._destino) as (T & { _anterior?: string }) | undefined;
  const fases: Fase<T>[] = [
    {
      estado: norm(primerCambio?._anterior) || norm(o.estadoInicial) || SIN_ESTADO,
      inicio: o.inicio,
      fin: o.inicio,
      actuaciones: [],
    },
  ];
  for (const a of acts) {
    const t = tiempo(a);
    const destino = destinoDe(a);

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
