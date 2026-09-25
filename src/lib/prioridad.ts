// Prioridad clínica canónica (Res. 2335 de 2023 / GU-P-06): URGENTE /
// PRIORITARIA / ELECTIVA. Los registros nuevos guardan este vocabulario; los
// valores históricos (ALTA/ALTO, MEDIA/MEDIO, BAJA/BAJO) se traducen al leer.
// No se reescriben datos guardados.

export const PRIORIDADES_CLINICAS = ["URGENTE", "PRIORITARIA", "ELECTIVA"] as const;
export type PrioridadClinica = (typeof PRIORIDADES_CLINICAS)[number];

const EQUIVALENCIA: Record<string, PrioridadClinica> = {
  URGENTE: "URGENTE",
  ALTA: "URGENTE",
  ALTO: "URGENTE",
  PRIORITARIA: "PRIORITARIA",
  MEDIA: "PRIORITARIA",
  MEDIO: "PRIORITARIA",
  ELECTIVA: "ELECTIVA",
  BAJA: "ELECTIVA",
  BAJO: "ELECTIVA",
};

/** Traduce cualquier valor guardado a la categoría canónica ("" si no aplica). */
export function prioridadCanonica(v: unknown): PrioridadClinica | "" {
  const k = String(v ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase();
  return EQUIVALENCIA[k] ?? "";
}

/** Etiqueta visible: la canónica, o el valor original si no es traducible. */
export function etiquetaPrioridad(v: unknown): string {
  return prioridadCanonica(v) || String(v ?? "").trim();
}

/** true si el valor guardado equivale a URGENTE (incluye ALTA/ALTO legacy). */
export function esPrioridadUrgente(v: unknown): boolean {
  return prioridadCanonica(v) === "URGENTE";
}
