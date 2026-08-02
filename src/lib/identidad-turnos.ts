// ============================================================================
// FASE 9 · BLOQUE C.1 — Identidad canónica de miembros del Cuadro de Turno.
// Módulo PURO y compartido (cliente + servidor): normalización de nombres,
// estados del resolver y mensajes funcionales. No accede a la base de datos.
// ============================================================================

/** Orígenes de vínculo autorizados (allowlist estricta). */
export const LINK_SOURCES = [
  "MANUAL_ADMIN",
  "CONFIRMED_NAME_SUGGESTION",
  "IMPORT_TECHNICAL_ID",
] as const;
export type LinkSource = (typeof LINK_SOURCES)[number];

/**
 * Normalización compartida para comparar nombres:
 * Unicode NFKC · trim · colapso de espacios internos · comparación
 * case-insensitive. Conserva tildes y caracteres significativos.
 */
export function normalizarNombre(v: unknown): string {
  if (typeof v !== "string") return "";
  return v.normalize("NFKC").replace(/\s+/g, " ").trim().toLocaleUpperCase("es-CO");
}

/** Estados explícitos del resolver canónico (allowlist). */
export type ResolverEstado =
  | "TURNO_ENCONTRADO"
  | "SIN_TURNO"
  | "MIEMBRO_NO_VINCULADO"
  | "IDENTIDAD_AMBIGUA"
  | "SCHEDULE_NO_ENCONTRADO"
  | "SCHEDULE_AMBIGUO"
  | "CODIGO_DESCONOCIDO"
  | "PROGRAMACION_INCONSISTENTE"
  | "USUARIO_INACTIVO"
  | "SIN_PERMISO";

export type ResolutionMethod = "MEMBER_ID" | "USER_ID" | "UNIQUE_NORMALIZED_NAME";

export interface TurnoResuelto {
  estado: ResolverEstado;
  resolutionMethod: ResolutionMethod | null;
  matchCount: number;
  scheduleId: string | null;
  memberId: string | null;
  /** Usuario vinculado al miembro resuelto (null cuando no hay vínculo). */
  userId: string | null;
  /** Fila real de public.shift_schedule_days. */
  dayId: string | null;
  dayNumber: number | null;
  /** Datos de la asignación cuando existe. */
  shiftCode: string | null;
  hours: number;
  unidadFuncional: string | null;
  shiftDate: string | null;
  /** Valores literales de la fila del día (nunca provienen del cliente). */
  origin: string | null;
  notes: string | null;
  /** Catálogo (shift_types). */
  shiftName: string | null;
  startTime: string | null;
  endTime: string | null;
  crossesMidnight: boolean;
  /** ACTIVE | INACTIVE | UNKNOWN */
  catalogStatus: "ACTIVE" | "INACTIVE" | "UNKNOWN";
  /** Fecha efectiva de finalización (día siguiente en turnos nocturnos). */
  endDate: string | null;
}


/** Mensaje funcional único por estado. */
export function mensajeResolver(t: TurnoResuelto): string {
  switch (t.estado) {
    case "TURNO_ENCONTRADO":
      return `Turno programado: ${t.shiftCode ?? "—"} · ${t.shiftName ?? "—"} · ${
        t.startTime ?? "—"
      }–${t.endTime ?? "—"}.`;
    case "SIN_TURNO":
      return "Sin turno programado en esa fecha.";
    case "MIEMBRO_NO_VINCULADO":
      return "El colaborador aún no está vinculado correctamente al Cuadro de Turno.";
    case "IDENTIDAD_AMBIGUA":
      return "Existen varios miembros compatibles. Un administrador debe revisar la vinculación.";
    case "SCHEDULE_NO_ENCONTRADO":
      return "No existe un Cuadro de Turno configurado para este periodo.";
    case "SCHEDULE_AMBIGUO":
      return "Existe más de un Cuadro de Turno para este periodo. Contacte al administrador.";
    case "CODIGO_DESCONOCIDO":
      return "El código del turno programado no existe en el catálogo actual.";
    case "PROGRAMACION_INCONSISTENTE":
      return "La programación presenta una inconsistencia. Contacte al administrador.";
    case "USUARIO_INACTIVO":
      return "El usuario consultado no está activo.";
    case "SIN_PERMISO":
      return "No tiene permisos para consultar esta programación.";
  }
}

/** Estados visibles de vinculación en la interfaz administrativa. */
export type EstadoVinculo =
  | "VINCULADO"
  | "SIN VÍNCULO"
  | "SUGERENCIA DISPONIBLE"
  | "IDENTIDAD AMBIGUA"
  | "USUARIO INACTIVO"
  | "SIN COINCIDENCIA";

/** Fecha de calendario local: descompone YYYY-MM-DD sin desplazamiento horario. */
export function partesFecha(fecha: string): { year: number; month: number; day: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fecha);
  if (!m) return null;
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
}

/** Suma un día a una fecha de calendario (sin zona horaria). */
export function siguienteDia(fecha: string): string {
  const p = partesFecha(fecha);
  if (!p) return fecha;
  const d = new Date(Date.UTC(p.year, p.month - 1, p.day + 1));
  return d.toISOString().slice(0, 10);
}
