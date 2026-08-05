// ============================================================
// ENTRANTES · CLASIFICACIÓN CANÓNICA DE LA SOLICITUD Y MAPEO GU-FR-50.
//
// Módulo puro y client-safe (sin Supabase, sin ExcelJS): define la
// clasificación funcional exportable, la agrupación de eventos por caso y
// la construcción de la fila canónica de la hoja ENTRANTES.
//
// El estado OPERATIVO interno (REGISTRADO, INGRESADO, CANCELADO_*, VIGENTE…)
// sigue existiendo para vigencia, temporizadores y acciones, pero NUNCA es la
// fuente de la columna "ESTADO DE SOLICITUD".
// ============================================================

export const CLASIFICACIONES_SOLICITUD = [
  "ACEPTADO",
  "NEGADO",
  "DIRECCIONAMIENTO_CRUE",
  "INGRESO_SIN_GESTION_PREVIA_REFERENCIA",
] as const;
export type ClasificacionSolicitud = (typeof CLASIFICACIONES_SOLICITUD)[number];

/** Etiqueta exacta que se escribe en GU-FR-50 (columna ESTADO DE SOLICITUD). */
export const ETIQUETA_CLASIFICACION: Record<ClasificacionSolicitud, string> = {
  ACEPTADO: "ACEPTADO",
  NEGADO: "NEGADO",
  DIRECCIONAMIENTO_CRUE: "DIRECCIONAMIENTO CRUE",
  INGRESO_SIN_GESTION_PREVIA_REFERENCIA: "INGRESO SIN GESTIÓN PREVIA DE REFERENCIA",
};

export const MODALIDADES_INGRESO = [
  "NORMAL_POR_ACEPTACION",
  "INGRESO_TARDIO",
  "DIRECCIONAMIENTO_CRUE",
  "INGRESO_POSTERIOR_A_NEGACION",
  "SIN_GESTION_PREVIA_REFERENCIA",
] as const;
export type ModalidadIngreso = (typeof MODALIDADES_INGRESO)[number];

export const ETIQUETA_MODALIDAD: Record<ModalidadIngreso, string> = {
  NORMAL_POR_ACEPTACION: "NORMAL POR ACEPTACIÓN",
  INGRESO_TARDIO: "INGRESO TARDÍO",
  DIRECCIONAMIENTO_CRUE: "DIRECCIONAMIENTO CRUE",
  INGRESO_POSTERIOR_A_NEGACION: "INGRESO POSTERIOR A NEGACIÓN",
  SIN_GESTION_PREVIA_REFERENCIA: "SIN GESTIÓN PREVIA DE REFERENCIA",
};

/** Modalidades que SIEMPRE exigen justificación de confirmación. */
export const MODALIDAD_EXIGE_JUSTIFICACION = new Set<string>([
  "INGRESO_TARDIO",
  "DIRECCIONAMIENTO_CRUE",
  "INGRESO_POSTERIOR_A_NEGACION",
  "SIN_GESTION_PREVIA_REFERENCIA",
]);

export const UNIDADES_EDAD = ["AÑOS", "MESES", "DIAS"] as const;
export type UnidadEdad = (typeof UNIDADES_EDAD)[number];

export type FilaEntrante = Record<string, unknown>;

const t = (v: unknown): string => (v === null || v === undefined ? "" : String(v).trim());
const tipoDe = (r: FilaEntrante) => t(r.tipo).toUpperCase();

/** Tipos que abren una solicitud (fila principal del caso). */
export const esTipoPrincipal = (tipo: string): boolean =>
  tipo === "ACEP" || tipo === "NEG" || tipo === "SIN_GESTION" || tipo.startsWith("CRUE");

/**
 * Clasificación canónica de UNA fila principal, con la regla de precedencia:
 * una decisión explícita (aceptación/negación) prevalece siempre sobre el
 * direccionamiento CRUE, ocurra este antes o después.
 */
