// ---------------------------------------------------------------------------
// FASE 5D · Bloque B — Modelo canónico de solicitudes y requisitos para
// PHD / PAD / PAD CRÓNICO / OXÍGENO DOMICILIARIO / UNIDADES ESPECIALES /
// AMBULANCIA PARA EGRESO.
//
// Este módulo es SOLO presentación/derivación para la UI. La autoridad del
// estado y de los requisitos vive en el servidor
// (private.resolver_estado_phd + public.registrar_evento_phd).
// ---------------------------------------------------------------------------

export const SERVICIOS_CODIGOS = [
  "PHD",
  "PAD",
  "PAD_CRONICO",
  "UNIDADES_ESPECIALES",
  "OXIGENO_DOMICILIARIO",
  "AMBULANCIA_EGRESO",
] as const;

export type ServicioCodigo = (typeof SERVICIOS_CODIGOS)[number];

export const SERVICIO_LABEL: Record<ServicioCodigo, string> = {
  PHD: "PHD",
  PAD: "PAD",
  PAD_CRONICO: "PAD CRÓNICO",
  UNIDADES_ESPECIALES: "UNIDADES ESPECIALES",
  OXIGENO_DOMICILIARIO: "OXÍGENO DOMICILIARIO",
  AMBULANCIA_EGRESO: "AMBULANCIA PARA EGRESO",
};

/** Servicios que requieren aceptación de su proveedor. */
export const SERVICIOS_CON_ACEPTACION: ServicioCodigo[] = [
  "PHD",
  "PAD",
  "PAD_CRONICO",
  "UNIDADES_ESPECIALES",
  "OXIGENO_DOMICILIARIO",
];

export const TIPOS_AMBULANCIA_CODIGOS = ["TAB", "TAM", "TAM_N"] as const;
export type TipoAmbulanciaCodigo = (typeof TIPOS_AMBULANCIA_CODIGOS)[number];
export const TIPO_AMBULANCIA_LABEL: Record<TipoAmbulanciaCodigo, string> = {
  TAB: "TAB",
  TAM: "TAM",
  TAM_N: "TAM-N",
};

export const MAX_TIPOS_SOLICITUD = 4;

// --- Estados canónicos del ciclo -------------------------------------------
export const PHD_ESTADOS_CANONICOS = [
  "PENDIENTE ACEPTACION",
  "ACEPTADO CON PENDIENTE ENTREGA OXIGENO",
  "ACEPTADO CON PENDIENTE COORDINACION DE AMBULANCIA",
  "ACEPTADO CON AMBULANCIA COORDINADA",
  "AMBULANCIA EN SITIO // PTE EGRESO",
  "ACEPTADO CON PENDIENTE EGRESO",
] as const;

export type PhdEstadoCanonico = (typeof PHD_ESTADOS_CANONICOS)[number];

/** Normaliza estados históricos al vocabulario canónico actual. */
export function normalizarEstadoPhd(estado?: string | null): string {
  const s = (estado ?? "").trim().toUpperCase();
  if (!s) return "PENDIENTE ACEPTACION";
  if (s === "ACEPTADO - PENDIENTE EGRESO") return "ACEPTADO CON PENDIENTE EGRESO";
  if (s === "ACEPTADO - PENDIENTE COORDINACION DE AMBULANCIA")
    return "ACEPTADO CON PENDIENTE COORDINACION DE AMBULANCIA";
  if (s === "AMBULANCIA COORDINADA - PENDIENTE EGRESO") return "ACEPTADO CON AMBULANCIA COORDINADA";
  if (s === "ACEPTADO CON AMBULANCIA COORDINADA // PTE EGRESO")
    return "ACEPTADO CON AMBULANCIA COORDINADA";
  return s;
}

export function esEstadoTerminalPhd(estado?: string | null) {
  return (estado ?? "").toUpperCase().startsWith("CERRADO");
}

// --- Segmentos del listado activo ------------------------------------------
export type SegmentoPhd = {
  key: string;
  label: string;
  descripcion: string;
  color: string;
  bar: string;
};

