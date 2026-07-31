// ---------------------------------------------------------------------------
// FASE 5E · Bloque C — Fuente ÚNICA del CANAL DE GESTIÓN.
//
// Cubre los cuatro módulos (Remisiones, Atención Domiciliaria, Referencias
// Internas y Pendientes):
//  - catálogo canónico de canales (códigos técnicos + labels visibles);
//  - allowlists estrictas de contactos, cargos, comunicación, acercamiento y
//    servicio;
//  - modelo estructurado del formulario (canalesGestion: string[]);
//  - validación compartida cliente/servidor;
//  - generador ÚNICO del bloque de Plantilla Índigo;
//  - adaptador de lectura para registros históricos (NO reescribe nada).
//
// Compatibilidad: el valor persistido históricamente es la etiqueta visible en
// mayúsculas (p. ej. "TELEFÓNICO", "FÍSICO / PRESENCIAL"). Se conserva ese
// formato en `canal_gestion`; la estructura nueva vive en el JSONB `detalles`
// bajo `canales_gestion` y `detalle_canal`.
// ---------------------------------------------------------------------------

export const CANAL_CODES = {
  TELEFONO: "CONTACTO_TELEFONICO",
  PRESENCIAL: "FISICO_PRESENCIAL", // código histórico conservado
  CORREO: "CORREO_ELECTRONICO",
  PLATAFORMA: "PLATAFORMA_WEB",
  WHATSAPP: "MENSAJERIA_INSTANTANEA_WHATSAPP",
  OTRO: "OTRO",
} as const;

export type CanalCodigo = (typeof CANAL_CODES)[keyof typeof CANAL_CODES];

/** Orden canónico exacto del selector. */
export const CANALES_GESTION_CATALOGO = [
  { codigo: CANAL_CODES.TELEFONO, label: "CONTACTO TELEFÓNICO" },
  { codigo: CANAL_CODES.PRESENCIAL, label: "PRESENCIAL" },
  { codigo: CANAL_CODES.CORREO, label: "CORREO ELECTRÓNICO" },
  { codigo: CANAL_CODES.PLATAFORMA, label: "PLATAFORMA WEB" },
  { codigo: CANAL_CODES.WHATSAPP, label: "MENSAJERÍA INSTANTÁNEA (WHATSAPP)" },
  { codigo: CANAL_CODES.OTRO, label: "OTRO" },
] as const;

export const CANALES_GESTION_LABELS: string[] = CANALES_GESTION_CATALOGO.map((c) => c.label);
export const CANALES_GESTION_CODIGOS: string[] = CANALES_GESTION_CATALOGO.map((c) => c.codigo);

export function labelCanal(codigo: string): string {
  return CANALES_GESTION_CATALOGO.find((c) => c.codigo === codigo)?.label ?? codigo;
}

export const CANAL_OTRO_MIN = 3;
export const CANAL_OTRO_MAX = 200;

// --- Allowlists de subformularios -------------------------------------------

export const CONTACTO_TIPOS = ["FAMILIAR_PACIENTE", "EAPB", "CRUE", "IPS"] as const;
export type ContactoTipo = (typeof CONTACTO_TIPOS)[number];

export const CONTACTO_TIPO_LABEL: Record<ContactoTipo, string> = {
  FAMILIAR_PACIENTE: "FAMILIAR Y/O PACIENTE",
  EAPB: "EAPB",
  CRUE: "CRUE",
  IPS: "IPS",
};

export const MAX_CONTACTOS = 3;
export const MSG_MAX_CONTACTOS = "Puede seleccionar máximo 3 tipos de contacto.";

export const COMUNICACION_CON = [
  "PACIENTE",
  "FAMILIAR",
  "ACUDIENTE",
  "RESPONSABLE LEGAL",
  "OTRO",
] as const;

