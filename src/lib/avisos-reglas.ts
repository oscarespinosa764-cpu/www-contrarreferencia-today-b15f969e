// ---------------------------------------------------------------------------
// Avisos operativos manuales + Reglas operativas (motor de alertas inteligentes)
// Reconstrucción según ESPECIFICACION_AVISOS_Y_REGLAS_OPERATIVAS.
// Tablas: avisos (operational_notices) y reglas_operativas (operational_rules).
// El motor evalúa reglas activas contra casos activos y genera alertas IA en memoria.
// ---------------------------------------------------------------------------

// ---- Constantes de catálogo ----

export const NIVELES = ["INFO", "MEDIO", "ALTO", "CRITICO"] as const;
export type Nivel = (typeof NIVELES)[number];

export const PRIORIDADES = ["BAJO", "MEDIO", "ALTO", "CRITICO"] as const;

/** Módulos de avisos manuales (etiquetas de interfaz). */
export const AVISO_MODULOS = [
  "General",
  "REMISIONES",
  "PHD/PAD/O2/Especiales",
  "REFERENCIA INTERNA",
  "RED",
  "TURNO",
] as const;

/** Códigos internos estables de módulo para reglas + etiqueta amigable. */
export const REGLA_MODULOS = [
  { code: "remisiones", label: "REMISIONES" },
  { code: "especiales", label: "PHD / PAD / O2 / ESPECIALES" },
  { code: "referencia_interna", label: "REFERENCIA INTERNA CEDIM IPS" },
  { code: "pendientes", label: "PENDIENTES GENERALES" },
] as const;
export type ModuloCode = (typeof REGLA_MODULOS)[number]["code"];

export function moduloLabel(code: string): string {
  return REGLA_MODULOS.find((m) => m.code === code)?.label ?? code;
}

export const CONDICIONES = [
  { value: "HORAS_ABIERTO", label: "Horas abierto", needsHoras: true, needsCampo: false, needsValor: false },
  { value: "ESTADO_TIEMPO", label: "Estado durante X horas", needsHoras: true, needsCampo: true, needsValor: true },
  { value: "ESTADO_IGUAL", label: "Estado igual a", needsHoras: false, needsCampo: true, needsValor: true },
  { value: "PRIORIDAD_IGUAL", label: "Prioridad igual a", needsHoras: false, needsCampo: false, needsValor: true },
  { value: "SIN_RADICADO_TIEMPO", label: "Sin radicado durante X horas", needsHoras: true, needsCampo: false, needsValor: false },
  { value: "SIN_SEGUIMIENTO_TIEMPO", label: "Sin seguimiento reciente", needsHoras: true, needsCampo: false, needsValor: false },
  { value: "CAMPO_CONTIENE", label: "Campo contiene texto", needsHoras: false, needsCampo: true, needsValor: true },
] as const;
export type CondicionTipo = (typeof CONDICIONES)[number]["value"];

export function condicionMeta(tipo: string) {
  return CONDICIONES.find((c) => c.value === tipo);
}

/** Campos seleccionables por módulo (claves normalizadas del motor). */
export const CAMPOS_BASE = [
  "ESTADO",
  "PRIORIDAD",
  "CODIGO_RADICACION",
  "PACIENTE",
  "DOCUMENTO",
  "SERVICIO",
  "ESPECIALIDAD",
  "ASEGURADOR",
  "EPS",
  "EAPB",
  "TIPO_SOLICITUD",
  "TIPO_PENDIENTE",
  "OBSERVACIONES",
] as const;

