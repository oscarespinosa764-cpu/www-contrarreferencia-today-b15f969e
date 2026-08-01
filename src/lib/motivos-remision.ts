// Fuente canónica ÚNICA del motivo de remisión (`remisiones.remision_por`).
// El servidor valida contra la misma lista (private.motivos_remision_allow()).
// No agregar valores sin actualizar también la función SQL.

export const MOTIVOS_REMISION = [
  "RED NO CONTRATADA",
  "NO RECURSO HUMANO",
  "NO DISPONIBILIDAD DE INSUMO O TECNOLOGIA",
  "NO DISPONIBILIDAD DE UNIDAD",
  "NO DISPONIBILIDAD DE CAMAS",
  "NIVEL DE COMPETENCIA",
  "PETICION VOLUNTARIA",
  "EN TRAMITE",
] as const;

export type MotivoRemision = (typeof MOTIVOS_REMISION)[number];

/** Normaliza para comparar equivalencias (sin tildes, espacios simples). */
export function normMotivo(v: string | null | undefined): string {
  return (v ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

export function esMotivoValido(v: string | null | undefined): boolean {
  const n = normMotivo(v);
  return MOTIVOS_REMISION.some((m) => normMotivo(m) === n);
}