export const CARGOS_REFERENCIA = [
  "MÉDICO DE REFERENCIA",
  "JEFE DE ENFERMERÍA DE REFERENCIA",
  "AUXILIAR DE ENFERMERÍA DE REFERENCIA",
  "COORDINADOR O LÍDER DE REFERENCIA",
  "OTRO",
] as const;

export const CARGOS_CRUE = [
  "MÉDICO",
  "JEFE DE ENFERMERÍA",
  "AUXILIAR DE ENFERMERÍA",
  "COORDINADOR O LÍDER DE CRUE",
  "OTRO",
] as const;

export function cargosDe(tipo: ContactoTipo): readonly string[] {
  return tipo === "CRUE" ? CARGOS_CRUE : CARGOS_REFERENCIA;
}

export const ACERCAMIENTO_CON = ["FAMILIAR", "PACIENTE", "SERVICIO", "OTRO"] as const;

export const SERVICIOS_PRESENCIAL = [
  "URGENCIAS",
  "HOSPITALIZACIÓN",
  "QUIRÓFANO",
  "UCI",
  "FACTURACIÓN / ADMISIONES",
  "OTRO",
] as const;

// --- Modelo estructurado del formulario -------------------------------------

export type ContactoDetalle = {
  /** FAMILIAR_PACIENTE */
  comunicacion?: string;
  comunicacionOtro?: string;
  parentesco?: string;
  /** IPS */
  nombreIps?: string;
  /** Común */
  nombre?: string;
  cargo?: string;
  cargoOtro?: string;
  telefono?: string;
};

export type PresencialDetalle = {
  acercamiento: string;
  nombre: string;
  parentesco: string;
  conQuien: string;
  servicio: string;
  servicioOtro: string;
  funcionario: string;
  cargoFuncionario: string;
};

export type CanalGestionValue = {
  canales: string[];
  otroCual: string;
  contactos: ContactoTipo[];
  detalleContactos: Partial<Record<ContactoTipo, ContactoDetalle>>;
  presencial: PresencialDetalle;
};

export const PRESENCIAL_INICIAL: PresencialDetalle = {
  acercamiento: "",
  nombre: "",
  parentesco: "",
  conQuien: "",
  servicio: "",
  servicioOtro: "",
  funcionario: "",
  cargoFuncionario: "",
};

export const CANAL_GESTION_INICIAL: CanalGestionValue = {
  canales: [],
  otroCual: "",
  contactos: [],
  detalleContactos: {},
  presencial: PRESENCIAL_INICIAL,
};

const TXT_MAX = 200;

function limpio(v: string | undefined | null): string {
  return (v ?? "").replace(/<[^>]*>/g, "").trim();
}

// --- Validación compartida ---------------------------------------------------