export function clasificarPrincipal(tipo: string): ClasificacionSolicitud | null {
  const v = tipo.toUpperCase();
  if (v === "ACEP") return "ACEPTADO";
  if (v === "NEG") return "NEGADO";
  if (v === "SIN_GESTION") return "INGRESO_SIN_GESTION_PREVIA_REFERENCIA";
  if (v.startsWith("CRUE")) return "DIRECCIONAMIENTO_CRUE";
  return null;
}

/**
 * Clasificación del CASO completo a partir de sus filas (decisión + eventos).
 * Precedencia determinística: ACEPTADO/NEGADO > DIRECCIONAMIENTO CRUE >
 * INGRESO SIN GESTIÓN PREVIA. Nunca se inventa una decisión inexistente.
 */
export function clasificarCaso(filas: FilaEntrante[]): ClasificacionSolicitud | null {
  let crue = false;
  let sinGestion = false;
  for (const f of filas) {
    const tipo = tipoDe(f);
    if (tipo === "ACEP") return "ACEPTADO";
    if (tipo === "NEG") return "NEGADO";
    if (tipo.startsWith("CRUE")) crue = true;
    if (tipo === "SIN_GESTION") sinGestion = true;
  }
  if (crue) return "DIRECCIONAMIENTO_CRUE";
  if (sinGestion) return "INGRESO_SIN_GESTION_PREVIA_REFERENCIA";
  return null;
}

export interface GrupoEntrante {
  /** Código de la solicitud (código del evento principal). */
  clave: string;
  principal: FilaEntrante;
  /** Eventos derivados: ING, CAN, AMP… en orden cronológico. */
  eventos: FilaEntrante[];
}

const orden = (r: FilaEntrante): number => {
  const s = t(r.created_at) || t(r.fecha);
  const d = s ? new Date(s).getTime() : NaN;
  return Number.isNaN(d) ? 0 : d;
};

/**
 * Agrupa las filas de casos_entrantes en SOLICITUDES: una fila principal
 * (ACEP, NEG, CRUE, SIN_GESTION) más sus eventos derivados (cod_ref).
 * Las filas huérfanas conservan su propia unidad: nunca se descartan.
 */
export function agruparEntrantes(filas: FilaEntrante[]): GrupoEntrante[] {
  const grupos = new Map<string, GrupoEntrante>();
  const ordenadas = [...filas].sort((a, b) => orden(a) - orden(b));

  for (const f of ordenadas) {
    const clave = t(f.cod_ref) || t(f.codigo) || t(f.id);
    const g = grupos.get(clave);
    if (!g) {
      grupos.set(clave, { clave, principal: f, eventos: [] });
      continue;
    }
    const actual = tipoDe(g.principal);
    const nuevo = tipoDe(f);
    if (!esTipoPrincipal(actual) && esTipoPrincipal(nuevo)) {
      g.eventos.push(g.principal);
      g.principal = f;
    } else {
      g.eventos.push(f);
    }
  }
  return Array.from(grupos.values());
}

// ---------------------------------------------------------------------------
// Mapeo canónico a la hoja ENTRANTES de GU-FR-50
// ---------------------------------------------------------------------------