export function camposPorModulo(code: string): string[] {
  if (code === "pendientes") {
    return ["ESTADO", "PRIORIDAD", "PACIENTE", "TIPO_PENDIENTE", "OBSERVACIONES"];
  }
  if (code === "referencia_interna") {
    return ["ESTADO", "PRIORIDAD", "PACIENTE", "DOCUMENTO", "SERVICIO", "TIPO_SOLICITUD", "OBSERVACIONES"];
  }
  return [
    "ESTADO",
    "PRIORIDAD",
    "CODIGO_RADICACION",
    "PACIENTE",
    "DOCUMENTO",
    "SERVICIO",
    "ESPECIALIDAD",
    "ASEGURADOR",
    "EAPB",
    "TIPO_SOLICITUD",
    "OBSERVACIONES",
  ];
}

export const VARIABLES = [
  "{PACIENTE}",
  "{DOCUMENTO}",
  "{ESTADO}",
  "{PRIORIDAD}",
  "{HORAS}",
  "{MODULO}",
  "{TIPO}",
  "{RADICADO}",
  "{SERVICIO}",
  "{ASEGURADOR}",
] as const;

// ---- Tipos ----

export type Regla = {
  id: string;
  nombre: string;
  modulo: string;
  tipo_condicion: string;
  campo: string | null;
  valor: string | null;
  horas: number | null;
  nivel: string;
  mensaje: string;
  accion: string | null;
  activo: boolean;
  archivado: boolean;
};

export type Aviso = {
  id: string;
  mensaje: string;
  prioridad: string | null;
  modulo: string | null;
  fecha_inicio: string | null;
  fecha_final: string | null;
  estado: string | null;
  archivado: boolean;
  created_at?: string;
};

export type AvisoDominio =
  | "REMISIONES_SALIENTES"
  | "REMISIONES_ENTRANTES"
  | "REFERENCIAS_INTERNAS"
  | "PENDIENTES"
  | "RED"
  | "CUADRO_TURNO"
  | "RECUPERACION_TIEMPO"
  | "OTRO";

export type AvisoAudiencia = "OPERATIVA" | "COORDINACION" | "COMPARTIDO";

/** Contextos consumidores de avisos/alertas (allowlist estricta). */
export type AvisoContexto =
  | "DASHBOARD_SALIENTES"
  | "DASHBOARD_ENTRANTES"
  | "ALERTAS_COORDINACION"
  | "MODULO_GLOBAL_AVISOS";

export type AvisoUnificado = {
  key: string;
  kind: "M" | "IA";
  severidad: Nivel;
  titulo: string;
  sub: string;
  detalle: string;
  sourceId: string;
  dominio: AvisoDominio;
  audiencia: AvisoAudiencia;
};


type CasoNorm = {
  id: string;
  moduloCode: ModuloCode;
  fechaBase: Date | null;
  campos: Record<string, string>;
};

// ---- Utilidades ----

const norm = (s: unknown) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase();

function horasDesde(fecha: Date | null): number {
  if (!fecha) return 0;
  return (Date.now() - fecha.getTime()) / 3_600_000;
}

function fmtHoras(h: number): string {
  const total = Math.max(0, Math.floor(h));
  const dias = Math.floor(total / 24);
  const horas = total % 24;
  if (dias > 0) return `${dias} día${dias > 1 ? "s" : ""} ${horas} h`;
  return `${total} h`;
}

function parseFecha(...vals: (string | null | undefined)[]): Date | null {
  for (const v of vals) {
    if (v) {
      const d = new Date(v);
      if (!isNaN(d.getTime())) return d;
    }
  }
  return null;
}

/** Resuelve el valor de un campo (con alias) sobre un caso normalizado. */
function campoValor(caso: CasoNorm, campoRaw: string | null | undefined): string {
  const campo = norm(campoRaw);
  const c = caso.campos;
  const aliases: Record<string, string[]> = {
    CODIGO_RADICACION: ["RADICADO"],
    RADICADO: ["CODIGO_RADICACION"],
    NUMERO_RADICADO: ["CODIGO_RADICACION", "RADICADO"],
    PACIENTE: ["PACIENTE_ASUNTO"],
    DOCUMENTO: ["NUMERO_DOCUMENTO", "IDENTIFICACION"],
    SERVICIO: ["ESPECIALIDAD", "TIPO_SOLICITUD"],
    ESPECIALIDAD: ["SERVICIO"],
    ASEGURADOR: ["EPS", "EAPB"],
    EPS: ["ASEGURADOR", "EAPB"],
    EAPB: ["ASEGURADOR", "EPS"],
  };
  if (c[campo] != null && c[campo] !== "") return c[campo];
  for (const a of aliases[campo] ?? []) {
    if (c[a] != null && c[a] !== "") return c[a];
  }
  return c[campo] ?? "";
}

