// Clasificación visual de casos SALIENTES por etapa operativa.
// Se usa en el Dashboard de Salientes para agrupar las tarjetas por etapa
// sin cambiar la lógica de negocio ni los estados persistidos.

export type EtapaSaliente =
  | "PENDIENTE_ACEPTACION"
  | "ACEPTADO_SIN_AMBULANCIA"
  | "AMBULANCIA_COORDINADA"
  | "DESISTIMIENTOS"
  | "OTROS";

export type EtapaMeta = {
  key: EtapaSaliente;
  titulo: string;
  descripcion: string;
  // Clases Tailwind para la barra/etiqueta (usa tokens semánticos del tema).
  color: string;
  bar: string;
};

export const ETAPAS_META: Record<EtapaSaliente, EtapaMeta> = {
  PENDIENTE_ACEPTACION: {
    key: "PENDIENTE_ACEPTACION",
    titulo: "Pendiente de aceptación",
    descripcion: "Aún esperando respuesta de la IPS receptora",
    color: "bg-status-amber/15 text-status-amber",
    bar: "border-l-status-amber",
  },
  ACEPTADO_SIN_AMBULANCIA: {
    key: "ACEPTADO_SIN_AMBULANCIA",
    titulo: "Aceptado sin ambulancia",
    descripcion: "Cupo aceptado, traslado por coordinar",
    color: "bg-sky-500/15 text-sky-600",
    bar: "border-l-sky-500",
  },
  AMBULANCIA_COORDINADA: {
    key: "AMBULANCIA_COORDINADA",
    titulo: "Ambulancia coordinada",
    descripcion: "Traslado definido, en curso o pendiente de egreso",
    color: "bg-status-green/15 text-status-green",
    bar: "border-l-status-green",
  },
  DESISTIMIENTOS: {
    key: "DESISTIMIENTOS",
    titulo: "Desistimientos / cancelados",
    descripcion: "Casos con desistimiento o cancelación",
    color: "bg-status-red/15 text-status-red",
    bar: "border-l-status-red",
  },
  OTROS: {
    key: "OTROS",
    titulo: "Otros estados",
    descripcion: "Casos que no clasifican en las etapas anteriores",
    color: "bg-muted text-muted-foreground",
    bar: "border-l-border",
  },
};

export const ETAPA_ORDEN: EtapaSaliente[] = [
  "PENDIENTE_ACEPTACION",
  "ACEPTADO_SIN_AMBULANCIA",
  "AMBULANCIA_COORDINADA",
  "DESISTIMIENTOS",
  "OTROS",
];

/** Clasifica el caso a una etapa a partir de su `estado` textual. */
export function clasificarEtapa(estado: string | null | undefined): EtapaSaliente {
  const s = (estado ?? "").toUpperCase();
  if (!s) return "OTROS";

  if (/(DESIST|CANCEL|NEGAD|RECHAZ|SUSPEND)/.test(s)) return "DESISTIMIENTOS";

  // Aceptado pero la ambulancia AÚN está por coordinar (PHD/PAD/O2 y salientes).
  // Debe evaluarse antes que /COORDINAD/ para no confundir
  // "PENDIENTE COORDINACION DE AMBULANCIA" con "AMBULANCIA COORDINADA".
  if (/PENDIENTE\s+(DE\s+)?COORDINACION/.test(s)) return "ACEPTADO_SIN_AMBULANCIA";

  // Ambulancia coordinada / en traslado / pendiente de egreso.
  if (/COORDINAD/.test(s) || /AMBULANCIA.*(EGRESO|COORDINAD)/.test(s)) {
    return "AMBULANCIA_COORDINADA";
  }

  // Aceptado — pendiente de ambulancia.
  if (/ACEPTAD/.test(s) && /(PENDIENTE|SIN)/.test(s)) return "ACEPTADO_SIN_AMBULANCIA";
  if (/ACEPTAD/.test(s)) return "ACEPTADO_SIN_AMBULANCIA";

  if (/PENDIENTE/.test(s)) return "PENDIENTE_ACEPTACION";

  return "OTROS";
}


/**
 * Agrupa una lista de casos por etapa, respetando el orden canónico.
 * `getEstado` permite usar otro campo de estado (p. ej. `estado_ciclo` en
 * PHD / PAD / O2 / Especiales, donde el ciclo es la fuente de verdad).
 */
export function agruparPorEtapa<T extends { estado?: string | null }>(
  items: T[],
  getEstado?: (item: T) => string | null | undefined,
): { etapa: EtapaMeta; items: T[] }[] {
  const buckets: Record<EtapaSaliente, T[]> = {
    PENDIENTE_ACEPTACION: [],
    ACEPTADO_SIN_AMBULANCIA: [],
    AMBULANCIA_COORDINADA: [],
    DESISTIMIENTOS: [],
    OTROS: [],
  };
  for (const it of items) {
    buckets[clasificarEtapa(getEstado ? getEstado(it) : it.estado)].push(it);
  }

  return ETAPA_ORDEN
    .map((k) => ({ etapa: ETAPAS_META[k], items: buckets[k] }))
    .filter((g) => g.items.length > 0);
}