const iso = (v: unknown): string | null => {
  const s = t(v);
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

const soloFecha = (v: unknown): string | null => {
  const s = t(v);
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
};

const dur = (a: unknown, b: unknown): number | null => {
  const x = a instanceof Date ? a.toISOString() : iso(a);
  const y = b instanceof Date ? b.toISOString() : iso(b);
  if (!x || !y) return null;
  const ms = new Date(y).getTime() - new Date(x).getTime();
  if (!Number.isFinite(ms) || ms < 0) return null;
  return ms / 86_400_000;
};

const meta = (r: FilaEntrante): Record<string, unknown> =>
  (r.metadata && typeof r.metadata === "object" ? (r.metadata as Record<string, unknown>) : {});

const primero = (...vals: unknown[]): string => {
  for (const v of vals) {
    const s = t(v);
    if (s) return s;
  }
  return "";
};

/** Estados operativos que representan un cierre SIN ingreso del paciente. */
const NO_INGRESO = /CANCEL|VENCID|NO INGRES|ARCHIV/i;

/**
 * FECHA Y HORA ENVÍO DE REMISIÓN:
 *  - instante real (Date) cuando la hora es conocida;
 *  - "YYYY-MM-DD" (solo fecha) para registros legacy sin hora;
 *  - null cuando no existe remisión previa (ingreso sin gestión previa).
 */
export function fechaEnvioRemision(p: FilaEntrante): Date | string | null {
  if (tipoDe(p) === "SIN_GESTION") return null;
  const completa = iso(p.fecha_envio_remision);
  if (completa && p.remision_hora_conocida === true) return new Date(completa);
  const d = soloFecha(p.fecha_envio_remision) ?? soloFecha(p.fecha);
  return d ?? null;
}

/** Construye la fila canónica de GU-FR-50 · ENTRANTES para una solicitud. */
export function mapearGrupoEntrante(g: GrupoEntrante): Record<string, unknown> {
  const p = g.principal;
  const todas = [p, ...g.eventos];
  const clasificacion = clasificarCaso(todas);
  const m = meta(p);

  const ingreso =
    todas.find((r) => tipoDe(r) === "ING" || r.ingreso_confirmado === true) ??
    (tipoDe(p) === "SIN_GESTION" ? p : undefined);
  const cierreSinIngreso = !ingreso && todas.some((r) => NO_INGRESO.test(t(r.estado) + " " + tipoDe(r)));

  const unidadPrevista = primero(p.unidad_prevista, p.unidad);
  const unidadReal = ingreso ? primero(ingreso.unidad_real, ingreso.unidad, unidadPrevista) : "";
  const tep = ingreso ?? {};

  const fechaEnvio = fechaEnvioRemision(p);
  const fechaRespuesta = iso(p.created_at) ?? iso(p.fecha);

  return {
    fecha_envio: fechaEnvio,
    ips_remite: t(p.ips),
    ciudad_departamento: [t(p.ciudad_remitente), t(p.departamento_remitente)]
      .filter(Boolean)
      .join(", "),
    documento: t(p.documento),
    paciente: [t(p.nombres), t(p.apellidos)].filter(Boolean).join(" "),
    edad: p.edad_valor === null || p.edad_valor === undefined ? null : Number(p.edad_valor),
    unidad_edad: t(p.edad_unidad),
    eapb: primero(p.eapb, p.aseguramiento),
    especialidad: primero(p.especialidad_remision, p.especialidad),
    cie10: t(p.cie10_codigo),
    cie10_descripcion: t(p.cie10_descripcion),
    fecha_respuesta: fechaRespuesta,
    oportunidad_respuesta:
      fechaEnvio instanceof Date ? dur(fechaEnvio, fechaRespuesta) : null,
    codigo_aceptacion: t(p.codigo),
    estado: clasificacion ? ETIQUETA_CLASIFICACION[clasificacion] : "",
    motivos:
      clasificacion === "NEGADO"
        ? primero(p.motivo_negacion, m.motivo_negacion)
        : "",
    justificacion: primero(p.justificacion_decision, p.detalle),
    unidad: ingreso ? unidadReal : clasificacion === "ACEPTADO" && !cierreSinIngreso ? unidadPrevista : "",
    ingresa: ingreso ? "SI" : cierreSinIngreso ? "NO" : "",
    justificacion_confirmacion: ingreso ? primero(ingreso.justificacion_confirmacion) : "",
    codigo_crue: primero(
      ...todas.map((r) => r.codigo_crue),
      ...todas.map((r) => meta(r).codigo_crue),
    ),
    tipo_ambulancia: t((tep as FilaEntrante).tipo_ambulancia),
    empresa_traslado: t((tep as FilaEntrante).empresa_tep),
    placa: t((tep as FilaEntrante).placa_vehiculo),
    profesional: t((tep as FilaEntrante).profesional_tep_nombre),
    cargo: t((tep as FilaEntrante).profesional_tep_cargo),
  };
}

/** Mapeo completo de la hoja ENTRANTES: una fila por SOLICITUD, no por evento. */
export function mapearEntrantesGuFr50(filas: FilaEntrante[]): Record<string, unknown>[] {
  return agruparEntrantes(filas).map(mapearGrupoEntrante);
}
