// Listas de control (allowlists) para los campos de auditoría.
//
// Módulo PURO (sin secretos ni imports de servidor): es seguro importarlo tanto
// desde la función de servidor expuesta al cliente como desde el escritor
// server-only. Su objetivo es impedir que un miembro activo forje entradas de
// auditoría engañosas con texto/markdown arbitrario en `accion`, `modulo`,
// `tabla`, `resultado` o `detalles`.
//
// Política de saneamiento (NO se lanzan errores para no interrumpir la
// operación que se está auditando): los valores fuera de la lista se
// normalizan a un valor seguro en lugar de almacenarse tal cual.

/** Resultados válidos de una operación auditada. */
export const AUDIT_RESULTADOS = new Set<string>([
  "exito",
  "fallido",
  "rechazado",
  "error",
  "denegado",
  "pendiente",
  "advertencia",
]);

/** Módulos del sistema que pueden originar una acción auditada. */
export const AUDIT_MODULOS = new Set<string>([
  "remisiones",
  "remisiones salientes",
  "entrantes",
  "salientes",
  "domiciliarios",
  "especiales",
  "referencia_interna",
  "pendientes",
  "historial",
  "red-ips",
  "red",
  "reglas",
  "alertas",
  "usuarios",
  "control_mando",
  "control-mando",
  "importacion",
  "exportacion",
  "ia",
  "borrado",
  "auth",
  "catalogos",
  "indicadores",
  "dictado",
  "coordinacion",
  "ambulancias",
  "motivos",
  "cuadro_turno",
  "ausentismo",
  "firmas",
  "otros",
]);

/** Tablas que pueden verse afectadas por una acción auditada. */
export const AUDIT_TABLAS = new Set<string>([
  "remisiones",
  "casos_entrantes",
  "domiciliarios",
  "referencia_interna",
  "pendientes",
  "seguimientos",
  "historicos_casos",
  "red_operativa",
  "reglas_operativas",
  "avisos",
  "user_roles",
  "profiles",
  "catalogos",
  "plantillas",
  "mediciones_indicadores",
  "turnos",
  "entregas_turno",
  "historial_turnos",
  "coordinacion",
  "control_mando",
  "voice_dictation_config",
  "audit_logs",
  "shift_schedules",
  "shift_schedule_days",
  "shift_requests",
  "shift_absenteeism_records",
  "user_signatures",
  "shift_types",
  "auth",
  "varios",
]);

// Una acción legítima siempre es un identificador tipo slug (snake_case o
// código en mayúsculas como INICIO_SESION). Esto bloquea espacios, signos de
// puntuación, saltos de línea y markdown.
const ACCION_RE = /^[A-Za-z][A-Za-z0-9_]{1,79}$/;
const MAX_DETALLES_CHARS = 4000;

/** Normaliza la acción a un slug seguro; nunca lanza. */
export function sanitizeAccion(raw: unknown): string {
  if (typeof raw !== "string") return "accion_no_valida";
  const s = raw.trim();
  if (ACCION_RE.test(s)) return s;
  const slug = s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
  return slug && /^[a-z]/.test(slug) ? slug : "accion_no_valida";
}

/** Devuelve el resultado si está en la lista; en caso contrario, un valor seguro. */
export function sanitizeResultado(raw: unknown): string {
  if (raw == null) return "exito";
  return typeof raw === "string" && AUDIT_RESULTADOS.has(raw) ? raw : "desconocido";
}

/** Devuelve el módulo si está permitido; en caso contrario, "otros". */
export function sanitizeModulo(raw: unknown): string | null {
  if (raw == null) return null;
  return typeof raw === "string" && AUDIT_MODULOS.has(raw) ? raw : "otros";
}

/** Devuelve la tabla si está permitida; en caso contrario, null. */
export function sanitizeTabla(raw: unknown): string | null {
  if (raw == null) return null;
  return typeof raw === "string" && AUDIT_TABLAS.has(raw) ? raw : null;
}

/** Acepta solo objetos planos serializables y limita su tamaño. */
export function sanitizeDetalles(raw: unknown): Record<string, unknown> | null {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return null;
  try {
    const json = JSON.stringify(raw);
    if (json.length > MAX_DETALLES_CHARS) {
      return { truncado: true, bytes: json.length };
    }
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Saneamiento completo de un payload de auditoría. */
export function sanitizeAuditoria(input: {
  accion: unknown;
  modulo?: unknown;
  tabla?: unknown;
  registroId?: unknown;
  resultado?: unknown;
  detalles?: unknown;
}): {
  accion: string;
  modulo: string | null;
  tabla: string | null;
  registroId: string | null;
  resultado: string;
  detalles: Record<string, unknown> | null;
} {
  const registroId =
    typeof input.registroId === "string" ? input.registroId.slice(0, 200) : null;
  return {
    accion: sanitizeAccion(input.accion),
    modulo: sanitizeModulo(input.modulo),
    tabla: sanitizeTabla(input.tabla),
    registroId,
    resultado: sanitizeResultado(input.resultado),
    detalles: sanitizeDetalles(input.detalles),
  };
}