export const SEGMENTOS_PHD: SegmentoPhd[] = [
  {
    key: "PENDIENTE ACEPTACION",
    label: "Pendiente aceptación",
    descripcion: "Pendiente aceptación de uno o más proveedores requeridos",
    color: "bg-status-amber/15 text-status-amber",
    bar: "border-l-status-amber",
  },
  {
    key: "ACEPTADO CON PENDIENTE ENTREGA OXIGENO",
    label: "Pendiente entrega de oxígeno",
    descripcion: "Proveedores aceptados, pendiente entrega de oxígeno",
    color: "bg-cyan-500/15 text-cyan-600",
    bar: "border-l-cyan-500",
  },
  {
    key: "ACEPTADO CON PENDIENTE COORDINACION DE AMBULANCIA",
    label: "Pendiente coordinar ambulancia",
    descripcion: "Requisitos previos completados, pendiente coordinar ambulancia",
    color: "bg-sky-500/15 text-sky-600",
    bar: "border-l-sky-500",
  },
  {
    key: "ACEPTADO CON AMBULANCIA COORDINADA",
    label: "Ambulancia coordinada",
    descripcion: "Ambulancia coordinada, pendiente confirmar su llegada",
    color: "bg-indigo-500/15 text-indigo-600",
    bar: "border-l-indigo-500",
  },
  {
    key: "AMBULANCIA EN SITIO // PTE EGRESO",
    label: "Ambulancia en sitio",
    descripcion: "Ambulancia en sitio, pendiente realizar el egreso",
    color: "bg-violet-500/15 text-violet-600",
    bar: "border-l-violet-500",
  },
  {
    key: "ACEPTADO CON PENDIENTE EGRESO",
    label: "Pendiente egreso",
    descripcion: "Requisitos completados, pendiente realizar el egreso",
    color: "bg-status-green/15 text-status-green",
    bar: "border-l-status-green",
  },
];

const SEGMENTO_OTROS: SegmentoPhd = {
  key: "OTROS",
  label: "Otros estados",
  descripcion: "Casos que no clasifican en los segmentos anteriores",
  color: "bg-muted text-muted-foreground",
  bar: "border-l-border",
};

export function agruparPhdPorSegmento<T extends { estado_ciclo?: string | null; estado?: string | null }>(
  items: T[],
): Array<{ segmento: SegmentoPhd; items: T[] }> {
  const buckets = new Map<string, T[]>();
  for (const it of items) {
    const estado = normalizarEstadoPhd(it.estado_ciclo ?? it.estado);
    const seg = SEGMENTOS_PHD.find((s) => s.key === estado) ? estado : "OTROS";
    if (!buckets.has(seg)) buckets.set(seg, []);
    buckets.get(seg)!.push(it);
  }
  const out: Array<{ segmento: SegmentoPhd; items: T[] }> = [];
  for (const seg of SEGMENTOS_PHD) {
    const arr = buckets.get(seg.key);
    if (arr?.length) out.push({ segmento: seg, items: arr });
  }
  const otros = buckets.get("OTROS");
  if (otros?.length) out.push({ segmento: SEGMENTO_OTROS, items: otros });
  return out;
}

// --- Derivación de requisitos (solo lectura para la UI) ---------------------
export type EventoPhd = {
  evento?: string | null;
  servicio_codigo?: string | null;
  [k: string]: unknown;
};

export type RequisitosPhd = {
  tipos: ServicioCodigo[];
  aceptacionesPendientes: ServicioCodigo[];
  aceptacionesCompletas: ServicioCodigo[];
  oxigenoAplica: boolean;
  oxigenoAceptado: boolean;
  oxigenoEntregado: boolean;
  ambulanciaAplica: boolean;
  ambulanciaCoordinada: boolean;
  ambulanciaEnSitio: boolean;
  puedeCerrar: boolean;
};

export function normalizarTipos(raw: unknown): ServicioCodigo[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((v) => String(v).toUpperCase() as ServicioCodigo)
    .filter((v) => (SERVICIOS_CODIGOS as readonly string[]).includes(v));
}

/**
 * Deriva los requisitos a partir de los eventos del ciclo vigente.
 * `eventos` debe venir ya filtrado al ciclo activo (ver consulta del modal).
 */
