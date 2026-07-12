// ---------------------------------------------------------------------------
// Tipos y helpers para la tabla persistente `reglas_coordinacion`.
// Estas reglas producen ALERTAS DE COORDINACIÓN (no avisos operativos).
// El catálogo estático de src/lib/alertas-coordinacion.ts se mantiene como
// respaldo/semilla; esta tabla es la versión administrable por coordinación.
// ---------------------------------------------------------------------------
import type { Database } from "@/integrations/supabase/types";

export type ReglaCoordDB = Database["public"]["Tables"]["reglas_coordinacion"]["Row"];

export const NIVEL_LABEL_COORD: Record<string, string> = {
  MEDIO: "MEDIA",
  ALTO: "ALTA",
  CRITICO: "CRÍTICA",
};

export const NIVEL_BADGE_COORD: Record<string, string> = {
  MEDIO: "bg-status-sky/15 text-status-sky",
  ALTO: "bg-status-amber/15 text-status-amber",
  CRITICO: "bg-status-red/15 text-status-red",
};

export function umbralTextoDB(r: Pick<ReglaCoordDB, "codigo" | "umbral" | "unidad">): string {
  if (r.umbral == null || r.unidad == null) return "Evento inmediato";
  if (r.codigo === "ALT-ENT-CAN-ANTICIPADA") return "Tiempo de cupo restante";
  const u =
    r.unidad === "min"
      ? "min"
      : r.unidad === "horas"
        ? "h"
        : r.unidad === "turnos"
          ? "turno(s)"
          : r.unidad;
  return `${r.umbral} ${u}`;
}
