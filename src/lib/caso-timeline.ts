// ============================================================
// LÍNEA DE TIEMPO OPERATIVA CANÓNICA DEL CASO (client-safe, pura)
//
// Fuente ÚNICA de la trazabilidad funcional de un caso para los cuatro
// módulos (Entrantes, Salientes, Atención Domiciliaria, Referencias
// Internas). No crea tablas ni fuentes de verdad nuevas: normaliza los
// registros que ya existen.
//
//   1. Eventos derivados de la fila canónica del caso (creación, solicitud,
//      radicación, aceptación, coordinación de ambulancia, egreso, cierre).
//      Sólo se derivan cuando el dato demuestra inequívocamente el hito y
//      existe una fecha funcional real: NUNCA se inventan eventos.
//   2. Eventos registrados en `seguimientos` (relación canónica caso_id).
//   3. Eventos propios de Entrantes (cada fila de casos_entrantes es un
//      hito funcional: ACEP/NEG/CRUE/ING/AMP/CAN...).
//
// La auditoría técnica (audit_logs) NO alimenta esta línea de tiempo: es
// una pantalla independiente y contiene acciones sin significado operativo
// (copiar plantilla, generar vista previa, abrir pantalla...).
// ============================================================

export type ModuloTimeline =
  | "ENTRANTES"
  | "SALIENTES"
  | "ATENCION_DOMICILIARIA"
  | "REFERENCIAS_INTERNAS";

export type OrigenEvento = "CASO" | "SEGUIMIENTO" | "EVENTO";

export interface EventoCaso {
  /** Identidad determinística: sourceType|sourceId|eventType. */
  eventId: string;
  /** Identidad canónica del caso (PK real, nunca radicado ni documento). */
  caseId: string;
  module: ModuloTimeline;
  eventType: string;
  /** Fecha funcional real del hito en ISO. */
  functionalDateTime: string;
  entity: string;
  title: string;
  description: string;
  status: string;
  action: string;
  actorSnapshot: string;
  sourceType: OrigenEvento;
  sourceId: string;
  /** `true` cuando el evento se deriva de la fila del caso (lectura). */
  legacy: boolean;
  /** Prioridad funcional para desempatar eventos con la misma fecha. */
  priority: number;
}

/** Fila de seguimiento ya normalizada (misma forma que `SegMap`). */
export interface SeguimientoFuente {
  created_at: string;
  detalle: string;
  estado: string;
  tipo: string;
  usuario: string;
  contacto: string;
}

const txt = (x: unknown): string => (x == null ? "" : String(x).trim());

/** Valores que NO representan un dato real (no generan evento). */
const VACIOS = new Set(["", "-", "—", "N/A", "NA", "NO APLICA", "NO APLICA.", "NINGUNO", "NULL"]);

const real = (x: unknown): string => {
  const s = txt(x);
  return VACIOS.has(s.toUpperCase()) ? "" : s;
};

/** Normaliza una fecha a ISO; devuelve "" cuando no es una fecha utilizable. */
export function fechaIso(x: unknown): string {
  const s = txt(x);
  if (!s) return "";
  const d = new Date(s);
  const t = d.getTime();
  if (!Number.isFinite(t) || t <= 0) return "";
  return d.toISOString();
}

const SEPARADOS_MS = 60_000;

function nuevo(e: Omit<EventoCaso, "eventId">): EventoCaso {
  return { ...e, eventId: `${e.sourceType}|${e.sourceId}|${e.eventType}` };
}

// ---------------------------------------------------------------------------
// 1. Eventos derivados de la fila canónica del caso.
// ---------------------------------------------------------------------------

type Fila = Record<string, unknown>;

interface DerivadoSpec {
  eventType: string;
  title: string;
  fecha: unknown;
  /** Evidencia adicional obligatoria: si es "" el evento NO se emite. */
  evidencia?: string;
  description?: string;
  status?: string;
  action?: string;
  entity?: string;
  priority: number;
}

function emitir(
  caseId: string,
  module: ModuloTimeline,
  actor: string,
  specs: DerivadoSpec[],
): EventoCaso[] {
  const out: EventoCaso[] = [];
  for (const s of specs) {
    if (s.evidencia !== undefined && !s.evidencia) continue;
    const iso = fechaIso(s.fecha);
    if (!iso) continue;
    out.push(
      nuevo({
        caseId,
        module,
        eventType: s.eventType,
        functionalDateTime: iso,
        entity: s.entity ?? "",
        title: s.title,
        description: s.description ?? "",
        status: s.status ?? "",
        action: s.action ?? s.title,
        actorSnapshot: actor,
        sourceType: "CASO",
        sourceId: `${caseId}:${s.eventType}`,
        legacy: true,
        priority: s.priority,
      }),
    );
  }
  return out;
}

