// ---------------------------------------------------------------------------
// Catálogo de ALERTAS DE COORDINACIÓN (registros persistentes de coordinación).
//
// IMPORTANTE — separación conceptual (no mezclar):
//   A. Notificaciones operativas del cupo  → useNotifVencimientos (60 min / vencido)
//   B. Avisos operativos                    → avisos + reglas_operativas (motor IA)
//   C. Alertas de coordinación              → ESTE catálogo (persistentes, gestionables)
//
// Fase 1: catálogo + helpers de estado/UI. Las alertas persistentes existentes
// viven hoy en la tabla `avisos` con un código "[ALT-...]" en el mensaje. El
// motor backend con tabla propia se conecta en la fase 2 (migración aparte).
// ---------------------------------------------------------------------------

export type SubVentana = "ENTRANTES" | "SALIENTES";

export type ReglaCoordinacion = {
  /** Código estable de la regla/alerta de coordinación. */
  codigo: string;
  nombre: string;
  descripcion: string;
  modulo: string;
  subventana: SubVentana;
  /** Evento del caso que dispara la evaluación. */
  evento: string;
  condicion: string;
  /** Umbral numérico (null = evento inmediato / sin umbral temporal). */
  umbral: number | null;
  unidad: "min" | "horas" | "turnos" | null;
  prioridad: "MEDIO" | "ALTO" | "CRITICO";
};

/**
 * Reglas de coordinación iniciales (sección 15 del requerimiento).
 * Ninguna se elimina físicamente: se archivan / desactivan.
 */
export const REGLAS_COORDINACION: ReglaCoordinacion[] = [
  {
    codigo: "ALT-ENT-CAN-ANTICIPADA",
    nombre: "Cancelación anticipada",
    descripcion:
      "Se cancela un cupo cuando todavía quedaba tiempo efectivo de vencimiento.",
    modulo: "REMISIONES",
    subventana: "ENTRANTES",
    evento: "Cancelación de cupo",
    condicion: "Cancelación con tiempo de cupo aún vigente",
    umbral: 0,
    unidad: "min",
    prioridad: "ALTO",
  },
  {
    codigo: "ALT-ENT-CAN-TARDIA",
    nombre: "Cancelación tardía posterior al vencimiento",
    descripcion:
      "La cancelación se registra más de 4 horas después del vencimiento efectivo del cupo.",
    modulo: "REMISIONES",
    subventana: "ENTRANTES",
    evento: "Cancelación de cupo",
    condicion: "Cancelación registrada tras el margen de 4 h del vencimiento",
    umbral: 4,
    unidad: "horas",
    prioridad: "ALTO",
  },
  {
    codigo: "ALT-ENT-INGRESO-TARDIO",
    nombre: "Ingreso tardío posterior a cancelación o vencimiento",
    descripcion:
      "El personal confirma el ingreso del paciente después de una cancelación o vencimiento (ventana de 24 h).",
    modulo: "REMISIONES",
    subventana: "ENTRANTES",
    evento: "Confirmación de ingreso",
    condicion: "Ingreso confirmado tras cancelación/vencimiento (≤ 24 h)",
    umbral: 24,
    unidad: "horas",
    prioridad: "ALTO",
  },
  {
    codigo: "ALT-ENT-INGRESO-SIN-REFERENCIA",
    nombre: "Ingreso sin proceso de referencia",
    descripcion:
      "Ingresa un paciente cuyo caso fue negado, no aceptado o cerrado sin referencia formal.",
    modulo: "REMISIONES",
    subventana: "ENTRANTES",
    evento: "Confirmación de ingreso",
    condicion: "Ingreso posterior a negación / no aceptación",
    umbral: 24,
    unidad: "horas",
    prioridad: "ALTO",
  },
  {
    codigo: "ALT-ENT-CIERRE-SIN-NOTIFICACION",
    nombre: "Cierre sin notificación",
    descripcion:
      "Una aceptación vencida se cierra administrativamente al crearse una nueva aceptación.",
    modulo: "REMISIONES",
    subventana: "ENTRANTES",
    evento: "Nueva aceptación sobre cupo vencido",
    condicion: "Aceptación anterior vencida no cerrada correctamente",
    umbral: null,
    unidad: null,
    prioridad: "MEDIO",
  },
  {
    codigo: "ALT-SAL-ALTA-SIN-ACEPTACION",
    nombre: "Prioridad alta sin aceptación",
    descripcion: "Caso de prioridad alta pendiente de aceptación durante más de 12 horas.",
    modulo: "REMISIONES",
    subventana: "SALIENTES",
    evento: "Caso pendiente de aceptación",
    condicion: "Prioridad alta pendiente de aceptación",
    umbral: 12,
    unidad: "horas",
    prioridad: "ALTO",
  },
  {
    codigo: "ALT-SAL-SIN-SEGUIMIENTO-TURNO",
    nombre: "Caso sin seguimiento durante más de un turno",
    descripcion:
      "Caso activo sin seguimiento válido durante más de un turno operativo (según Cuadro de Turno).",
    modulo: "REMISIONES",
    subventana: "SALIENTES",
    evento: "Caso activo sin seguimiento",
    condicion: "Sin seguimiento válido por más de un turno",
    umbral: 1,
    unidad: "turnos",
    prioridad: "MEDIO",
  },
  {
    codigo: "ALT-SAL-ACEPTADO-SIN-AMBULANCIA",
    nombre: "Aceptación sin ambulancia coordinada",
    descripcion: "Aceptación registrada sin ambulancia coordinada durante más de 12 horas.",
    modulo: "REMISIONES",
    subventana: "SALIENTES",
    evento: "Aceptación registrada",
    condicion: "Aceptado sin ambulancia coordinada",
    umbral: 12,
    unidad: "horas",
    prioridad: "MEDIO",
  },
  {
    codigo: "ALT-SAL-AMBULANCIA-SIN-ARRIBO",
    nombre: "Ambulancia coordinada sin arribo o entrega documental",
    descripcion:
      "Ambulancia coordinada sin registro de arribo o entrega documental durante más de 8 horas.",
    modulo: "REMISIONES",
    subventana: "SALIENTES",
    evento: "Ambulancia coordinada",
    condicion: "Sin arribo / entrega documental (incluye QR o firma pendiente)",
    umbral: 8,
    unidad: "horas",
    prioridad: "ALTO",
  },
];

