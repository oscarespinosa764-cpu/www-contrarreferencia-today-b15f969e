// Sistema central de plantillas reutilizables.
// - Define los "pasos" del sistema donde una plantilla puede aparecer.
// - Define las variables disponibles para reemplazar dentro del texto.
// - Reemplaza {{VARIABLE}} por los datos reales del caso/alerta.
//
// La creación y edición de plantillas vive SOLO en "Plantillas Generales".
// Cada paso del sistema únicamente CONSUME las plantillas ancladas a él.

/** Identificadores de los puntos del sistema donde puede usarse una plantilla. */
export type PasoId =
  | "salientes_inicio"
  | "salientes_seguimiento"
  | "entrantes_respuesta"
  | "alertas_gestion";

export type PasoDef = {
  id: PasoId;
  /** Nombre legible para coordinación (sin tecnicismos). */
  label: string;
  /** Proceso al que pertenece, para agrupar en el editor. */
  grupo: string;
  /** Descripción corta de cuándo aplica. */
  ayuda: string;
};

/** Catálogo de pasos. Para sumar un nuevo punto del sistema, agrégalo aquí. */
export const PASOS: PasoDef[] = [
  {
    id: "salientes_inicio",
    label: "Bitácora Salientes · Inicio de trámite",
    grupo: "Remisiones salientes",
    ayuda: "Al crear o iniciar el trámite de una remisión saliente.",
  },
  {
    id: "salientes_seguimiento",
    label: "Bitácora Salientes · Seguimiento",
    grupo: "Remisiones salientes",
    ayuda: "Al registrar un seguimiento de una remisión saliente.",
  },
  {
    id: "entrantes_respuesta",
    label: "Casos Entrantes · Respuesta",
    grupo: "Casos entrantes",
    ayuda: "Al responder o gestionar un caso entrante.",
  },
  {
    id: "alertas_gestion",
    label: "Alertas de Coordinación · Gestión",
    grupo: "Coordinación",
    ayuda: "Al gestionar una alerta de coordinación.",
  },
];

export const PASO_LABEL: Record<string, string> = Object.fromEntries(
  PASOS.map((p) => [p.id, p.label]),
);

export function pasosLabels(ids: string[] | null | undefined): string[] {
  return (ids ?? []).map((id) => PASO_LABEL[id] ?? id);
}

export type VariableDef = {
  /** Token sin llaves, en MAYÚSCULAS. Ej: PACIENTE → {{PACIENTE}} */
  token: string;
  label: string;
};

/** Variables disponibles para insertar en el texto de una plantilla. */
export const VARIABLES: VariableDef[] = [
  { token: "PACIENTE", label: "Nombre del paciente" },
  { token: "DOCUMENTO", label: "Documento de identidad" },
  { token: "EDAD", label: "Edad" },
  { token: "RADICADO", label: "Número de radicado" },
  { token: "IPS", label: "IPS / EAPB" },
  { token: "ESPECIALIDAD", label: "Especialidad" },
  { token: "DIAGNOSTICO", label: "Diagnóstico / CIE10" },
  { token: "SERVICIO", label: "Servicio" },
  { token: "PRIORIDAD", label: "Prioridad" },
  { token: "CONTACTO", label: "Nombre de contacto" },
  { token: "TELEFONO", label: "Teléfono" },
  { token: "FECHA", label: "Fecha de hoy" },
  { token: "ESTADO", label: "Estado del caso" },
];

/** Datos reales que llegan desde un caso/alerta para rellenar la plantilla. */
export type DatosPlantilla = Record<string, string | number | null | undefined>;

function fechaHoy(): string {
  return new Date().toLocaleDateString("es-CO", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

/**
 * Reemplaza {{VARIABLE}} por los datos reales.
 * El texto fijo de la plantilla se conserva intacto; solo cambian las llaves.
 * Las variables sin dato se dejan visibles como [VARIABLE] para que el usuario las complete.
 */
export function aplicarVariables(mensaje: string | null | undefined, datos: DatosPlantilla): string {
  if (!mensaje) return "";
  const base: DatosPlantilla = { FECHA: fechaHoy(), ...datos };
  return mensaje.replace(/\{\{\s*([A-Z0-9_]+)\s*\}\}/g, (_m, token: string) => {
    const v = base[token];
    if (v === null || v === undefined || String(v).trim() === "") {
      return `[${token}]`;
    }
    return String(v);
  });
}

/** Extrae los tokens {{X}} usados en un texto. */
export function variablesUsadas(mensaje: string | null | undefined): string[] {
  if (!mensaje) return [];
  const set = new Set<string>();
  for (const m of mensaje.matchAll(/\{\{\s*([A-Z0-9_]+)\s*\}\}/g)) set.add(m[1]);
  return Array.from(set);
}