/**
 * Deriva los hitos funcionales contenidos en la propia fila del caso.
 * Cada hito exige evidencia real (fecha funcional y, cuando aplica, el dato
 * que lo demuestra). "NO APLICA" nunca genera un evento.
 */
export function eventosDerivadosCaso(
  module: ModuloTimeline,
  caso: Fila,
  opts?: { actor?: string; entidad?: string },
): EventoCaso[] {
  const caseId = txt(caso.id);
  if (!caseId) return [];
  const actor = opts?.actor ?? "";
  const entidad = opts?.entidad ?? real(caso.eapb) ?? "";

  const creado = fechaIso(caso.created_at);
  const solicitud = fechaIso(caso.fecha_inicio);
  // La solicitud funcional sólo es un hito distinto de la creación técnica
  // cuando ocurrió en un momento diferente (regla 32).
  const solicitudDistinta =
    solicitud &&
    (!creado ||
      Math.abs(new Date(solicitud).getTime() - new Date(creado).getTime()) >= SEPARADOS_MS)
      ? solicitud
      : "";

  const base: DerivadoSpec[] = [
    {
      eventType: "SOLICITUD",
      title: "SOLICITUD REGISTRADA",
      fecha: solicitudDistinta,
      entity: entidad,
      status: "SOLICITUD",
      priority: 0,
    },
    {
      eventType: "CREACION",
      title: "CREACIÓN DEL CASO",
      fecha: creado,
      entity: entidad,
      status: "CASO REGISTRADO EN SISTEMA",
      description: real(caso.tipo_tramite) || real(caso.tipo_solicitud) || "",
      priority: 1,
    },
  ];

  const radicado = real(caso.codigo_radicacion);
  const fechaRadicado = fechaIso(caso.fecha_radicado);

  if (module === "SALIENTES") {
    return emitir(caseId, module, actor, [
      ...base,
      {
        eventType: "RADICACION",
        title: "RADICACIÓN",
        fecha: fechaRadicado || creado,
        evidencia: radicado,
        description: `Número de radicado: ${radicado}`,
        status: "RADICADO",
        entity: entidad,
        priority: 2,
      },
    ]);
  }

  if (module === "ATENCION_DOMICILIARIA") {
    return emitir(caseId, module, actor, [
      ...base,
      {
        eventType: "RADICACION",
        title: "RADICACIÓN",
        fecha: fechaRadicado || creado,
        evidencia: radicado,
        description: `Número de radicado: ${radicado}`,
        status: "RADICADO",
        entity: entidad,
        priority: 2,
      },
      {
        eventType: "ACEPTACION",
        title: "ACEPTACIÓN",
        fecha: caso.fecha_aceptacion,
        status: "ACEPTADA",
        entity: entidad,
        priority: 3,
      },
      {
        eventType: "COORDINACION_AMBULANCIA",
        title: "COORDINACIÓN DE AMBULANCIA",
        fecha: caso.fecha_coordinacion_ambulancia,
        status: "AMBULANCIA COORDINADA",
        description: real(caso.proveedor_ambulancia),
        entity: real(caso.proveedor_ambulancia) || entidad,
        priority: 4,
      },
      {
        eventType: "EGRESO",
        title: "EGRESO",
        fecha: caso.fecha_egreso,
        status: "EGRESO",
        entity: entidad,
        priority: 5,
      },
      {
        eventType: "CIERRE",
        title: "CIERRE",
        fecha: caso.fecha_cierre,
        status: "CERRADO",
        description: real(caso.motivo_cierre),
        entity: entidad,
        priority: 6,
      },
    ]);
  }

  if (module === "REFERENCIAS_INTERNAS") {
    return emitir(caseId, module, actor, [
      ...base,
      {
        // Referencias Internas no maneja número de radicado: la evidencia del
        // hito es únicamente la fecha real de radicación.
        eventType: "RADICACION",
        title: "RADICACIÓN",
        fecha: fechaRadicado,
        status: "RADICADO",
        entity: entidad,
        priority: 2,
      },
    ]);
  }

  // ENTRANTES: la creación y los hitos de decisión viven en las propias filas
  // de casos_entrantes; aquí sólo se deriva la creación del caso base.
  return emitir(
    caseId,
    module,
    actor,
    base.filter((b) => b.eventType === "CREACION"),
  );
}