export function reemplazarVariables(
  plantilla: string | null | undefined,
  caso: CasoNorm,
  horas: number,
): string {
  if (!plantilla) return "";
  const map: Record<string, string> = {
    "{PACIENTE}": campoValor(caso, "PACIENTE") || "Caso",
    "{DOCUMENTO}": campoValor(caso, "DOCUMENTO"),
    "{ESTADO}": campoValor(caso, "ESTADO"),
    "{PRIORIDAD}": campoValor(caso, "PRIORIDAD"),
    "{HORAS}": fmtHoras(horas),
    "{MODULO}": moduloLabel(caso.moduloCode),
    "{TIPO}": campoValor(caso, "TIPO_SOLICITUD") || campoValor(caso, "TIPO_PENDIENTE"),
    "{RADICADO}": campoValor(caso, "CODIGO_RADICACION"),
    "{SERVICIO}": campoValor(caso, "SERVICIO"),
    "{ASEGURADOR}": campoValor(caso, "ASEGURADOR"),
  };
  return plantilla.replace(/\{[A-Z_]+\}/g, (m) => map[m] ?? m);
}

const ESTADOS_CERRADOS = ["CERRAD", "CANCELAD", "ARCHIV", "ANULAD", "FINALIZAD"];
function esCerrado(estado: string): boolean {
  const e = norm(estado);
  return ESTADOS_CERRADOS.some((c) => e.includes(c));
}

// ---- Normalización de casos por módulo ----

type Row = Record<string, unknown>;
const s = (v: unknown) => (v == null ? "" : String(v));

export function normalizarCasos(
  remisiones: Row[],
  domiciliarios: Row[],
  referencias: Row[],
  pendientes: Row[],
): Record<ModuloCode, CasoNorm[]> {
  const remN: CasoNorm[] = remisiones.map((r) => ({
    id: s(r.id),
    moduloCode: "remisiones",
    fechaBase: parseFecha(s(r.fecha_radicado), s(r.fecha_inicio), s(r.created_at)),
    campos: {
      ESTADO: s(r.estado),
      PRIORIDAD: s(r.prioridad),
      CODIGO_RADICACION: s(r.codigo_radicacion),
      PACIENTE: s(r.paciente),
      DOCUMENTO: s(r.documento),
      SERVICIO: s(r.servicio),
      ESPECIALIDAD: s(r.especialidades_receptoras),
      ASEGURADOR: s(r.eapb) || s(r.asegurador),
      EAPB: s(r.eapb),
      TIPO_SOLICITUD: s(r.tipo_tramite),
      OBSERVACIONES: s(r.observaciones),
    },
  }));

  const domN: CasoNorm[] = domiciliarios.map((r) => ({
    id: s(r.id),
    moduloCode: "especiales",
    fechaBase: parseFecha(s(r.fecha_radicado), s(r.fecha_inicio), s(r.fecha), s(r.created_at)),
    campos: {
      ESTADO: s(r.estado),
      PRIORIDAD: s(r.prioridad),
      CODIGO_RADICACION: s(r.codigo_radicacion),
      PACIENTE: s(r.paciente),
      DOCUMENTO: s(r.documento),
      SERVICIO: s(r.servicio) || s(r.tipo_solicitud),
      ASEGURADOR: s(r.eapb),
      EAPB: s(r.eapb),
      TIPO_SOLICITUD: s(r.tipo_solicitud),
      OBSERVACIONES: s(r.observaciones),
    },
  }));

  const refN: CasoNorm[] = referencias.map((r) => ({
    id: s(r.id),
    moduloCode: "referencia_interna",
    fechaBase: parseFecha(s(r.fecha_inicio), s(r.fecha), s(r.created_at)),
    campos: {
      ESTADO: s(r.estado),
      PRIORIDAD: s(r.prioridad),
      PACIENTE: s(r.paciente),
      DOCUMENTO: s(r.documento),
      SERVICIO: s(r.servicio) || s(r.tipo_solicitud),
      TIPO_SOLICITUD: s(r.tipo_solicitud),
      OBSERVACIONES: s(r.observaciones),
    },
  }));

  const penN: CasoNorm[] = pendientes.map((r) => ({
    id: s(r.id),
    moduloCode: "pendientes",
    fechaBase: parseFecha(s(r.created_at), s(r.fecha), s(r.updated_at)),
    campos: {
      ESTADO: s(r.estado),
      PRIORIDAD: s(r.prioridad),
      PACIENTE: s(r.paciente_asunto),
      TIPO_PENDIENTE: s(r.tipo_pendiente),
      OBSERVACIONES: s(r.observacion_entrega),
    },
  }));

  return {
    remisiones: remN,
    especiales: domN,
    referencia_interna: refN,
    pendientes: penN,
  };
}