export function erroresCanalGestion(
  v: CanalGestionValue,
  opts: { dualPermitido?: boolean } = {},
): string[] {
  const e: string[] = [];
  const canales = v.canales.filter((c) => CANALES_GESTION_CODIGOS.includes(c));
  if (canales.length === 0) {
    e.push("Seleccione un canal de gestión.");
    return e;
  }
  if (new Set(canales).size !== canales.length) e.push("Canal de gestión duplicado.");
  if (canales.length > 2) e.push("Solo se permite un canal de gestión.");
  if (canales.length === 2) {
    const dual =
      canales.includes(CANAL_CODES.CORREO) && canales.includes(CANAL_CODES.PLATAFORMA);
    if (!dual || !opts.dualPermitido)
      e.push(
        "La combinación de canales no está autorizada. Deje una sola opción seleccionada.",
      );
  }

  if (canales.includes(CANAL_CODES.OTRO)) {
    const t = limpio(v.otroCual);
    if (t.length < CANAL_OTRO_MIN) e.push("Indique ¿CUÁL ES EL CANAL DE GESTIÓN?");
    else if (t.length > CANAL_OTRO_MAX) e.push("El canal de gestión indicado es demasiado largo.");
  }

  if (canales.includes(CANAL_CODES.TELEFONO)) {
    const tipos = v.contactos.filter((t) => CONTACTO_TIPOS.includes(t));
    if (tipos.length === 0) e.push("Seleccione con quién se realizó el contacto.");
    if (new Set(tipos).size !== tipos.length) e.push("Hay tipos de contacto duplicados.");
    if (tipos.length > MAX_CONTACTOS) e.push(MSG_MAX_CONTACTOS);
    for (const tipo of tipos) {
      const d = v.detalleContactos[tipo] ?? {};
      const et = CONTACTO_TIPO_LABEL[tipo];
      if (tipo === "FAMILIAR_PACIENTE") {
        const com = limpio(d.comunicacion);
        if (!com || !(COMUNICACION_CON as readonly string[]).includes(com))
          e.push(`${et}: seleccione COMUNICACIÓN CON.`);
        if (com === "OTRO" && !limpio(d.comunicacionOtro)) e.push(`${et}: indique ¿CUÁL?`);
        if (!limpio(d.nombre)) e.push(`${et}: indique NOMBRE Y APELLIDO.`);
        if (com && com !== "PACIENTE" && !limpio(d.parentesco))
          e.push(`${et}: indique PARENTESCO.`);
      } else {
        if (tipo === "IPS" && !limpio(d.nombreIps)) e.push("IPS: indique NOMBRE DE IPS.");
        if (!limpio(d.nombre)) e.push(`${et}: indique NOMBRE Y APELLIDO.`);
        const cargo = limpio(d.cargo);
        if (!cargo || !cargosDe(tipo).includes(cargo)) e.push(`${et}: seleccione CARGO.`);
        if (cargo === "OTRO" && !limpio(d.cargoOtro)) e.push(`${et}: indique ¿CUÁL? del cargo.`);
        if (!limpio(d.telefono)) e.push(`${et}: indique TELÉFONO.`);
      }
    }
  }

  if (canales.includes(CANAL_CODES.PRESENCIAL)) {
    const p = v.presencial;
    const ac = limpio(p.acercamiento);
    if (!ac || !(ACERCAMIENTO_CON as readonly string[]).includes(ac))
      e.push("PRESENCIAL: seleccione ACERCAMIENTO CON.");
    if (ac === "FAMILIAR") {
      if (!limpio(p.nombre)) e.push("PRESENCIAL: indique NOMBRE Y APELLIDO.");
      if (!limpio(p.parentesco)) e.push("PRESENCIAL: indique PARENTESCO.");
    }
    if (ac === "SERVICIO") {
      const s = limpio(p.servicio);
      if (!s || !(SERVICIOS_PRESENCIAL as readonly string[]).includes(s))
        e.push("PRESENCIAL: seleccione el SERVICIO.");
      if (s === "OTRO" && !limpio(p.servicioOtro)) e.push("PRESENCIAL: indique ¿CUÁL? del servicio.");
      if (!limpio(p.funcionario)) e.push("PRESENCIAL: indique el NOMBRE DEL FUNCIONARIO.");
      if (!limpio(p.cargoFuncionario)) e.push("PRESENCIAL: indique el CARGO DEL FUNCIONARIO.");
    }
    if (ac === "OTRO") {
      if (!limpio(p.conQuien)) e.push("PRESENCIAL: indique ¿CON QUIÉN SE REALIZÓ EL ACERCAMIENTO?");
      if (!limpio(p.nombre)) e.push("PRESENCIAL: indique NOMBRE Y APELLIDO.");
    }
  }

  return e;
}

export function canalGestionValido(
  v: CanalGestionValue,
  opts: { dualPermitido?: boolean } = {},
): boolean {
  return erroresCanalGestion(v, opts).length === 0;
}

// --- Persistencia ------------------------------------------------------------

/** Texto compatible con la columna/campo `canal_gestion` (labels visibles). */
export function canalGestionResumen(v: CanalGestionValue): string {
  const labels = v.canales.map((c) =>
    c === CANAL_CODES.OTRO ? limpio(v.otroCual).toUpperCase() || "OTRO" : labelCanal(c),
  );
  return labels.filter(Boolean).join(" Y ").slice(0, 200);
}

