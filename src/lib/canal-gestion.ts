// ---------------------------------------------------------------------------
// FASE 5E · Bloque A.1 — Allowlist ÚNICA y compartida de CANAL DE GESTIÓN.
// Se usa en los cuatro modales (Remisiones, Referencias Internas,
// PHD/PAD/O2/Especiales y Pendientes) y en la validación server-side.
//
// Compatibilidad: el valor persistido históricamente es la etiqueta visible en
// mayúsculas (p. ej. "TELEFÓNICO"). Se conserva ese formato; el código técnico
// se expone solo para validación y documentación. Cuando el canal es OTRO, el
// comportamiento canónico existente persiste el texto libre especificado.
// ---------------------------------------------------------------------------

export const CANALES_GESTION_CATALOGO = [
  { codigo: "TELEFONICO", label: "TELEFÓNICO" },
  { codigo: "CORREO_ELECTRONICO", label: "CORREO ELECTRÓNICO" },
  { codigo: "PLATAFORMA_WEB", label: "PLATAFORMA WEB" },
  { codigo: "FISICO_PRESENCIAL", label: "FÍSICO / PRESENCIAL" },
  { codigo: "OTRO", label: "OTRO" },
] as const;

export const CANALES_GESTION_LABELS = CANALES_GESTION_CATALOGO.map((c) => c.label);

export const CANAL_OTRO_MIN = 3;
export const CANAL_OTRO_MAX = 80;

/**
 * Valida un canal de gestión ya resuelto (etiqueta canónica o, para OTRO, la
 * especificación libre). Devuelve false para vacío o para textos fuera de los
 * límites razonables.
 */
export function esCanalValido(valor: string | null | undefined): boolean {
  const v = (valor ?? "").trim().toUpperCase();
  if (!v) return false;
  if (CANALES_GESTION_LABELS.includes(v)) return true;
  // Canal OTRO con especificación libre: texto controlado.
  return v.length >= CANAL_OTRO_MIN && v.length <= CANAL_OTRO_MAX;
}