// ---- Motor de evaluación ----

export type AlertaIA = {
  reglaId: string;
  registroId: string;
  nivel: Nivel;
  moduloCode: ModuloCode;
  titulo: string;
  mensaje: string;
  accion: string;
};

const ORDEN_NIVEL: Record<string, number> = { CRITICO: 0, ALTO: 1, MEDIO: 2, INFO: 3 };

export function evaluarReglas(
  reglas: Regla[],
  casos: Record<ModuloCode, CasoNorm[]>,
  ultimoSeguimiento: Record<string, Date>,
): AlertaIA[] {
  const activas = reglas.filter((r) => !r.archivado && r.activo);
  const alertas: AlertaIA[] = [];

  for (const regla of activas) {
    const lista = casos[regla.modulo as ModuloCode] ?? [];
    for (const caso of lista) {
      if (esCerrado(campoValor(caso, "ESTADO"))) continue;
      const horas = horasDesde(caso.fechaBase);
      if (!cumple(regla, caso, horas, ultimoSeguimiento)) continue;

      const nivel = (norm(regla.nivel) as Nivel) || "INFO";
      alertas.push({
        reglaId: regla.id,
        registroId: caso.id,
        nivel: NIVELES.includes(nivel) ? nivel : "INFO",
        moduloCode: caso.moduloCode,
        titulo: campoValor(caso, "PACIENTE") || "Caso",
        mensaje: reemplazarVariables(regla.mensaje, caso, horas),
        accion: reemplazarVariables(regla.accion, caso, horas),
      });
    }
  }

  alertas.sort((a, b) => (ORDEN_NIVEL[a.nivel] ?? 9) - (ORDEN_NIVEL[b.nivel] ?? 9));
  return alertas.slice(0, 12);
}