function contactoLimpio(tipo: ContactoTipo, d: ContactoDetalle) {
  const base: Record<string, unknown> = { tipo };
  const put = (k: string, val?: string) => {
    const t = limpio(val).slice(0, TXT_MAX);
    if (t) base[k] = t.toUpperCase();
  };
  if (tipo === "FAMILIAR_PACIENTE") {
    put("comunicacion", d.comunicacion);
    if (limpio(d.comunicacion) === "OTRO") put("comunicacion_otro", d.comunicacionOtro);
    put("nombre_apellido", d.nombre);
    if (limpio(d.comunicacion) !== "PACIENTE") put("parentesco", d.parentesco);
  } else {
    if (tipo === "IPS") put("nombre_ips", d.nombreIps);
    put("nombre_apellido", d.nombre);
    put("cargo", d.cargo);
    if (limpio(d.cargo) === "OTRO") put("cargo_otro", d.cargoOtro);
    put("telefono", d.telefono);
  }
  return base;
}

/**
 * Estructura canónica que se guarda dentro del JSONB `detalles`.
 * Solo incluye los datos del/los canal(es) vigente(s): sin datos huérfanos.
 */
export function canalGestionPersist(v: CanalGestionValue) {
  const canales = v.canales.filter((c) => CANALES_GESTION_CODIGOS.includes(c));
  const detalle: Record<string, unknown> = {};

  if (canales.includes(CANAL_CODES.TELEFONO)) {
    const orden = CONTACTO_TIPOS.filter((t) => v.contactos.includes(t));
    detalle.contacto_telefonico = {
      contactos: orden.map((t) => contactoLimpio(t, v.detalleContactos[t] ?? {})),
    };
  }
  if (canales.includes(CANAL_CODES.PRESENCIAL)) {
    const p = v.presencial;
    const ac = limpio(p.acercamiento).toUpperCase();
    const bloque: Record<string, unknown> = { acercamiento_con: ac };
    const put = (k: string, val?: string) => {
      const t = limpio(val).slice(0, TXT_MAX);
      if (t) bloque[k] = t.toUpperCase();
    };
    if (ac === "FAMILIAR") {
      put("nombre_apellido", p.nombre);
      put("parentesco", p.parentesco);
    }
    if (ac === "SERVICIO") {
      put("servicio", p.servicio);
      if (limpio(p.servicio) === "OTRO") put("servicio_otro", p.servicioOtro);
      put("funcionario", p.funcionario);
      put("cargo_funcionario", p.cargoFuncionario);
    }
    if (ac === "OTRO") {
      put("con_quien", p.conQuien);
      put("nombre_apellido", p.nombre);
    }
    detalle.presencial = bloque;
  }
  if (canales.includes(CANAL_CODES.OTRO)) {
    detalle.otro = { especificacion: limpio(v.otroCual).slice(0, CANAL_OTRO_MAX).toUpperCase() };
  }

  return {
    canal_gestion: canalGestionResumen(v) || null,
    canales_gestion: canales,
    detalle_canal: detalle,
  };
}

// --- Adaptador de lectura (históricos) ---------------------------------------

export type CanalGestionLectura = {
  /** Etiquetas visibles (histórico o nuevo). */
  labels: string[];
  detalle: Record<string, unknown>;
};

/**
 * Lee registros antiguos (string suelto) y nuevos (arreglo estructurado).
 * NO modifica ni reescribe históricos.
 */