export function umbralTexto(r: ReglaCoordinacion): string {
  if (r.umbral == null || r.unidad == null) return "Evento inmediato";
  const u =
    r.unidad === "min" ? "min" : r.unidad === "horas" ? "h" : r.unidad === "turnos" ? "turno(s)" : "";
  if (r.codigo === "ALT-ENT-CAN-ANTICIPADA") return "Tiempo de cupo restante";
  return `${r.umbral} ${u}`;
}

// ---- Estados del ciclo de vida (sección 30) ----

export const ESTADOS_ALERTA = [
  "ABIERTA",
  "EN REVISIÓN",
  "GESTIONADA",
  "CERRADA SIN IRREGULARIDAD",
  "CERRADA CON HALLAZGO",
  "DESCARTADA CON JUSTIFICACIÓN",
] as const;
export type EstadoAlerta = (typeof ESTADOS_ALERTA)[number];

export const ESTADO_BADGE: Record<string, string> = {
  ABIERTA: "bg-status-red/15 text-status-red",
  "EN REVISIÓN": "bg-status-amber/15 text-status-amber",
  GESTIONADA: "bg-status-sky/15 text-status-sky",
  "CERRADA SIN IRREGULARIDAD": "bg-status-green/15 text-status-green",
  "CERRADA CON HALLAZGO": "bg-vitalis-blue/15 text-vitalis-blue",
  "DESCARTADA CON JUSTIFICACIÓN": "bg-muted text-muted-foreground",
};

/** Extrae el código [ALT-...] del mensaje de un aviso, si lo tiene. */
export function extraerCodigoAlerta(mensaje: string | null | undefined): string | null {
  if (!mensaje) return null;
  const m = mensaje.match(/\[(ALT-[A-Z0-9-]+)\]/);
  return m ? m[1] : null;
}

export function reglaPorCodigo(codigo: string | null): ReglaCoordinacion | undefined {
  if (!codigo) return undefined;
  return REGLAS_COORDINACION.find((r) => r.codigo === codigo);
}