function cumple(
  regla: Regla,
  caso: CasoNorm,
  horas: number,
  ultimoSeguimiento: Record<string, Date>,
): boolean {
  const umbral = regla.horas ?? 0;
  const valor = norm(regla.valor);
  switch (regla.tipo_condicion) {
    case "HORAS_ABIERTO":
      return horas >= umbral;
    case "ESTADO_TIEMPO": {
      const v = norm(campoValor(caso, regla.campo || "ESTADO"));
      return v.includes(valor) && valor !== "" && horas >= umbral;
    }
    case "ESTADO_IGUAL": {
      const v = norm(campoValor(caso, regla.campo || "ESTADO"));
      return v === valor && valor !== "";
    }
    case "PRIORIDAD_IGUAL":
      return norm(campoValor(caso, "PRIORIDAD")) === valor && valor !== "";
    case "SIN_RADICADO_TIEMPO": {
      const rad = campoValor(caso, "CODIGO_RADICACION").trim();
      return rad === "" && horas >= umbral;
    }
    case "SIN_SEGUIMIENTO_TIEMPO": {
      if (regla.campo && regla.valor) {
        const v = norm(campoValor(caso, regla.campo));
        if (v !== valor) return false;
      }
      const ult = ultimoSeguimiento[caso.id];
      const horasSin = ult ? horasDesde(ult) : horas;
      return horasSin >= umbral;
    }
    case "CAMPO_CONTIENE": {
      const v = norm(campoValor(caso, regla.campo));
      return valor !== "" && v.includes(valor);
    }
    default:
      return false;
  }
}

// ---- Avisos manuales: visibilidad + vencimiento ----

export function avisoVisible(a: Aviso): boolean {
  if (a.archivado) return false;
  const estado = norm(a.estado);
  if (estado === "INACTIVO" || estado === "CERRADO" || estado === "VENCIDO") return false;
  if (!a.mensaje?.trim()) return false;
  const now = Date.now();
  if (a.fecha_inicio && new Date(a.fecha_inicio).getTime() > now) return false;
  if (a.fecha_final && new Date(a.fecha_final).getTime() < now) return false;
  return true;
}

export function avisoVencido(a: Aviso): boolean {
  if (a.archivado) return false;
  if (!a.fecha_final) return false;
  return new Date(a.fecha_final).getTime() < Date.now();
}

// ---- Combinación manual + IA para tableros ----

function severidadDesdePrioridad(p: string | null): Nivel {
  const v = norm(p);
  if (v === "CRITICO") return "CRITICO";
  if (v === "ALTO") return "ALTO";
  if (v === "MEDIO") return "MEDIO";
  return "INFO";
}

// ---- Clasificación canónica (dominio + audiencia) ----
// Se decide SOLO con metadatos estables (módulo del aviso / módulo de la regla),
// nunca con el texto visible del mensaje.

const CLASIFICACION_POR_MODULO: Record<string, { dominio: AvisoDominio; audiencia: AvisoAudiencia }> = {
  REMISIONES: { dominio: "REMISIONES_SALIENTES", audiencia: "OPERATIVA" },
  "PHD/PAD/O2/ESPECIALES": { dominio: "REMISIONES_SALIENTES", audiencia: "OPERATIVA" },
  ESPECIALES: { dominio: "REMISIONES_SALIENTES", audiencia: "OPERATIVA" },
  "REFERENCIA INTERNA": { dominio: "REFERENCIAS_INTERNAS", audiencia: "OPERATIVA" },
  REFERENCIA_INTERNA: { dominio: "REFERENCIAS_INTERNAS", audiencia: "OPERATIVA" },
  "REFERENCIA INTERNA CEDIM IPS": { dominio: "REFERENCIAS_INTERNAS", audiencia: "OPERATIVA" },
  PENDIENTES: { dominio: "PENDIENTES", audiencia: "OPERATIVA" },
  "PENDIENTES GENERALES": { dominio: "PENDIENTES", audiencia: "OPERATIVA" },
  ENTRANTES: { dominio: "REMISIONES_ENTRANTES", audiencia: "OPERATIVA" },
  RED: { dominio: "RED", audiencia: "COMPARTIDO" },
  GENERAL: { dominio: "OTRO", audiencia: "COMPARTIDO" },
  TURNO: { dominio: "CUADRO_TURNO", audiencia: "COORDINACION" },
  "CUADRO DE TURNO": { dominio: "CUADRO_TURNO", audiencia: "COORDINACION" },
  CUADRO_TURNO: { dominio: "CUADRO_TURNO", audiencia: "COORDINACION" },
  RECUPERACION_TIEMPO: { dominio: "RECUPERACION_TIEMPO", audiencia: "COORDINACION" },
  AUSENTISMO: { dominio: "CUADRO_TURNO", audiencia: "COORDINACION" },
};

