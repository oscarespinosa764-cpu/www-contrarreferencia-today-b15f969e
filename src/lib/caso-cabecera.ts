// ============================================================================
// FASE 5G · A.2 — Helpers compartidos de CABECERA VISUAL de tarjetas de casos.
//
// Alcance: presentación únicamente. No autorizan, no calculan estados y no
// crean fuentes de datos nuevas: reciben los valores canónicos del caso.
// ============================================================================
import { sanitizeOptionalLabel } from "./seguimiento-orden";
import { fmtEdad } from "./remisiones-utils";

/**
 * Primera línea global:
 *   NOMBRE // TIPO_DOCUMENTO: NÚMERO_DOCUMENTO · EDAD AÑOS
 * Los separadores solo aparecen entre segmentos válidos.
 */
export function buildPacienteIdentityLine(input: {
  nombre: unknown;
  tipoDocumento?: unknown;
  documento?: unknown;
  edad?: unknown;
}): string {
  const nombre = sanitizeOptionalLabel(input.nombre);
  const tipoDoc = sanitizeOptionalLabel(input.tipoDocumento);
  const doc = sanitizeOptionalLabel(input.documento);
  const edadRaw = sanitizeOptionalLabel(input.edad);
  const edad = edadRaw ? sanitizeOptionalLabel(fmtEdad(edadRaw)) : "";

  const docSeg = doc ? (tipoDoc ? `${tipoDoc}: ${doc}` : doc) : "";
  const derecha = [docSeg, edad].filter(Boolean).join(" · ");

  if (!nombre) return derecha;
  return derecha ? `${nombre} // ${derecha}` : nombre;
}

/**
 * Segunda línea por módulo: grupos separados por "|", elementos internos por "·".
 * Los grupos y elementos vacíos se descartan (sin separadores sobrantes).
 */
export function buildModuleSummaryLine(groups: unknown[][]): string {
  return groups
    .map((g) => g.map(sanitizeOptionalLabel).filter(Boolean).join(" · "))
    .filter(Boolean)
    .join(" | ");
}
