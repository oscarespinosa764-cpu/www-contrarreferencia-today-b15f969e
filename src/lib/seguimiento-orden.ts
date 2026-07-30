// ============================================================================
// FASE 5G · A.1 — Utilidades compartidas de presentación:
//  1) Saneamiento de labels/chips opcionales (nunca "null"/"undefined"/etc.).
//  2) Orden canónico del selector TIPO DE SEGUIMIENTO.
//
// IMPORTANTE: este módulo NO autoriza, NO habilita y NO deshabilita opciones.
// Recibe una allowlist ya calculada (dinámica, por estado/ciclo/permisos) y
// solo la reordena. El servidor sigue siendo la única fuente de autorización.
// ============================================================================

/** ¿El valor puede renderizarse como texto visible? */
export function isRenderableLabel(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "number" && Number.isNaN(value)) return false;
  const s = String(value).trim();
  if (s === "") return false;
  const low = s.toLowerCase();
  return low !== "null" && low !== "undefined" && low !== "nan" && s !== "[object Object]";
}

/** Devuelve el texto saneado, o "" cuando no debe renderizarse chip alguno. */
export function sanitizeOptionalLabel(value: unknown): string {
  return isRenderableLabel(value) ? String(value).trim() : "";
}

// --- Orden del selector TIPO DE SEGUIMIENTO ---------------------------------

function norm(v: string): string {
  return v
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[_\s]+/g, " ")
    .trim();
}

const TRANSVERSAL_INFO = 900;
const TRANSVERSAL_NOVEDADES = 910;
const TRANSVERSAL_CANCELACION = 920;
const TRANSVERSAL_OTRO = 999;
/** Acción propia no clasificada: queda al final de las propias, antes de las transversales. */
const PROPIA_DESCONOCIDA = 199;

/** Prioridades de acciones propias (100–199). No se exponen al usuario. */
function prioridadPropia(n: string): number | null {
  if (n.startsWith("RADICAD") || n.startsWith("RADICACION")) return 110;
  if (n.includes("ACEPTACION")) return 120;
  if (n.includes("ENTREGA DE OXIGENO") || n.includes("ENTREGA OXIGENO")) return 130;
  if (n.includes("EVOLUCION")) return 140;
  if (n.includes("NEGACION")) return 150;
  if (n.includes("REVISION AUTORIZACION ESTANCIA")) return 160;
  if (n.startsWith("CAMBIO")) return 170;
  if (n.includes("COORDINAD") || n.includes("COORDINACION")) return 180;
  if (n.includes("ACTIVACION DE PROVEEDOR")) return 181;
  if (n.includes("CONFIRMACION DE PROGRAMACION")) return 182;
  if (n.includes("ENTREGA DE DOCUMENTACION")) return 184;
  if (n.includes("LLEGADA")) return 186;
  if (n.startsWith("CIERRE") || n.includes("EGRESO") || n.includes("CULMINACION")) return 190;
  if (
    n.includes("CORREO") ||
    n.includes("PLATAFORMA") ||
    n.includes("FISICO") ||
    n.includes("PRESENCIAL") ||
    n.includes("TELEFONIC")
  ) {
    // Gestiones documentadas por medio: conservan formulario, asunto y
    // plantilla propios (no son un duplicado del selector Canal de Gestión).
    return 175;
  }
  return null;
}

function prioridad(codigo: string, principal?: string | null): number {
  if (principal && codigo === principal) return 100;
  const n = norm(codigo);
  if (n.includes("INFORMACION DEL TRAMITE")) return TRANSVERSAL_INFO;
  if (n === "NOVEDADES" || n.startsWith("NOVEDADES")) return TRANSVERSAL_NOVEDADES;
  if (n === "OTRO" || n.startsWith("OTRO ")) return TRANSVERSAL_OTRO;
  // La cancelación TERMINAL es transversal; "REVISIÓN AUTORIZACIÓN ESTANCIA
  // (CANCELACIÓN)" es una acción propia de Remisiones y no debe confundirse.
  if (n.includes("CANCELACION") && !n.includes("REVISION AUTORIZACION")) {
    return TRANSVERSAL_CANCELACION;
  }
  return prioridadPropia(n) ?? PROPIA_DESCONOCIDA;
}

/**
 * Reordena una allowlist ya autorizada:
 * acciones propias → INFORMACIÓN DEL TRÁMITE → NOVEDADES → CANCELACIÓN → OTRO.
 * Estable: conserva el orden original ante empates. No agrega ni quita códigos.
 */
export function ordenarTiposSeguimiento(
  opciones: readonly string[],
  opts: { principal?: string | null } = {},
): string[] {
  return opciones
    .map((codigo, i) => ({ codigo, i, p: prioridad(codigo, opts.principal) }))
    .sort((a, b) => a.p - b.p || a.i - b.i)
    .map((x) => x.codigo);
}
