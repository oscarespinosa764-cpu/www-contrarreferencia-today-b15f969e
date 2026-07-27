// Helper canónico compartido para normalización de texto en buscadores,
// autocompletados, combobox y filtros de catálogo.
//
// Reglas (Fase 5B — Parte 5):
// - convertir a string seguro;
// - trim;
// - Unicode NFD;
// - eliminar marcas diacríticas (tildes, diéresis, etc.);
// - lowercase;
// - conservar el valor canónico original para mostrar y persistir.
//
// NO usar sobre textareas libres, observaciones, motivos, contenido documental
// libre ni firmas. La normalización es solo para comparar/buscar, nunca para
// reemplazar el valor persistido.

/** Devuelve una versión "search-friendly" (sin tildes, minúsculas, trim). */
export function normalizeForSearch(value: unknown): string {
  if (value == null) return "";
  const s = typeof value === "string" ? value : String(value);
  return s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

/**
 * ¿La aguja aparece en el pajar ignorando tildes y mayúsculas?
 * `haystack` puede ser cualquier valor: se normaliza defensivamente.
 */
export function includesNormalized(haystack: unknown, needle: unknown): boolean {
  const n = normalizeForSearch(needle);
  if (!n) return true;
  return normalizeForSearch(haystack).includes(n);
}

/** Filtra una lista de opciones por coincidencia sin tildes en un campo específico. */
export function filterByNormalized<T>(items: T[], needle: string, getLabel: (item: T) => string): T[] {
  const n = normalizeForSearch(needle);
  if (!n) return items;
  return items.filter((it) => normalizeForSearch(getLabel(it)).includes(n));
}