/** Clasificación canónica compartida a partir del módulo estable del aviso/regla. */
export function clasificarAviso(modulo: string | null | undefined): {
  dominio: AvisoDominio;
  audiencia: AvisoAudiencia;
} {
  return CLASIFICACION_POR_MODULO[norm(modulo)] ?? { dominio: "OTRO", audiencia: "COMPARTIDO" };
}

/** Única fuente de verdad de visibilidad por consumidor. */
export function visibleEnContexto(a: AvisoUnificado, contexto: AvisoContexto): boolean {
  switch (contexto) {
    case "DASHBOARD_SALIENTES":
      // Solo acciones operativas del turno; las alertas exclusivas de
      // coordinación (Cuadro de Turno, recuperación de tiempo) se excluyen.
      return (
        a.audiencia !== "COORDINACION" &&
        a.dominio !== "CUADRO_TURNO" &&
        a.dominio !== "RECUPERACION_TIEMPO" &&
        a.dominio !== "REMISIONES_ENTRANTES"
      );
    case "DASHBOARD_ENTRANTES":
      return (
        a.audiencia !== "COORDINACION" &&
        (a.dominio === "REMISIONES_ENTRANTES" || a.dominio === "OTRO" || a.dominio === "RED")
      );
    case "ALERTAS_COORDINACION":
    case "MODULO_GLOBAL_AVISOS":
      return true;
  }
}

/** Filtro canónico por contexto (contador y lista deben usar esta función). */
export function filtrarAvisosPorContexto(
  lista: AvisoUnificado[],
  contexto: AvisoContexto,
): AvisoUnificado[] {
  return lista.filter((a) => visibleEnContexto(a, contexto));
}

export function combinarAvisos(avisos: Aviso[], alertas: AlertaIA[]): AvisoUnificado[] {
  const manuales: AvisoUnificado[] = avisos.filter(avisoVisible).map((a) => ({
    key: `M-${a.id}`,
    kind: "M",
    severidad: severidadDesdePrioridad(a.prioridad),
    titulo: a.mensaje,
    sub: [a.modulo, a.prioridad].filter(Boolean).join(" · "),
    detalle: [
      a.fecha_inicio ? `Desde ${new Date(a.fecha_inicio).toLocaleDateString("es-CO")}` : "",
      a.fecha_final ? `Hasta ${new Date(a.fecha_final).toLocaleDateString("es-CO")}` : "",
    ]
      .filter(Boolean)
      .join(" · "),
    sourceId: a.id,
    ...clasificarAviso(a.modulo),
  }));

  const ia: AvisoUnificado[] = alertas.map((al) => ({
    key: `IA-${al.reglaId}-${al.registroId}`,
    kind: "IA",
    severidad: al.nivel,
    titulo: al.mensaje || al.titulo,
    sub: [moduloLabel(al.moduloCode), al.nivel].filter(Boolean).join(" · "),
    detalle: al.accion,
    sourceId: al.registroId,
    ...clasificarAviso(al.moduloCode),
  }));

  // Deduplicación por clave canónica (evita doble conteo en la misma sección).
  const vistos = new Set<string>();
  return [...manuales, ...ia]
    .filter((a) => (vistos.has(a.key) ? false : (vistos.add(a.key), true)))
    .sort((a, b) => (ORDEN_NIVEL[a.severidad] ?? 9) - (ORDEN_NIVEL[b.severidad] ?? 9));
}


// ---- Reglas base automáticas ----

export type ReglaBase = Omit<Regla, "id" | "activo" | "archivado">;

