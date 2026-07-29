// ============================================================================
// FASE 5C · B1.2 — Referencias Internas: fuente canónica de estado automático.
// Los códigos son los valores persistidos en `public.referencia_interna.estado`.
// La UI usa `label` para presentar; nunca calcula el estado, solo lo consume.
// ============================================================================

export type RiEstadoCodigo =
  | "PENDIENTE COORDINACION"
  | "TRAMITE COORDINADO SIN CONFIRMACION AMBULANCIA"
  | "AMBULANCIA PROGRAMADA"
  | "AMBULANCIA EN SITIO PTE CONFIRMACION REINGRESO"
  | "CERRADO POR CULMINACION DE SOLICITUD"
  | "CANCELADO";

export interface RiEstadoMeta {
  codigo: RiEstadoCodigo;
  label: string;
  descripcion: string;
  /** Etiqueta del siguiente paso principal (null si es terminal). */
  siguientePasoLabel: string | null;
  color: string;
  bar: string;
  /** Solo estados activos aparecen en el listado de casos activos. */
  activo: boolean;
}

export const RI_ESTADOS: readonly RiEstadoMeta[] = [
  {
    codigo: "PENDIENTE COORDINACION",
    label: "PENDIENTE COORDINACIÓN",
    descripcion: "Pendiente coordinar fecha y hora del trámite",
    siguientePasoLabel: "TRÁMITE COORDINADO",
    color: "bg-status-amber/15 text-status-amber",
    bar: "border-l-status-amber",
    activo: true,
  },
  {
    codigo: "TRAMITE COORDINADO SIN CONFIRMACION AMBULANCIA",
    label: "TRÁMITE COORDINADO SIN CONFIRMACIÓN AMBULANCIA",
    descripcion: "Trámite coordinado, pendiente programar la ambulancia",
    siguientePasoLabel: "CONFIRMACIÓN PROGRAMACIÓN DE AMBULANCIA",
    color: "bg-sky-100 text-sky-700",
    bar: "border-l-sky-400",
    activo: true,
  },
  {
    codigo: "AMBULANCIA PROGRAMADA",
    label: "AMBULANCIA PROGRAMADA",
    descripcion: "Traslado programado, pendiente llegada de la ambulancia",
    siguientePasoLabel: "CONFIRMACIÓN LLEGADA DE AMBULANCIA",
    color: "bg-indigo-100 text-indigo-700",
    bar: "border-l-indigo-400",
    activo: true,
  },
  {
    codigo: "AMBULANCIA EN SITIO PTE CONFIRMACION REINGRESO",
    label: "AMBULANCIA EN SITIO // PTE CONFIRMACIÓN REINGRESO",
    descripcion: "Ambulancia en sitio, pendiente confirmar reingreso y cierre",
    siguientePasoLabel: "CIERRE POR CULMINACIÓN DE SOLICITUD",
    color: "bg-status-green/15 text-status-green",
    bar: "border-l-status-green",
    activo: true,
  },
  {
    codigo: "CERRADO POR CULMINACION DE SOLICITUD",
    label: "CERRADO POR CULMINACIÓN DE SOLICITUD",
    descripcion: "Caso finalizado por culminación exitosa del trámite",
    siguientePasoLabel: null,
    color: "bg-emerald-100 text-emerald-700",
    bar: "border-l-emerald-500",
    activo: false,
  },
  {
    codigo: "CANCELADO",
    label: "CANCELADO",
    descripcion: "Caso cancelado — trasladado al historial",
    siguientePasoLabel: null,
    color: "bg-rose-100 text-rose-700",
    bar: "border-l-rose-400",
    activo: false,
  },
] as const;

const CODIGO_INDEX = new Map<string, RiEstadoMeta>(
  RI_ESTADOS.map((e) => [e.codigo, e]),
);

/** Fallback tolerante para estados históricos (ACTIVO, EXAMEN COORDINADO, etc.). */
export function resolverEstadoRI(estado: string | null | undefined): RiEstadoMeta {
  if (!estado) return CODIGO_INDEX.get("PENDIENTE COORDINACION")!;
  const norm = estado.trim().toUpperCase();
  const hit = CODIGO_INDEX.get(norm as RiEstadoCodigo);
  if (hit) return hit;
  // Equivalencias históricas (solo visualización — el backfill ya normalizó activos).
  if (norm === "ACTIVO") return CODIGO_INDEX.get("PENDIENTE COORDINACION")!;
  if (norm === "EXAMEN COORDINADO" || norm === "TRAMITE COORDINADO" || norm === "TRÁMITE COORDINADO")
    return CODIGO_INDEX.get("TRAMITE COORDINADO SIN CONFIRMACION AMBULANCIA")!;
  if (norm === "AMBULANCIA COORDINADA" || norm === "TEP ACTIVADO")
    return CODIGO_INDEX.get("AMBULANCIA PROGRAMADA")!;
  if (norm === "AMBULANCIA EN SITIO")
    return CODIGO_INDEX.get("AMBULANCIA EN SITIO PTE CONFIRMACION REINGRESO")!;
  if (norm === "CULMINADO")
    return CODIGO_INDEX.get("CERRADO POR CULMINACION DE SOLICITUD")!;
  // Desconocido → tratar como pendiente para no romper la vista.
  return CODIGO_INDEX.get("PENDIENTE COORDINACION")!;
}

export const RI_ESTADOS_ACTIVOS = RI_ESTADOS.filter((e) => e.activo);

/** Agrupa items por estado canónico RI, preservando el orden de las etapas. */
export function agruparInternasPorEstado<T extends { estado?: string | null }>(
  items: T[],
): Array<{ meta: RiEstadoMeta; items: T[] }> {
  const buckets = new Map<string, T[]>();
  for (const it of items) {
    const meta = resolverEstadoRI(it.estado);
    const arr = buckets.get(meta.codigo) ?? [];
    arr.push(it);
    buckets.set(meta.codigo, arr);
  }
  return RI_ESTADOS_ACTIVOS.filter((e) => buckets.has(e.codigo)).map((meta) => ({
    meta,
    items: buckets.get(meta.codigo)!,
  }));
}
