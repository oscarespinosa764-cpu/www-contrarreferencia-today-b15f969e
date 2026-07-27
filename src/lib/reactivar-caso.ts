// -----------------------------------------------------------------------------
// FASE 2 · Constantes y tipos client-safe para la reactivación administrativa.
// Vive fuera de `*.functions.ts` porque el splitter de TanStack Start elimina
// los runtime siblings de esos archivos en el bundle del cliente; importar el
// constante desde una ruta React causaba `ReferenceError` al evaluar la vista
// de Historial (síntoma: "Esta página no cargó").
// -----------------------------------------------------------------------------

export const TIPOS_CASO_REACTIVABLES = [
  "entrante",
  "remision",
  "domiciliario",
] as const;
export type TipoCasoReactivable = (typeof TIPOS_CASO_REACTIVABLES)[number];

export const ESTADOS_CANCEL_POR_TIPO: Record<TipoCasoReactivable, readonly string[]> = {
  entrante: ["CANCELADO", "CANCELADO_VENCIMIENTO"],
  remision: [
    "CERRADO POR CANCELACION - AVAL PARA MANEJO INTEGRAL",
    "CERRADO POR CANCELACION - CONTINUIDAD DE MANEJO INTEGRAL",
    "CERRADO POR CANCELACION - DESISTIMIENTO DE TRASLADO GENERAL",
    "CERRADO POR CANCELACION - MEJORIA CLINICA / ALTA MEDICA",
  ],
  domiciliario: [
    "CERRADO POR CANCELACION DEL PROVEEDOR",
    "CERRADO POR CANCELACION DE LA ESPECIALIDAD SOLICITANTE",
  ],
};