export function derivarRequisitos(
  tiposRaw: unknown,
  eventos: EventoPhd[],
): RequisitosPhd {
  const tipos = normalizarTipos(tiposRaw);
  const has = (ev: string) => eventos.some((e) => (e.evento ?? "").toUpperCase() === ev);
  const aceptados = new Set(
    eventos
      .filter((e) => (e.evento ?? "").toUpperCase() === "ACEPTACION_PROVEEDOR")
      .map((e) => String(e.servicio_codigo ?? "").toUpperCase()),
  );

  const conAceptacion = tipos.filter((t) => SERVICIOS_CON_ACEPTACION.includes(t));
  const aceptacionesPendientes = conAceptacion.filter((t) => !aceptados.has(t));
  const aceptacionesCompletas = conAceptacion.filter((t) => aceptados.has(t));

  const oxigenoAplica = tipos.includes("OXIGENO_DOMICILIARIO");
  const oxigenoAceptado = aceptados.has("OXIGENO_DOMICILIARIO");
  const oxigenoEntregado = has("CONFIRMACION_ENTREGA_OXIGENO");
  const ambulanciaAplica = tipos.includes("AMBULANCIA_EGRESO");
  const ambulanciaCoordinada = has("AMBULANCIA_COORDINADA");
  const ambulanciaEnSitio = has("CONFIRMACION_LLEGADA_AMBULANCIA");

  const puedeCerrar =
    aceptacionesPendientes.length === 0 &&
    (!oxigenoAplica || oxigenoEntregado) &&
    (!ambulanciaAplica || ambulanciaEnSitio);

  return {
    tipos,
    aceptacionesPendientes,
    aceptacionesCompletas,
    oxigenoAplica,
    oxigenoAceptado,
    oxigenoEntregado,
    ambulanciaAplica,
    ambulanciaCoordinada,
    ambulanciaEnSitio,
    puedeCerrar,
  };
}

// --- Catálogo de eventos (tipos de seguimiento) ------------------------------
// Bloque C: catálogo visible normalizado. Los códigos retirados se conservan
// SOLO para poder mostrar el historial ya registrado.
export const EVENTO_LABEL: Record<string, string> = {
  // Vigentes
  ACEPTACION_PROVEEDOR: "ACEPTACIÓN DE TRÁMITE",
  RADICACION: "RADICADO DEL CASO",
  EVOLUCION_DIARIA: "EVOLUCIÓN DIARIA",
  NOVEDADES: "NOVEDADES",
  OTRO: "OTRO",
  INFORMACION_TRAMITE: "INFORMACIÓN DEL TRÁMITE",
  CONFIRMACION_ENTREGA_OXIGENO: "CONFIRMACIÓN DE ENTREGA DE OXÍGENO",
  AMBULANCIA_COORDINADA: "COORDINACIÓN DE AMBULANCIA",
  CONFIRMACION_LLEGADA_AMBULANCIA: "CONFIRMACIÓN DE LLEGADA DE AMBULANCIA",
  CIERRE_POR_EGRESO: "CONFIRMACIÓN DE EGRESO",
  CANCELACION_TRAMITE: "CANCELACIÓN DE TRÁMITE",
  // Históricos (solo lectura)
  EVOLUCION_NOVEDAD: "EVOLUCIÓN / NOVEDAD",
  SEGUIMIENTO_GENERAL: "SEGUIMIENTO GENERAL",
  RESPUESTA_PROVEEDOR: "RESPUESTA DEL PROVEEDOR",
  NO_ACEPTACION_PROVEEDOR: "NO ACEPTACIÓN DEL PROVEEDOR",
  CANCELACION_PROVEEDOR: "CANCELACIÓN POR EL PROVEEDOR",
  CANCELACION_ESPECIALIDAD: "CANCELACIÓN POR LA ESPECIALIDAD SOLICITANTE",
};

export type OpcionesEventos = {
  /** La EAPB del caso exige radicación para los servicios solicitados. */
  exigeRadicacion?: boolean;
  /** Ya existe un radicado registrado en el ciclo vigente. */
  radicacionRegistrada?: boolean;
};

/** Matriz de disponibilidad (Bloque C). El servidor revalida lo mismo. */
export function eventosDisponibles(
  req: RequisitosPhd,
  opts: OpcionesEventos = {},
): string[] {
  const out: string[] = [];

  if (req.aceptacionesPendientes.length > 0) out.push("ACEPTACION_PROVEEDOR");
  if (opts.exigeRadicacion && !opts.radicacionRegistrada) out.push("RADICACION");

  out.push("EVOLUCION_DIARIA", "NOVEDADES", "OTRO", "INFORMACION_TRAMITE");

  if (req.oxigenoAplica && req.oxigenoAceptado && !req.oxigenoEntregado) {
    out.push("CONFIRMACION_ENTREGA_OXIGENO");
  }
  if (
    req.ambulanciaAplica &&
    !req.ambulanciaCoordinada &&
    req.aceptacionesPendientes.length === 0 &&
    (!req.oxigenoAplica || req.oxigenoEntregado)
  ) {
    out.push("AMBULANCIA_COORDINADA");
  }
  if (req.ambulanciaAplica && req.ambulanciaCoordinada && !req.ambulanciaEnSitio) {
    out.push("CONFIRMACION_LLEGADA_AMBULANCIA");
  }
  if (req.puedeCerrar) out.push("CIERRE_POR_EGRESO");

  out.push("CANCELACION_TRAMITE");
  return out;
}