// ---------------------------------------------------------------------------
// 2. Eventos registrados en `seguimientos`.
// ---------------------------------------------------------------------------

export function eventosDesdeSeguimientos(
  caseId: string,
  module: ModuloTimeline,
  seguimientos: SeguimientoFuente[],
  entidadDefecto = "",
): EventoCaso[] {
  const out: EventoCaso[] = [];
  seguimientos.forEach((s, i) => {
    const iso = fechaIso(s.created_at);
    if (!iso) return;
    const tipo = txt(s.tipo) || "SEGUIMIENTO";
    out.push(
      nuevo({
        caseId,
        module,
        eventType: tipo.toUpperCase(),
        functionalDateTime: iso,
        entity: txt(s.contacto) || entidadDefecto,
        title: tipo,
        description: txt(s.detalle),
        status: txt(s.estado),
        action: tipo,
        actorSnapshot: txt(s.usuario),
        sourceType: "SEGUIMIENTO",
        sourceId: `${caseId}:${iso}:${i}`,
        legacy: false,
        priority: 20,
      }),
    );
  });
  return out;
}

// ---------------------------------------------------------------------------
// 3. Eventos funcionales explícitos (Entrantes y equivalentes).
// ---------------------------------------------------------------------------

export function eventoFuncional(e: {
  caseId: string;
  module: ModuloTimeline;
  eventType: string;
  fecha: unknown;
  title: string;
  description?: string;
  status?: string;
  action?: string;
  entity?: string;
  actor?: string;
  sourceId: string;
}): EventoCaso | null {
  const iso = fechaIso(e.fecha);
  if (!iso) return null;
  return nuevo({
    caseId: e.caseId,
    module: e.module,
    eventType: e.eventType,
    functionalDateTime: iso,
    entity: e.entity ?? "",
    title: e.title,
    description: e.description ?? "",
    status: e.status ?? "",
    action: e.action ?? e.title,
    actorSnapshot: e.actor ?? "",
    sourceType: "EVENTO",
    sourceId: e.sourceId,
    legacy: false,
    priority: 10,
  });
}

// ---------------------------------------------------------------------------
// Fusión canónica: deduplicación determinística + orden cronológico.
// ---------------------------------------------------------------------------

/**
 * Une todas las fuentes de un caso. Deduplica por identidad determinística
 * (sourceType|sourceId|eventType) y, cuando el MISMO hito existe en una
 * fuente funcional y como evento derivado del caso, conserva la fuente de
 * mayor prioridad (funcional > derivada de lectura).
 */
export function fusionarTimeline(...grupos: (EventoCaso[] | null | undefined)[]): EventoCaso[] {
  const porId = new Map<string, EventoCaso>();
  const porHito = new Map<string, EventoCaso>();

  for (const g of grupos) {
    for (const e of g ?? []) {
      if (porId.has(e.eventId)) continue;
      porId.set(e.eventId, e);
      // Mismo caso + mismo tipo + mismo minuto = mismo hito real.
      const minuto = e.functionalDateTime.slice(0, 16);
      const clave = `${e.caseId}|${e.eventType}|${minuto}`;
      const previo = porHito.get(clave);
      if (!previo) {
        porHito.set(clave, e);
        continue;
      }
      // Prioridad de fuentes: funcional (EVENTO/SEGUIMIENTO) sobre derivada.
      if (previo.sourceType === "CASO" && e.sourceType !== "CASO") porHito.set(clave, e);
    }
  }

  return Array.from(porHito.values()).sort((a, b) => {
    const ta = new Date(a.functionalDateTime).getTime();
    const tb = new Date(b.functionalDateTime).getTime();
    if (ta !== tb) return ta - tb;
    if (a.priority !== b.priority) return a.priority - b.priority;
    return a.sourceId.localeCompare(b.sourceId);
  });
}

/** Atajo: construye la línea de tiempo completa de un caso no-Entrante. */
export function construirTimelineCaso(input: {
  module: ModuloTimeline;
  caso: Fila;
  seguimientos?: SeguimientoFuente[];
  eventos?: (EventoCaso | null)[];
  actor?: string;
  entidad?: string;
}): EventoCaso[] {
  const caseId = txt(input.caso.id);
  return fusionarTimeline(
    eventosDerivadosCaso(input.module, input.caso, {
      actor: input.actor ?? "",
      entidad: input.entidad ?? "",
    }),
    (input.eventos ?? []).filter((e): e is EventoCaso => Boolean(e)),
    eventosDesdeSeguimientos(caseId, input.module, input.seguimientos ?? [], input.entidad ?? ""),
  );
}