export function leerCanalGestion(detalles: unknown, canalLegacy?: unknown): CanalGestionLectura {
  const d = (detalles && typeof detalles === "object" ? detalles : {}) as Record<string, unknown>;
  const codigos = Array.isArray(d.canales_gestion)
    ? (d.canales_gestion as unknown[]).map(String).filter(Boolean)
    : [];
  if (codigos.length) {
    const otroTxt = ((d.detalle_canal as Record<string, unknown> | undefined)?.otro as
      | { especificacion?: string }
      | undefined)?.especificacion;
    return {
      labels: codigos.map((c) =>
        c === CANAL_CODES.OTRO ? String(otroTxt || "OTRO") : labelCanal(c),
      ),
      detalle: (d.detalle_canal as Record<string, unknown>) ?? {},
    };
  }
  const legacy = String(
    (typeof d.canal_gestion === "string" ? d.canal_gestion : "") || (canalLegacy ?? "") || "",
  ).trim();
  if (!legacy) return { labels: [], detalle: {} };
  // "FÍSICO / PRESENCIAL" histórico → se muestra tal cual quedó registrado.
  return { labels: [legacy], detalle: {} };
}

// --- Plantilla Índigo (generador ÚNICO) --------------------------------------

const LABEL_COMUNICACION = "Comunicación con";

function lineasContacto(c: Record<string, unknown>): string[] {
  const g = (k: string) => {
    const val = c[k];
    return typeof val === "string" && val.trim() ? val.trim() : "";
  };
  const tipo = String(c.tipo ?? "") as ContactoTipo;
  const out: string[] = [`${CONTACTO_TIPO_LABEL[tipo] ?? tipo}:`];
  if (tipo === "FAMILIAR_PACIENTE") {
    const com = g("comunicacion") === "OTRO" ? g("comunicacion_otro") : g("comunicacion");
    if (com) out.push(`${LABEL_COMUNICACION}: ${com}.`);
    if (g("nombre_apellido")) out.push(`Nombre y apellido: ${g("nombre_apellido")}.`);
    if (g("parentesco")) out.push(`Parentesco: ${g("parentesco")}.`);
  } else {
    if (g("nombre_ips")) out.push(`Nombre de IPS: ${g("nombre_ips")}.`);
    if (g("nombre_apellido")) out.push(`Nombre y apellido: ${g("nombre_apellido")}.`);
    const cargo = g("cargo") === "OTRO" ? g("cargo_otro") : g("cargo");
    if (cargo) out.push(`Cargo: ${cargo}.`);
    if (g("telefono")) out.push(`Teléfono: ${g("telefono")}.`);
  }
  return out.length > 1 ? out : [];
}

