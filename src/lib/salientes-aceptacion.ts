// Contratos compartidos (puros) para la fuente canónica de aceptación vigente
// de una REMISIÓN SALIENTE. La consulta canónica vive server-side en
// `salientes-aceptacion.functions.ts`. Este archivo NO accede a Supabase.
//
// Fase 5B — Bloque 2A.

/** Códigos exactos usados por el resolver (allowlist estricta, sin `includes`). */
export const ACEPTACION_TIPO = "ACEPTACIÓN DE IPS RECEPTORA" as const;
export const NOVEDADES_TIPO = "NOVEDADES" as const;

/** Códigos de novedad de IPS que INVALIDAN la aceptación activa. */
export const NOVEDADES_IPS_CANCELA_ACEPTACION = new Set<string>([
  "CANCELA",
  "DESIST_IPS",
]);

/** Longitudes máximas persistidas para nombre/cargo del aceptante. */
export const NOMBRE_ACEPTA_MAX = 120;
export const CARGO_ACEPTA_MAX = 80;

/** Resultado del resolver. Diseñado para consumo directo por la precarga. */
export type AceptacionVigente = {
  aceptacion_id: string;
  ips_receptora: string | null;
  ips_receptora_sede: string | null;
  nombre_acepta: string | null;
  cargo_acepta: string | null;
  fecha: string; // ISO
  usuario_creador: string | null;
  nombre_usuario_creador: string | null;
};

export type ResolverAceptacionResultado =
  | { estado: "vigente"; aceptacion: AceptacionVigente }
  | { estado: "sin_aceptacion" }
  | { estado: "ambiguo"; motivo: string };

/** Trim + límite estricto. Devuelve `null` cuando queda vacío. */
export function limpiarNombreAcepta(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (!t) return null;
  return t.slice(0, NOMBRE_ACEPTA_MAX);
}

export function limpiarCargoAcepta(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (!t) return null;
  return t.slice(0, CARGO_ACEPTA_MAX);
}