export const REGLAS_BASE: ReglaBase[] = [
  {
    nombre: "Remisión pendiente por aceptación mayor a 12 horas",
    modulo: "remisiones",
    tipo_condicion: "ESTADO_TIEMPO",
    campo: "ESTADO",
    valor: "PENDIENTE ACEPTACION",
    horas: 12,
    nivel: "ALTO",
    mensaje: "{PACIENTE} lleva {HORAS} pendiente por aceptación.",
    accion: "Revisar respuesta de red y documentar seguimiento.",
  },
  {
    nombre: "Remisión prioridad alta sin seguimiento reciente",
    modulo: "remisiones",
    tipo_condicion: "SIN_SEGUIMIENTO_TIEMPO",
    campo: "PRIORIDAD",
    valor: "ALTA",
    horas: 6,
    nivel: "ALTO",
    mensaje: "{PACIENTE} es prioridad alta y no tiene seguimiento reciente.",
    accion: "Actualizar seguimiento del caso prioridad alta.",
  },
  {
    nombre: "Remisión aceptada sin ambulancia coordinada",
    modulo: "remisiones",
    tipo_condicion: "ESTADO_IGUAL",
    campo: "ESTADO",
    valor: "ACEPTADO SIN PROGRAMACION DE AMBULANCIA",
    horas: null,
    nivel: "MEDIO",
    mensaje: "{PACIENTE} está aceptado pendiente coordinación de ambulancia.",
    accion: "Coordinar traslado y registrar seguimiento.",
  },
  {
    nombre: "PHD/PAD/O2/Especiales sin radicado mayor a 12 horas",
    modulo: "especiales",
    tipo_condicion: "SIN_RADICADO_TIEMPO",
    campo: "CODIGO_RADICACION",
    valor: null,
    horas: 12,
    nivel: "MEDIO",
    mensaje: "{PACIENTE} no tiene radicado después de {HORAS}.",
    accion: "Verificar radicación, autorización o programación.",
  },
  {
    nombre: "PHD/PAD/O2/Especiales abierto mayor a 24 horas",
    modulo: "especiales",
    tipo_condicion: "HORAS_ABIERTO",
    campo: null,
    valor: null,
    horas: 24,
    nivel: "ALTO",
    mensaje: "{PACIENTE} lleva {HORAS} activo en trámite domiciliario.",
    accion: "Revisar autorización y plan de cierre.",
  },
  {
    nombre: "Referencia interna abierta mayor a 8 horas",
    modulo: "referencia_interna",
    tipo_condicion: "HORAS_ABIERTO",
    campo: null,
    valor: null,
    horas: 8,
    nivel: "MEDIO",
    mensaje: "{PACIENTE} tiene referencia interna activa hace {HORAS}.",
    accion: "Validar programación, proveedor o traslado interno.",
  },
  {
    nombre: "Referencia interna prioridad alta",
    modulo: "referencia_interna",
    tipo_condicion: "PRIORIDAD_IGUAL",
    campo: "PRIORIDAD",
    valor: "ALTA",
    horas: null,
    nivel: "ALTO",
    mensaje: "{PACIENTE} está marcado como prioridad alta en referencia interna.",
    accion: "Priorizar gestión y documentar avance.",
  },
  {
    nombre: "Pendiente general prioridad alta",
    modulo: "pendientes",
    tipo_condicion: "PRIORIDAD_IGUAL",
    campo: "PRIORIDAD",
    valor: "ALTA",
    horas: null,
    nivel: "ALTO",
    mensaje: "{PACIENTE} tiene un pendiente general de prioridad alta.",
    accion: "Resolver o reasignar antes de entregar turno.",
  },
];

export const NIVEL_BADGE: Record<string, string> = {
  CRITICO: "bg-status-red/15 text-status-red",
  ALTO: "bg-status-amber/15 text-status-amber",
  MEDIO: "bg-status-sky/15 text-status-sky",
  INFO: "bg-muted text-muted-foreground",
};