function unirEnumeracion(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} Y ${items[items.length - 1]}`;
}

/**
 * Bloque de texto ÚNICO consumido por los cuatro módulos.
 * Se alimenta de la estructura persistida (o del valor del formulario vía
 * canalGestionPersist) para evitar dos fuentes de verdad.
 */
export function plantillaCanalGestion(
  persistido: { canal_gestion?: string | null; canales_gestion?: string[]; detalle_canal?: Record<string, unknown> },
): string {
  const codigos = persistido.canales_gestion ?? [];
  if (!codigos.length) return "";
  const det = persistido.detalle_canal ?? {};
  const labels = codigos.map((c) =>
    c === CANAL_CODES.OTRO
      ? String((det.otro as { especificacion?: string } | undefined)?.especificacion || "OTRO")
      : labelCanal(c),
  );
  const out: string[] = [
    codigos.length > 1
      ? `CANALES DE GESTIÓN: ${unirEnumeracion(labels)}.`
      : `CANAL DE GESTIÓN: ${labels[0]}.`,
  ];

  const tel = det.contacto_telefonico as { contactos?: Record<string, unknown>[] } | undefined;
  if (tel?.contactos?.length) {
    const orden = CONTACTO_TIPOS.map((t) => tel.contactos!.find((c) => c.tipo === t)).filter(
      Boolean,
    ) as Record<string, unknown>[];
    out.push(
      `CONTACTO REALIZADO CON: ${unirEnumeracion(
        orden.map((c) => CONTACTO_TIPO_LABEL[String(c.tipo) as ContactoTipo] ?? String(c.tipo)),
      )}.`,
    );
    for (const c of orden) {
      const l = lineasContacto(c);
      if (l.length) out.push("", ...l);
    }
  }

  const pres = det.presencial as Record<string, unknown> | undefined;
  if (pres) {
    const g = (k: string) => (typeof pres[k] === "string" ? String(pres[k]).trim() : "");
    out.push(`ACERCAMIENTO CON: ${g("acercamiento_con")}.`);
    if (g("nombre_apellido")) out.push(`Nombre y apellido: ${g("nombre_apellido")}.`);
    if (g("parentesco")) out.push(`Parentesco: ${g("parentesco")}.`);
    if (g("con_quien")) out.push(`Acercamiento realizado con: ${g("con_quien")}.`);
    const serv = g("servicio") === "OTRO" ? g("servicio_otro") : g("servicio");
    if (serv) out.push(`Servicio: ${serv}.`);
    if (g("funcionario")) out.push(`Nombre del funcionario: ${g("funcionario")}.`);
    if (g("cargo_funcionario")) out.push(`Cargo del funcionario: ${g("cargo_funcionario")}.`);
  }

  return out.join("\n");
}

// --- Compatibilidad server-side ---------------------------------------------

const LABELS_HISTORICOS = [
  "TELEFÓNICO",
  "FÍSICO / PRESENCIAL",
  "CONTACTO TELEFÓNICO",
  "PRESENCIAL",
  "CORREO ELECTRÓNICO",
  "PLATAFORMA WEB",
  "MENSAJERÍA INSTANTÁNEA (WHATSAPP)",
  "CORREO ELECTRÓNICO Y PLATAFORMA WEB",
  "OTRO",
];

/**
 * Valida un canal ya resuelto en texto (etiqueta canónica, histórica, dual o
 * especificación libre de OTRO).
 */
export function esCanalValido(valor: string | null | undefined): boolean {
  const v = (valor ?? "").trim().toUpperCase();
  if (!v) return false;
  if (LABELS_HISTORICOS.includes(v) || CANALES_GESTION_LABELS.includes(v)) return true;
  return v.length >= CANAL_OTRO_MIN && v.length <= CANAL_OTRO_MAX;
}

// --- FASE 5E · Bloque C.1 — Autorización de doble canal ----------------------
// Regla ÚNICA (fail-closed) compartida por cliente y servidor: la selección
// simultánea CORREO ELECTRÓNICO + PLATAFORMA WEB solo se habilita cuando el
// tipo de seguimiento real es EVOLUCIÓN DIARIA y el registro ACTIVO del
// catálogo EAPB del caso declara ambas capacidades.
export function dualCanalPermitido(args: {
  esEvolucionDiaria: boolean;
  catalogoActivo: boolean;
  evolucionPorCorreo: boolean;
  evolucionPorPlataforma: boolean;
}): boolean {
  return (
    args.esEvolucionDiaria === true &&
    args.catalogoActivo === true &&
    args.evolucionPorCorreo === true &&
    args.evolucionPorPlataforma === true
  );
}

/** Valida la lista de códigos de canal enviada al servidor (allowlist estricta). */
export function erroresCanalesCodigos(
  canales: string[] | undefined | null,
  dualPermitido: boolean,
): string | null {
  const lista = (canales ?? []).map((c) => (c ?? "").trim().toUpperCase());
  if (lista.length === 0) return null; // compatibilidad: solo se envió el resumen
  if (lista.some((c) => !CANALES_GESTION_CODIGOS.includes(c)))
    return "Canal de gestión no válido.";
  if (new Set(lista).size !== lista.length) return "Canal de gestión duplicado.";
  if (lista.length > 2) return "Solo se permite un canal de gestión.";
  if (lista.length === 2) {
    const dual =
      lista.includes(CANAL_CODES.CORREO) && lista.includes(CANAL_CODES.PLATAFORMA);
    if (!dual || !dualPermitido)
      return "La combinación de canales no está autorizada.";
  }
  return null;
}
