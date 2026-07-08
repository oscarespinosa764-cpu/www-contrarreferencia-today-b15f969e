// Generador de plantillas de trazabilidad ÍNDIGO (texto plano).
// Estas plantillas se copian/pegan en el sistema ÍNDIGO: SIEMPRE texto plano,
// sin HTML, sin formato tipo oficio, sin negrillas ni colores.

export type AlcanceRed = "LOCAL" | "LOCAL_NACIONAL";

export type IndigoInicioInput = {
  /** Tipo de trámite seleccionado (valor del catálogo). */
  tipoTramite: string;
  /** EAPB tiene plataforma (desde catálogo). */
  tienePlataforma: boolean;
  /** Plataforma funcionando (solo aplica si tiene plataforma). */
  plataformaFuncionando: boolean | null;
  /** EAPB genera código de radicación (desde catálogo). */
  generaCodigo: boolean;
  /** Alcance de gestión / red comentada. */
  alcance: AlcanceRed;
  /** IPS de red local seleccionadas. */
  ipsRedLocal: string[];
  /** Departamentos de red nacional seleccionados. */
  departamentos: string[];
};

/** Une una lista en texto legible: "A, B Y C". */
function joinList(items: string[], placeholder: string): string {
  const limpio = items.map((s) => (s || "").trim()).filter(Boolean);
  if (limpio.length === 0) return placeholder;
  if (limpio.length === 1) return limpio[0];
  return `${limpio.slice(0, -1).join(", ")} Y ${limpio[limpio.length - 1]}`;
}

/** Detecta si el tipo de trámite corresponde a SOAT. */
export function esTramiteSoat(tipoTramite: string): boolean {
  return /soat/i.test(tipoTramite || "");
}

/** Detecta si el tipo de trámite es "administrativo cancelable". */
export function esTramiteAdministrativo(tipoTramite: string): boolean {
  return /administrativo\s+cancelable/i.test(tipoTramite || "");
}

/** Valor inicial del código de radicación al crear el caso. */
export function codigoInicial(generaCodigo: boolean): string {
  return generaCodigo ? "PENDIENTE DE RADICACIÓN" : "NO APLICA";
}

/**
 * Genera la plantilla de INICIO DE TRÁMITE según las reglas del módulo.
 * Devuelve texto plano en mayúsculas.
 */
export function generarPlantillaInicio(input: IndigoInicioInput): string {
  const {
    tipoTramite,
    tienePlataforma,
    plataformaFuncionando,
    alcance,
    ipsRedLocal,
    departamentos,
  } = input;

  const conNacional = alcance === "LOCAL_NACIONAL";
  const ips = joinList(ipsRedLocal, "RED DE REFERENCIA LOCAL");
  const deptos = joinList(departamentos, "RED DE REFERENCIA NACIONAL");
  const soat = esTramiteSoat(tipoTramite);
  const administrativo = esTramiteAdministrativo(tipoTramite);
  const plataformaCaida = tienePlataforma && plataformaFuncionando === false;

  // --- Remisión por trámite administrativo cancelable (8.9 / 8.10 / 8.11) ---
  if (administrativo) {
    if (tienePlataforma && plataformaFuncionando === true) {
      // 8.9
      return "SE DA INICIO AL TRÁMITE ADMINISTRATIVO CON LA RADICACIÓN EN PLATAFORMA CON CÓDIGO DE RADICACIÓN PENDIENTE, QUEDANDO A LA ESPERA DE RESPUESTA DE LA EAPB Y DE PROBABLE AUTORIZACIÓN DE ESTANCIA HOSPITALARIA, DEBIDO A QUE CONTAMOS CON LA CAPACIDAD TÉCNICO-CIENTÍFICA Y ESPECIALIDAD REQUERIDA EN LA ACTUALIDAD.";
    }
    if (plataformaCaida) {
      // 8.11
      return "SE DA INICIO AL TRÁMITE. NO SE RADICA CASO EN PLATAFORMA PORQUE PRESENTA FALLAS. POR LO ANTERIOR, SE ENVÍA CORREO A LA EAPB DANDO INICIO AL TRÁMITE DE REMISIÓN, QUEDANDO A LA ESPERA DE RESPUESTA DE LA EAPB Y DE PROBABLE AUTORIZACIÓN DE SERVICIOS O ESTANCIA HOSPITALARIA, DEBIDO A QUE CONTAMOS CON LA CAPACIDAD TÉCNICO-CIENTÍFICA Y ESPECIALIDAD REQUERIDA EN LA ACTUALIDAD.\n\nNOTA: SE COLOCARÁ NOTA CON EL CÓDIGO DE RADICADO EN PLATAFORMA APENAS SE RESTABLEZCA Y SE REALICE REGISTRO.";
    }
    // 8.10 (sin plataforma)
    return "SE DA INICIO AL TRÁMITE ADMINISTRATIVO DE REMISIÓN ENVIANDO CORREO ELECTRÓNICO A LA EAPB, QUEDANDO A LA ESPERA DE RESPUESTA Y DE PROBABLE AUTORIZACIÓN DE ESTANCIA HOSPITALARIA, DEBIDO A QUE CONTAMOS CON LA CAPACIDAD TÉCNICO-CIENTÍFICA Y ESPECIALIDAD REQUERIDA EN LA ACTUALIDAD.";
  }

  // --- SOAT (8.5 / 8.6) ---
  if (soat) {
    if (conNacional) {
      // 8.6
      return `SE DA INICIO AL TRÁMITE CON LA RADICACIÓN DEL CASO ENVIANDO CORREO ELECTRÓNICO, EL CUAL SE ENVÍA AL CRUE CON COPIA A LA RED DE REFERENCIA LOCAL (${ips}) Y RED DE REFERENCIA NACIONAL (${deptos}) PARA POSIBLE ACEPTACIÓN Y AGILIZACIÓN DEL PROCESO.`;
    }
    // 8.5
    return `SE DA INICIO AL TRÁMITE CON LA RADICACIÓN DEL CASO ENVIANDO CORREO ELECTRÓNICO, EL CUAL SE ENVÍA AL CRUE CON COPIA A LA RED DE REFERENCIA LOCAL (${ips}) PARA POSIBLE ACEPTACIÓN Y AGILIZACIÓN DEL PROCESO.`;
  }

  // --- EAPB con plataforma caída (8.7 / 8.8) ---
  if (plataformaCaida) {
    if (conNacional) {
      // 8.8
      return `SE DA INICIO AL TRÁMITE. NO SE RADICA CASO EN PLATAFORMA PORQUE LA PLATAFORMA DE LA EAPB PRESENTA FALLAS O NO SE ENCUENTRA FUNCIONANDO. SE ENVÍA CORREO A LA EAPB, CON COPIA AL CRUE, A LA RED DE REFERENCIA LOCAL (${ips}) Y RED DE REFERENCIA NACIONAL (${deptos}) PARA POSIBLE ACEPTACIÓN Y AGILIZACIÓN DEL PROCESO.\n\nNOTA: SE COLOCARÁ NOTA CON EL CÓDIGO DE RADICADO EN PLATAFORMA APENAS SE RESTABLEZCA Y SE REALICE EL REGISTRO.`;
    }
    // 8.7
    return `SE DA INICIO AL TRÁMITE. NO SE RADICA CASO EN PLATAFORMA PORQUE LA PLATAFORMA DE LA EAPB PRESENTA FALLAS O NO SE ENCUENTRA FUNCIONANDO. SE ENVÍA CORREO A LA EAPB, CON COPIA AL CRUE Y A LA RED DE REFERENCIA LOCAL (${ips}) PARA POSIBLE ACEPTACIÓN Y AGILIZACIÓN DEL PROCESO.\n\nNOTA: SE COLOCARÁ NOTA CON EL CÓDIGO DE RADICADO EN PLATAFORMA APENAS SE RESTABLEZCA Y SE REALICE EL REGISTRO.`;
  }

  // --- EAPB con plataforma funcionando (8.1 / 8.2) ---
  if (tienePlataforma && plataformaFuncionando === true) {
    if (conNacional) {
      // 8.2
      return `SE DA INICIO AL TRÁMITE CON LA RADICACIÓN DEL CASO EN PLATAFORMA CON CÓDIGO DE RADICACIÓN PENDIENTE. SE ENVÍA CORREO ELECTRÓNICO A LA EAPB PARA DOBLE TRAZABILIDAD, EL CUAL SE ENVÍA CON COPIA AL CRUE, RED DE REFERENCIA LOCAL (${ips}) Y RED DE REFERENCIA NACIONAL (${deptos}) PARA POSIBLE ACEPTACIÓN Y AGILIZACIÓN DEL PROCESO.`;
    }
    // 8.1
    return `SE DA INICIO AL TRÁMITE CON LA RADICACIÓN DEL CASO EN PLATAFORMA CON CÓDIGO DE RADICACIÓN PENDIENTE. SE ENVÍA CORREO ELECTRÓNICO A LA EAPB PARA DOBLE TRAZABILIDAD, EL CUAL SE ENVÍA CON COPIA AL CRUE Y RED DE REFERENCIA LOCAL (${ips}) PARA POSIBLE ACEPTACIÓN Y AGILIZACIÓN DEL PROCESO.`;
  }

  // --- EAPB sin plataforma (8.3 / 8.4) ---
  if (conNacional) {
    // 8.4
    return `SE DA INICIO AL TRÁMITE CON LA RADICACIÓN DEL CASO ENVIANDO CORREO ELECTRÓNICO A LA EAPB PARA DOBLE TRAZABILIDAD, EL CUAL SE ENVÍA CON COPIA AL CRUE, RED DE REFERENCIA LOCAL (${ips}) Y RED DE REFERENCIA NACIONAL (${deptos}) PARA POSIBLE ACEPTACIÓN Y AGILIZACIÓN DEL PROCESO.`;
  }
  // 8.3
  return `SE DA INICIO AL TRÁMITE CON LA RADICACIÓN DEL CASO ENVIANDO CORREO ELECTRÓNICO A LA EAPB PARA DOBLE TRAZABILIDAD, EL CUAL SE ENVÍA CON COPIA AL CRUE Y RED DE REFERENCIA LOCAL (${ips}) PARA POSIBLE ACEPTACIÓN Y AGILIZACIÓN DEL PROCESO.`;
}

// ---------------------------------------------------------------------------
// Notas aclaratorias (sección 9). Solo se generan cuando aplican.
// ---------------------------------------------------------------------------

export type MotivoNota =
  | "ninguno"
  | "soat_a_eps"
  | "cambio_pagador"
  | "superacion_tope"
  | "cambio_especialidad"
  | "cambio_unidad";

export const MOTIVOS_NOTA: { value: MotivoNota; label: string }[] = [
  { value: "ninguno", label: "Sin nota aclaratoria (caso normal)" },
  { value: "soat_a_eps", label: "Cambio de SOAT a EPS/EAPB por superación de tope" },
  { value: "cambio_pagador", label: "Cambio de aseguradora o pagador inicial a EPS/EAPB" },
  { value: "superacion_tope", label: "Cambio por superación de tope de cobertura" },
  { value: "cambio_especialidad", label: "Cambio de especialidad" },
  { value: "cambio_unidad", label: "Cambio de unidad" },
];

export type NotaInput = {
  motivo: MotivoNota;
  fechaTramiteInicial?: string;
  horaTramiteInicial?: string;
  pagadorInicial?: string;
  especialidad?: string;
  unidad?: string;
};

/** Genera la nota aclaratoria, con placeholders visibles si faltan datos. */
export function generarNotaAclaratoria(input: NotaInput): string {
  const ph = (v: string | undefined, key: string) =>
    v && v.trim() ? v.trim() : `[${key}]`;

  if (input.motivo === "ninguno") return "";

  if (input.motivo === "cambio_especialidad") {
    return `NOTA ACLARATORIA: SE REALIZA AJUSTE DEL TRÁMITE DE REMISIÓN POR CAMBIO DE ESPECIALIDAD A ${ph(
      input.especialidad,
      "ESPECIALIDAD",
    )}, DANDO CONTINUIDAD AL PROCESO DE REFERENCIA Y CONTRARREFERENCIA.`;
  }

  if (input.motivo === "cambio_unidad") {
    return `NOTA ACLARATORIA: SE REALIZA AJUSTE DEL TRÁMITE DE REMISIÓN POR CAMBIO DE UNIDAD A ${ph(
      input.unidad,
      "UNIDAD",
    )}, DANDO CONTINUIDAD AL PROCESO DE REFERENCIA Y CONTRARREFERENCIA.`;
  }

  const motivoTexto: Record<string, string> = {
    soat_a_eps: "CAMBIO DE SOAT A EPS/EAPB POR SUPERACIÓN DE TOPE",
    cambio_pagador: "CAMBIO DE ASEGURADORA O PAGADOR INICIAL A EPS/EAPB",
    superacion_tope: "SUPERACIÓN DE TOPE DE COBERTURA",
  };

  return `NOTA ACLARATORIA: EL TRÁMITE DE REMISIÓN INICIAL SE DIO EL DÍA ${ph(
    input.fechaTramiteInicial,
    "FECHA",
  )} A LAS ${ph(input.horaTramiteInicial, "HORA")} POR ${ph(
    input.pagadorInicial,
    "PAGADOR INICIAL",
  )}. SE REALIZA AJUSTE DEL TRÁMITE POR ${
    motivoTexto[input.motivo] ?? "[MOTIVO DEL CAMBIO]"
  }, DANDO CONTINUIDAD AL PROCESO DE REFERENCIA Y CONTRARREFERENCIA.`;
}

// ---------------------------------------------------------------------------
// Plantillas de seguimiento de radicación en plataforma (sección 10) y especial 8.12.
// ---------------------------------------------------------------------------

export type RadicacionTipo =
  | "con_codigo"
  | "plataforma_restablecida"
  | "sin_codigo";

export function generarPlantillaRadicacion(
  tipo: RadicacionTipo,
  codigo?: string,
): string {
  const cod = (codigo || "").trim() || "[CÓDIGO DE RADICACIÓN]";
  switch (tipo) {
    case "con_codigo":
      // 10.1
      return `SE REALIZA RADICACIÓN DEL CASO EN PLATAFORMA DE LA EAPB CON EL CÓDIGO: ${cod}. SE DEJA TRAZABILIDAD DEL TRÁMITE Y SE CONTINÚA EN ESPERA DE RESPUESTA POR PARTE DE LA EAPB.`;
    case "plataforma_restablecida":
      // 10.2
      return `SE REALIZA RADICACIÓN DEL CASO EN PLATAFORMA DE LA EAPB, UNA VEZ RESTABLECIDO SU FUNCIONAMIENTO, CON EL CÓDIGO: ${cod}. SE DEJA TRAZABILIDAD DEL TRÁMITE Y SE CONTINÚA EN ESPERA DE RESPUESTA POR PARTE DE LA EAPB.`;
    case "sin_codigo":
    default:
      // 10.3
      return "SE DEJA TRAZABILIDAD DEL TRÁMITE DE REMISIÓN. LA ENTIDAD RESPONSABLE DEL PAGO NO GENERA CÓDIGO DE RADICACIÓN PARA ESTE PROCESO.";
  }
}

/** Plantilla 8.12: fallas de plataforma sin solución telefónica. */
export const PLANTILLA_FALLA_SIN_SOLUCION =
  "PACIENTE A QUIEN SE SOLICITÓ TRÁMITE DE REMISIÓN ADMINISTRATIVO POR RED NO CONTRATADA. SIN EMBARGO, NO HA SIDO POSIBLE INICIARLO DEBIDO A QUE LA PLATAFORMA DE LA EAPB PRESENTA FALLAS. SE TRATA DE SOLICITAR INICIO DEL MISMO VÍA TELEFÓNICA A LÍNEA DE LA EAPB, PERO EN COMUNICACIÓN CON FUNCIONARIO DE LA ENTIDAD INDICAN NO PODER COLABORAR CON DICHA SOLICITUD, YA QUE TAMPOCO CUENTAN CON PLATAFORMA DEBIDO A QUE SE ENCUENTRA EN MANTENIMIENTO. POR LO ANTERIOR, SE CONTINÚA EN ESPERA DE QUE EAPB BRINDE SOLUCIÓN.";

// ---------------------------------------------------------------------------
// Plantillas de EVOLUCIÓN DIARIA (sección 7). Usan los datos del caso.
// ---------------------------------------------------------------------------

export type EvolucionSituacion =
  | "estandar"
  | "aceptacion_sin_tep"
  | "aceptacion_con_tep"
  | "admin_plataforma"
  | "admin_plataforma_falla";

export const EVO_SITUACIONES: { value: EvolucionSituacion; label: string }[] = [
  { value: "estandar", label: "Evolución estándar (según datos del caso)" },
  { value: "aceptacion_sin_tep", label: "Aceptación, sin traslado coordinado (sin TEP)" },
  { value: "aceptacion_con_tep", label: "Aceptación, con traslado coordinado (con TEP)" },
  { value: "admin_plataforma", label: "Trámite administrativo en plataforma" },
  { value: "admin_plataforma_falla", label: "Trámite administrativo con plataforma fallando" },
];

export type EvolucionInput = {
  tienePlataforma: boolean;
  plataformaFuncionando: boolean | null;
  esSoat: boolean;
  conNacional: boolean;
  ipsRedLocal: string[];
  departamentos: string[];
  situacion: EvolucionSituacion;
};

export function generarPlantillaEvolucion(input: EvolucionInput): string {
  const {
    tienePlataforma,
    plataformaFuncionando,
    esSoat,
    conNacional,
    ipsRedLocal,
    departamentos,
    situacion,
  } = input;
  const ips = joinList(ipsRedLocal, "RED DE REFERENCIA LOCAL");
  const deptos = joinList(departamentos, "RED DE REFERENCIA NACIONAL");

  // Situaciones específicas (7.8 – 7.11).
  if (situacion === "aceptacion_sin_tep") {
    return "SE ENVÍA EVOLUCIÓN ACTUALIZADA POR CORREO ELECTRÓNICO A LA EAPB CON COPIA A LA IPS RECEPTORA, SOLICITANDO RESERVA DE LA CAMA MIENTRAS SE LOGRA COORDINAR TRASLADO CON EMPRESA TEP POR PARTE DE LA EAPB.";
  }
  if (situacion === "aceptacion_con_tep") {
    return "SE ENVÍA EVOLUCIÓN ACTUALIZADA POR CORREO ELECTRÓNICO A LA EAPB CON COPIA A LA IPS RECEPTORA, SOLICITANDO RESERVA DE LA CAMA E INDICANDO QUE EL TRASLADO YA SE ENCUENTRA COORDINADO CON FECHA Y HORA.";
  }
  if (situacion === "admin_plataforma") {
    return "SE ENVÍA EVOLUCIÓN ACTUALIZADA EN PLATAFORMA DE LA EAPB, QUEDANDO A LA ESPERA DE RESPUESTA Y DE PROBABLE AUTORIZACIÓN DE ESTANCIA HOSPITALARIA, DEBIDO A QUE CONTAMOS CON LA CAPACIDAD TÉCNICO-CIENTÍFICA Y ESPECIALIDAD REQUERIDA EN LA ACTUALIDAD.";
  }
  if (situacion === "admin_plataforma_falla") {
    return "SE ENVÍA EVOLUCIÓN ACTUALIZADA POR CORREO ELECTRÓNICO A LA EAPB DEBIDO A QUE LA PLATAFORMA PRESENTA FALLA, QUEDANDO A LA ESPERA DE RESPUESTA Y DE PROBABLE AUTORIZACIÓN DE ESTANCIA HOSPITALARIA, DEBIDO A QUE CONTAMOS CON LA CAPACIDAD TÉCNICO-CIENTÍFICA Y ESPECIALIDAD REQUERIDA EN LA ACTUALIDAD.";
  }

  const plataformaCaida = tienePlataforma && plataformaFuncionando === false;

  // 7.7 EAPB con plataforma caída.
  if (plataformaCaida) {
    let t =
      "SE ENVÍA EVOLUCIÓN ACTUALIZADA POR CORREO ELECTRÓNICO A LA EAPB DEBIDO A QUE LA PLATAFORMA PRESENTA FALLA, QUEDANDO A LA ESPERA DE RESPUESTA Y CONTINUIDAD DEL PROCESO DE REMISIÓN.";
    if (ipsRedLocal.length > 0) {
      t += ` CON COPIA AL CRUE Y A LA RED DE REFERENCIA LOCAL (${ips})`;
      if (conNacional) t += ` Y RED DE REFERENCIA NACIONAL (${deptos})`;
      t += ".";
    }
    return t;
  }

  // 7.5 / 7.6 SOAT.
  if (esSoat) {
    if (conNacional) {
      return `SE ENVÍA EVOLUCIÓN ACTUALIZADA POR CORREO ELECTRÓNICO AL CRUE CON COPIA A LA RED DE REFERENCIA LOCAL (${ips}) Y RED DE REFERENCIA NACIONAL (${deptos}) PARA POSIBLE ACEPTACIÓN Y AGILIZACIÓN DEL PROCESO.`;
    }
    return `SE ENVÍA EVOLUCIÓN ACTUALIZADA POR CORREO ELECTRÓNICO AL CRUE CON COPIA A LA RED DE REFERENCIA LOCAL (${ips}) PARA POSIBLE ACEPTACIÓN Y AGILIZACIÓN DEL PROCESO.`;
  }

  // 7.3 / 7.4 EAPB con plataforma funcionando + correo.
  if (tienePlataforma && plataformaFuncionando === true) {
    if (conNacional) {
      return `SE ENVÍA EVOLUCIÓN ACTUALIZADA EN PLATAFORMA DE LA EAPB. TAMBIÉN SE ENVÍA POR CORREO ELECTRÓNICO CON COPIA AL CRUE, RED DE REFERENCIA LOCAL (${ips}) Y RED DE REFERENCIA NACIONAL (${deptos}) PARA POSIBLE ACEPTACIÓN Y AGILIZACIÓN DEL PROCESO.`;
    }
    return `SE ENVÍA EVOLUCIÓN ACTUALIZADA EN PLATAFORMA DE LA EAPB. TAMBIÉN SE ENVÍA POR CORREO ELECTRÓNICO CON COPIA AL CRUE Y RED DE REFERENCIA LOCAL (${ips}) PARA POSIBLE ACEPTACIÓN Y AGILIZACIÓN DEL PROCESO.`;
  }

  // 7.1 / 7.2 EAPB sin plataforma o evolución por correo.
  if (conNacional) {
    return `SE ENVÍA EVOLUCIÓN ACTUALIZADA POR CORREO ELECTRÓNICO A LA EAPB CON COPIA AL CRUE, A LA RED DE REFERENCIA LOCAL (${ips}) Y RED DE REFERENCIA NACIONAL (${deptos}) PARA POSIBLE ACEPTACIÓN Y AGILIZACIÓN DEL PROCESO.`;
  }
  return `SE ENVÍA EVOLUCIÓN ACTUALIZADA POR CORREO ELECTRÓNICO A LA EAPB CON COPIA AL CRUE Y A LA RED DE REFERENCIA LOCAL (${ips}) PARA POSIBLE ACEPTACIÓN Y AGILIZACIÓN DEL PROCESO.`;
}

// ---------------------------------------------------------------------------
// Respuesta de IPS (sección 9) y rechazo por paciente/familia (sección 10).
// ---------------------------------------------------------------------------

function ph(v: string | undefined, key: string): string {
  return v && v.trim() ? v.trim() : `[${key}]`;
}

export function generarPlantillaRespuestaIps(
  estado: string,
  ipsReceptora: string,
  detalle: string,
): string {
  const i = ph(ipsReceptora, "IPS RECEPTORA");
  switch (estado) {
    case "Sí acepta":
      return `SE RECIBE CORREO DE ACEPTACIÓN POR PARTE DE ${i}. SE LE INFORMA AL PACIENTE Y FAMILIAR, QUIENES ACEPTAN TRASLADO. POR LO ANTERIOR, SE EMITE CORREO A EAPB CON REQUERIMIENTOS PARA COORDINACIÓN DE AMBULANCIA TAB. SE ESPERA GESTIÓN POR PARTE DE LA ENTIDAD.`;
    case "No acepta":
      return `SE RECIBE RESPUESTA POR PARTE DE ${i}, INDICANDO QUE NO ACEPTA EL CASO. SE DEJA TRAZABILIDAD Y SE CONTINÚA GESTIÓN CON OTRAS IPS DE LA RED DE REFERENCIA, SEGÚN DISPONIBILIDAD Y PERTINENCIA DEL CASO.`;
    case "Pendiente":
      return `SE REALIZA SEGUIMIENTO A LA SOLICITUD ENVIADA A ${i}, QUEDANDO PENDIENTE RESPUESTA POR PARTE DE LA INSTITUCIÓN RECEPTORA.`;
    default:
      return `SE DEJA TRAZABILIDAD DE RESPUESTA DE IPS: ${ph(detalle, "DETALLE")}`;
  }
}

export function plantillaRechazoFamilia(ipsReceptora: string): string {
  const i = ph(ipsReceptora, "IPS RECEPTORA");
  return `SE COMENTA CON FAMILIAR SOBRE LA ACEPTACIÓN EN ${i}, QUIEN ARGUMENTA QUE NO ACEPTA POR NO CONTAR CON LOS ADECUADOS RECURSOS ECONÓMICOS Y POR LA PREOCUPACIÓN DE DETERIORAR EL ESTADO DE SALUD DE SU FAMILIAR POR EL TRASLADO. POR LO ANTERIOR, NO ACEPTA REMISIÓN FUERA DEL DEPARTAMENTO Y REFIERE ESPERAR A QUE EN FLORENCIA SE CUENTE CON LA MISMA. ENTIENDE LOS RIESGOS Y COMPLICACIONES ASOCIADOS A LA NO REMISIÓN Y ACEPTA LA RESPONSABILIDAD.`;
}

// ---------------------------------------------------------------------------
// Coordinación de ambulancia (sección 11).
// ---------------------------------------------------------------------------

export type AmbulanciaVariante = "empresa" | "eapb";

export const AMBULANCIA_VARIANTES: { value: AmbulanciaVariante; label: string }[] = [
  { value: "empresa", label: "La empresa de ambulancia informa la coordinación" },
  { value: "eapb", label: "La EAPB informa la coordinación con la ambulancia" },
];

export function generarPlantillaAmbulancia(
  variante: AmbulanciaVariante,
  empresa: string,
  fecha: string,
  hora: string,
): string {
  const e = ph(empresa, "EMPRESA DE AMBULANCIA / TEP");
  const f = ph(fecha, "FECHA");
  const h = ph(hora, "HORA");
  if (variante === "eapb") {
    return `LA EAPB INFORMA QUE EL TRASLADO EN AMBULANCIA TAB YA SE COORDINÓ CON LA AMBULANCIA DE ${e} Y QUEDA PROGRAMADO PARA EL DÍA ${f} A LAS ${h}, POR LO QUE SE INFORMA A FAMILIAR, PACIENTE Y SERVICIO PARA QUE TENGAN TODO LISTO.`;
  }
  return `${e} INFORMA QUE EL TRASLADO EN AMBULANCIA TAB YA SE COORDINÓ Y QUEDA PROGRAMADO PARA EL DÍA ${f} A LAS ${h}, POR LO QUE SE INFORMA A FAMILIAR, PACIENTE Y SERVICIO PARA QUE TENGAN TODO LISTO.`;
}

// Cierre por admisión (Parte 18): confirma egreso y cierra el proceso.
export function generarPlantillaCierreAdmision(ipsReceptora: string): string {
  const ips = ph(ipsReceptora, "IPS RECEPTORA");
  return `SE CONFIRMA EGRESO DEL PACIENTE DE LA INSTITUCIÓN PARA TRASLADO HACIA ${ips}, POSTERIOR A ENTREGA DOCUMENTAL Y COORDINACIÓN DEL TRASLADO. SE CIERRA PROCESO DE REMISIÓN POR REMISIÓN EXITOSA.`;
}

// Cierre del caso por traslado efectivo: el paciente fue trasladado y recibido
// en la IPS receptora, por lo que se cierra el proceso de forma exitosa.
// Omite empresa / tipo de ambulancia cuando no existan (sin null/undefined,
// sin guiones ni espacios duplicados).
export function generarPlantillaCierreTraslado(i: {
  ipsReceptora: string;
  fecha?: string;
  hora?: string;
  empresa?: string;
  tipoAmbulancia?: string;
}): string {
  const ips = ph(i.ipsReceptora, "IPS RECEPTORA");
  let t = `SE CONFIRMA TRASLADO EFECTIVO DEL PACIENTE HACIA ${ips}`;
  const fecha = (i.fecha || "").trim();
  const hora = (i.hora || "").trim();
  if (fecha || hora) {
    t += ` REALIZADO EL ${fecha || "[FECHA]"}`;
    if (hora) t += ` A LAS ${hora}`;
  }
  const empresa = (i.empresa || "").trim();
  const tipoAmb = (i.tipoAmbulancia || "").trim();
  if (empresa) {
    t += ` MEDIANTE ${empresa.toUpperCase()}`;
    if (tipoAmb) t += ` EN AMBULANCIA TIPO ${tipoAmb.toUpperCase()}`;
  } else if (tipoAmb) {
    t += ` EN AMBULANCIA TIPO ${tipoAmb.toUpperCase()}`;
  }
  t += ". SE CIERRA EL TRÁMITE DE REMISIÓN POR TRASLADO EFECTIVO Y SE DEJA TRAZABILIDAD DEL PROCESO.";
  return t;
}

// Superación de tope SOAT: se cierra la gestión con la aseguradora/SOAT
// anterior y se da continuidad al mismo trámite con la nueva EAPB/ERP.
export function generarPlantillaSuperacionTope(i: {
  aseguradoraAnterior: string;
  nuevaEapb: string;
  radicacion: string;
}): string {
  const ant = ph(i.aseguradoraAnterior, "ASEGURADORA/SOAT ANTERIOR");
  const nueva = ph(i.nuevaEapb, "NUEVA EAPB/ERP");
  const rad = (i.radicacion || "").trim() || "NO APLICA";
  return `SE CIERRA LA GESTIÓN DEL TRÁMITE DE REMISIÓN CON ${ant} POR SUPERACIÓN DE TOPE SOAT. SE ACTUALIZA EL RESPONSABLE DEL ASEGURAMIENTO EN SALUD A ${nueva} Y SE DA CONTINUIDAD AL TRÁMITE DE REMISIÓN CON DICHA ENTIDAD. RADICACIÓN: ${rad}. SE DEJA TRAZABILIDAD DEL CAMBIO DE RESPONSABLE Y DE LA CONTINUIDAD DEL PROCESO.`;
}

// ---------------------------------------------------------------------------
// Cambio de asegurador a EAPB (se cierra por la aseguradora anterior y se
// continúa el trámite por la nueva EAPB, con sus datos de plataforma/radicado).
// ---------------------------------------------------------------------------
export function generarPlantillaCambioAsegurador(i: {
  nuevaEapb: string;
  tienePlataforma: boolean;
  plataformaFunciona: boolean | null;
  generaCodigo: boolean;
  nuevoRadicado: string;
}): string {
  const eapb = ph(i.nuevaEapb, "NUEVA EAPB");
  let out = `SE REALIZA CAMBIO DE ASEGURADOR DEL CASO HACIA LA EAPB ${eapb}. SE CIERRA EL TRÁMITE POR LA ASEGURADORA ANTERIOR Y SE CONTINÚA LA GESTIÓN DE LA REMISIÓN POR LA NUEVA EAPB.`;
  if (i.generaCodigo) {
    out += ` LA NUEVA EAPB GENERA CÓDIGO DE RADICADO: ${ph(i.nuevoRadicado, "NÚMERO DE RADICADO")}.`;
  } else {
    out += ` LA NUEVA EAPB NO GENERA CÓDIGO DE RADICADO.`;
  }
  if (i.tienePlataforma) {
    out += ` LA EAPB CUENTA CON PLATAFORMA, LA CUAL SE ENCUENTRA ${
      i.plataformaFunciona ? "FUNCIONANDO" : "FUERA DE SERVICIO"
    } AL MOMENTO DE LA GESTIÓN.`;
  } else {
    out += ` LA EAPB NO CUENTA CON PLATAFORMA; LA GESTIÓN SE REALIZA POR OTROS CANALES.`;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Cierre de trámite (sección 12).
// ---------------------------------------------------------------------------

export type CierreSubtipo = "rechazo_familia" | "superacion_tope";

export const CIERRE_SUBTIPOS: { value: CierreSubtipo; label: string }[] = [
  { value: "rechazo_familia", label: "Cierre por rechazo de paciente/familia" },
  { value: "superacion_tope", label: "Cierre por aseguradora / superación de tope" },
];

export function generarPlantillaCierre(
  subtipo: CierreSubtipo,
  ipsReceptora: string,
  funcionario: string,
): string {
  if (subtipo === "superacion_tope") {
    return `SE RECIBE EL LLAMADO DEL ÁREA DE FACTURACIÓN (AUTORIZACIONES) POR PARTE DE ${ph(
      funcionario,
      "FUNCIONARIO DE FACTURACIÓN",
    )}, QUIEN INDICA QUE LA PACIENTE SUPERÓ TOPES Y QUEDA A CARGO DE LA EAPB. POR LO ANTERIOR, REALIZO CIERRE DE CASO POR LA ASEGURADORA, PARA ABRIRLO POR LA EAPB Y DARLE CONTINUIDAD AL TRÁMITE.`;
  }
  return `REALIZO CIERRE DE CASO, DEBIDO A QUE FAMILIARES Y PACIENTE DECIDEN RECHAZAR REMISIÓN HACIA ${ph(
    ipsReceptora,
    "IPS RECEPTORA",
  )}. SE DA AVISO AL SERVICIO PARA REALIZAR INTERVENCIÓN POR TRABAJO SOCIAL Y PSICOLOGÍA. POSTERIOR A LA MISMA, FAMILIARES Y PACIENTE CONTINÚAN BAJO LA MISMA POSICIÓN, MOTIVO POR EL CUAL LA EAPB REALIZA CIERRE DE TRÁMITE DE REMISIÓN E INDICAN GENERAR AUTORIZACIÓN. SE DA AVISO A LA COORDINACIÓN DE FACTURACIÓN.`;
}

// ---------------------------------------------------------------------------
// Cancelación de trámite administrativo (sección 13).
// ---------------------------------------------------------------------------

export type CancelacionSubtipo = "notificacion" | "solicitud_chat" | "seguimiento_formal";

export const CANCELACION_SUBTIPOS: { value: CancelacionSubtipo; label: string }[] = [
  { value: "notificacion", label: "Después de notificación por facturación" },
  { value: "solicitud_chat", label: "Solicitud de cancelación al chat" },
  { value: "seguimiento_formal", label: "Seguimiento formal después de solicitud de cancelación" },
];

export function generarPlantillaCancelacion(subtipo: CancelacionSubtipo): string {
  if (subtipo === "solicitud_chat") {
    return "HOLA, BUEN DÍA. JEFE, ME INFORMA EL ÁREA DE AUTORIZACIONES QUE ESTE PACIENTE YA CUENTA CON AUTORIZACIÓN DE ESTANCIA. POR TAL MOTIVO, SI SE LE PUEDE DAR MANEJO EN LA INSTITUCIÓN, POR FAVOR INFORMAR AL MÉDICO DE TURNO PARA QUE SUSPENDA LA REMISIÓN QUE TIENE POR TRÁMITE ADMINISTRATIVO. GRACIAS.";
  }
  if (subtipo === "seguimiento_formal") {
    return "PACIENTE CON AUTORIZACIÓN DE ESTANCIA PARA MANEJO INTEGRAL EN NUESTRA INSTITUCIÓN, PREVIAMENTE INFORMADA POR EL ÁREA DE AUTORIZACIONES AL JEFE DEL SERVICIO, SEGÚN SE EVIDENCIA EN LA NOTA DE TRAZABILIDAD DE ÍNDIGO.\n\nSIN EMBARGO, AL MOMENTO DEL SEGUIMIENTO NO SE EVIDENCIA VALIDACIÓN MÉDICA DOCUMENTADA RESPECTO A LA PERTINENCIA DE CONTINUAR CON EL TRÁMITE DE REMISIÓN O SUSPENDERLO, TENIENDO EN CUENTA QUE YA SE CUENTA CON AUTORIZACIÓN VIGENTE PARA EL MANEJO EN LA INSTITUCIÓN.\n\nPOR LO ANTERIOR, DESDE EL ÁREA DE REFERENCIA Y CONTRARREFERENCIA SE REALIZA NUEVO ACERCAMIENTO CON EL JEFE Y EL MÉDICO DEL SERVICIO, CON EL FIN DE SOLICITAR REVISIÓN DEL CASO, DEFINICIÓN DE CONDUCTA Y REGISTRO DE LA DECISIÓN EN LA HISTORIA CLÍNICA MEDIANTE NOTA DE EVOLUCIÓN.\n\nSE DEJA TRAZABILIDAD DEL SEGUIMIENTO REALIZADO POR REFERENCIA Y CONTRARREFERENCIA.";
  }
  return "PACIENTE CON AUTORIZACIÓN DE ESTANCIA PARA MANEJO INTEGRAL EN NUESTRA INSTITUCIÓN, YA PREVIAMENTE NOTIFICADO POR FUNCIONARIO DE FACTURACIÓN AL JEFE DEL SERVICIO. SIN EMBARGO, NO SE HA VALIDADO PERTINENCIA MÉDICA, POR LO QUE SE REALIZA NUEVAMENTE ACERCAMIENTO CON JEFE Y MÉDICO DEL SERVICIO PARA VERIFICAR Y, SEGÚN SEA EL CASO, SUSPENDER REMISIÓN POR TRÁMITE ADMINISTRATIVO, DEJANDO TRAZABILIDAD EN HISTORIA CLÍNICA POR MEDIO DE NOTA DE EVOLUCIÓN.\n\nPOSTERIOR A LA REVISIÓN DEL CASO POR PARTE DEL MÉDICO TRATANTE, DECIDE CANCELAR TRÁMITE DE REMISIÓN TENIENDO EN CUENTA QUE YA SE ENCUENTRA AUTORIZACIÓN DEL SERVICIO INFORMADO CON ANTERIORIDAD POR EL ÁREA DE AUTORIZACIONES.";
}

// ---------------------------------------------------------------------------
// Validación de pertinencia médica (sección 14).
// ---------------------------------------------------------------------------

export type PertinenciaSubtipo = "con_nota" | "sin_nota";

export const PERTINENCIA_SUBTIPOS: { value: PertinenciaSubtipo; label: string }[] = [
  { value: "con_nota", label: "Con nota en trazabilidad" },
  { value: "sin_nota", label: "Sin nota en trazabilidad" },
];

export function generarPlantillaPertinencia(subtipo: PertinenciaSubtipo): string {
  if (subtipo === "sin_nota") {
    return "SE REVISA PLATAFORMA DE TRAZABILIDAD ÍNDIGO, DONDE SE EVIDENCIA AUTORIZACIÓN DE ESTANCIA HOSPITALARIA. SIN EMBARGO, NO HAY NOTA DEL FUNCIONARIO DEL ÁREA DE FACTURACIÓN INDICANDO QUE SE COMENTÓ A JEFE DEL SERVICIO PARA QUE LE INFORME AL MÉDICO TRATANTE QUE VALIDE PERTINENCIA MÉDICA. SE CONFIRMÓ VÍA TELEFÓNICA QUE SÍ SE LE INDICÓ AL SERVICIO, POR LO QUE ESTÁ PENDIENTE QUE SE DEFINA PERTINENCIA POR PARTE DEL MÉDICO TRATANTE.";
  }
  return "SE REVISA PLATAFORMA DE TRAZABILIDAD ÍNDIGO, DONDE SE EVIDENCIA AUTORIZACIÓN DE ESTANCIA HOSPITALARIA Y NOTA DEL FUNCIONARIO DEL ÁREA DE FACTURACIÓN, INDICANDO QUE SE COMENTÓ A JEFE DEL SERVICIO PARA QUE LE INFORME AL MÉDICO TRATANTE QUE VALIDE PERTINENCIA MÉDICA Y, SI ES EL CASO Y SE PUEDE CONTINUAR MANEJO EN NUESTRA INSTITUCIÓN, CANCELE EL TRÁMITE DE REMISIÓN.";
}

// ---------------------------------------------------------------------------
// Canales de seguimiento simples (sección 15) y "otro" (sección 16).
// ---------------------------------------------------------------------------

export type CanalSeguimiento = "correo" | "plataforma" | "fisico" | "llamada";

export function generarPlantillaCanal(
  canal: CanalSeguimiento,
  d: { destinatario?: string; nombre?: string; telefono?: string; detalle?: string },
): string {
  switch (canal) {
    case "correo":
      return `SE REALIZA SEGUIMIENTO POR CORREO ELECTRÓNICO A ${ph(
        d.destinatario,
        "DESTINATARIO",
      )}, QUEDANDO A LA ESPERA DE RESPUESTA Y CONTINUIDAD DEL PROCESO DE REMISIÓN.`;
    case "plataforma":
      return "SE REALIZA SEGUIMIENTO EN PLATAFORMA WEB DE LA EAPB, QUEDANDO A LA ESPERA DE RESPUESTA Y CONTINUIDAD DEL PROCESO DE REMISIÓN.";
    case "fisico":
      return "SE REALIZA SEGUIMIENTO FÍSICO O PRESENCIAL DEL TRÁMITE DE REMISIÓN, DEJANDO TRAZABILIDAD DE LA GESTIÓN REALIZADA.";
    case "llamada":
    default:
      return `SE REALIZA LLAMADA A ${ph(d.nombre, "NOMBRE DE CONTACTO")} AL NÚMERO ${ph(
        d.telefono,
        "TELÉFONO",
      )}, CON EL FIN DE REALIZAR SEGUIMIENTO AL PROCESO DE REMISIÓN.${
        d.detalle && d.detalle.trim() ? ` ${d.detalle.trim()}` : ""
      }`;
  }
}

export function generarPlantillaOtro(detalle: string): string {
  return `SE DEJA TRAZABILIDAD DE SEGUIMIENTO REALIZADO POR REFERENCIA Y CONTRARREFERENCIA: ${ph(
    detalle,
    "DETALLE",
  )}`;
}

// ===========================================================================
// MODAL DE SEGUIMIENTOS SALIENTES v2 — plantillas dinámicas por tipo.
// Texto plano para copiar/pegar en ÍNDIGO. Cada generador devuelve mayúsculas.
// ===========================================================================

/** Agrega la observación del usuario como nota al final de la plantilla. */
export function appendNota(texto: string, observaciones?: string | null): string {
  const obs = (observaciones || "").trim();
  if (!obs) return texto;
  return `${texto}\n\nNOTA: ${obs}`;
}

// --- Estado del caso normalizado (tolerante a tildes/variaciones). ---
export type EstadoCasoNorm =
  | "pendiente"
  | "aceptado_sin_amb"
  | "aceptado_con_amb"
  | "otro";

export function normEstadoCaso(v: string | null | undefined): EstadoCasoNorm {
  const s = (v || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
  if (/ACEPTAD.*CON.*AMBULANC/.test(s)) return "aceptado_con_amb";
  if (/ACEPTAD.*SIN.*(PROGRAMAC|AMBULANC|TRASLADO)/.test(s)) return "aceptado_sin_amb";
  if (/ACEPTAD/.test(s)) return "aceptado_sin_amb";
  if (/PENDIENTE/.test(s)) return "pendiente";
  return "otro";
}

// --- 4. RADICADO DE CASO ---
export function generarPlantillaRadicado(codigo: string): string {
  const cod = (codigo || "").trim() || "[RADICADO]";
  return `SE DEJA TRAZABILIDAD DEL TRÁMITE DE REMISIÓN CORRESPONDIENTE A LA RADICACIÓN DEL CASO ANTE LA EAPB, CON NÚMERO DE RADICADO ${cod}. SE CONTINÚA PENDIENTE A POSIBLE ACEPTACIÓN POR PARTE DE UNA IPS RECEPTORA.`;
}

// --- 5. EVOLUCIÓN DIARIA (determinada automáticamente). ---
export type EvolucionDiariaInput = {
  estadoCaso: string | null;
  /** Trámite administrativo (caso creado por RED NO CONTRATADA). */
  esTramiteAdministrativo: boolean;
  tienePlataforma: boolean;
  /** ¿La plataforma de la EAPB está funcionando? (solo si tiene plataforma) */
  plataformaFunciona: boolean | null;
  enviadoCorreo: boolean;
  enviadoPlataforma: boolean;
  motivoPendiente?: string;
};

export function generarPlantillaEvolucionDiaria(i: EvolucionDiariaInput): string {
  const plataformaCaida = i.tienePlataforma && i.plataformaFunciona === false;
  const est = normEstadoCaso(i.estadoCaso);

  // Texto del canal por el que se envió la evolución.
  let canal: string;
  if (plataformaCaida) {
    canal = "POR CORREO ELECTRÓNICO A LA EAPB";
  } else if (i.tienePlataforma) {
    if (i.enviadoCorreo && i.enviadoPlataforma) canal = "POR CORREO ELECTRÓNICO Y PLATAFORMA DE LA EAPB";
    else if (i.enviadoCorreo) canal = "POR CORREO ELECTRÓNICO A LA EAPB";
    else if (i.enviadoPlataforma) canal = "MEDIANTE LA PLATAFORMA DE LA EAPB";
    else canal = "A LA EAPB";
  } else {
    canal = "POR CORREO ELECTRÓNICO A LA EAPB";
  }

  let base: string;
  if (est === "aceptado_sin_amb") {
    base = `SE REALIZA EVOLUCIÓN DIARIA DEL PROCESO DE REMISIÓN, ENVIANDO EVOLUCIÓN ACTUALIZADA ${canal} CON COPIA A LA IPS RECEPTORA, SOLICITANDO RESERVA DE LA CAMA MIENTRAS SE COORDINA EL TRASLADO.`;
  } else if (est === "aceptado_con_amb") {
    base = `SE REALIZA EVOLUCIÓN DIARIA DEL PROCESO DE REMISIÓN ${canal} CON COPIA A LA IPS RECEPTORA. EL CASO YA CUENTA CON COORDINACIÓN DE TRASLADO; SE MANTIENE TRAZABILIDAD DEL PROCESO.`;
  } else if (i.esTramiteAdministrativo) {
    base = `SE REALIZA EVOLUCIÓN DIARIA DEL TRÁMITE ADMINISTRATIVO DE REMISIÓN ${canal}, QUEDANDO A LA ESPERA DE RESPUESTA Y DE PROBABLE AUTORIZACIÓN DE ESTANCIA HOSPITALARIA, DEBIDO A QUE CONTAMOS CON LA CAPACIDAD TÉCNICO-CIENTÍFICA Y ESPECIALIDAD REQUERIDA EN LA ACTUALIDAD.`;
  } else {
    base = `SE REALIZA EVOLUCIÓN DIARIA DEL PROCESO DE REMISIÓN ${canal}, QUEDANDO A LA ESPERA DE RESPUESTA Y CONTINUIDAD DEL PROCESO. SE CONTINÚA PENDIENTE A POSIBLE ACEPTACIÓN POR PARTE DE UNA IPS RECEPTORA.`;
  }

  if (plataformaCaida) {
    base += " SE DEJA TRAZABILIDAD DE QUE LA PLATAFORMA DE LA EAPB PRESENTA FALLA O NO DISPONIBILIDAD AL MOMENTO DEL SEGUIMIENTO.";
  }

  // Nota de canal pendiente (solo cuando la EAPB tiene plataforma).
  const motivo = (i.motivoPendiente || "").trim() || "[MOTIVO]";
  if (i.tienePlataforma && !plataformaCaida) {
    if (i.enviadoCorreo && !i.enviadoPlataforma) {
      base += `\n\nNOTA: QUEDA PENDIENTE ENVÍO POR PLATAFORMA. MOTIVO: ${motivo}.`;
    } else if (!i.enviadoCorreo && i.enviadoPlataforma) {
      base += `\n\nNOTA: QUEDA PENDIENTE ENVÍO POR CORREO ELECTRÓNICO. MOTIVO: ${motivo}.`;
    }
  }
  return base;
}

// --- 5b. EVOLUCIÓN DIARIA POR ESPECIALIDADES TRATANTES (Parte 9) ---
/** Texto del medio de evolución para las plantillas por especialidad. */
function medioEvoTexto(correo: boolean, plataforma: boolean): string {
  if (correo && plataforma) return "CORREO Y PLATAFORMA DE LA EAPB";
  if (plataforma) return "PLATAFORMA DE LA EAPB";
  if (correo) return "CORREO DE LA EAPB";
  return "LA EAPB";
}

export type EvolucionEspInput = {
  /** Especialidades marcadas como evolucionadas en este seguimiento. */
  evolucionadas: string[];
  /** Especialidades que quedan pendientes. */
  pendientes: string[];
  enviadoCorreo: boolean;
  enviadoPlataforma: boolean;
  /** Observación manual (para el caso sin especialidades marcadas). */
  observacion?: string;
};

/**
 * Genera la plantilla de evolución diaria dejando trazabilidad de qué
 * especialidades tratantes ya evolucionaron y cuáles quedan pendientes.
 */
export function generarPlantillaEvolucionEspecialidades(i: EvolucionEspInput): string {
  const medio = medioEvoTexto(i.enviadoCorreo, i.enviadoPlataforma);
  const evo = joinList(i.evolucionadas, "");
  const pend = joinList(i.pendientes, "");

  // 9.8 · Ninguna especialidad marcada.
  if (i.evolucionadas.length === 0) {
    const obs = (i.observacion || "").trim();
    if (obs) {
      return `NO SE REGISTRA EVOLUCIÓN POR ESPECIALIDAD TRATANTE EN ESTE SEGUIMIENTO. SE DEJA OBSERVACIÓN PARA CONTINUIDAD DEL PROCESO: ${obs.toUpperCase()}`;
    }
    return "NO SE REGISTRA EVOLUCIÓN POR ESPECIALIDAD TRATANTE EN ESTE SEGUIMIENTO. SE DEJA TRAZABILIDAD PARA CONTINUIDAD DEL PROCESO.";
  }

  // 9.6 · Evolución completa (no quedan pendientes).
  if (i.pendientes.length === 0) {
    return `SE REALIZA EVOLUCIÓN DIARIA DEL PROCESO DE REMISIÓN POR LAS ESPECIALIDADES TRATANTES ${evo}, A TRAVÉS DE ${medio}. SE CONTINÚA A LA ESPERA DE RESPUESTA POR PARTE DE LA RED/EAPB.`;
  }

  // 9.7 · Evolución parcial.
  return `SE REALIZA EVOLUCIÓN DIARIA DEL PROCESO DE REMISIÓN POR ${evo}, A TRAVÉS DE ${medio}. QUEDA PENDIENTE EVOLUCIÓN POR ${pend} PARA CONTINUIDAD EN EL SIGUIENTE TURNO.`;
}

// --- 6/7. CORREO ELECTRÓNICO / PLATAFORMA WEB (con ASUNTO) ---
export function generarPlantillaCorreoSeg(asunto: string, estadoSolicitud: string): string {
  let t = `SE REALIZA SEGUIMIENTO POR CORREO ELECTRÓNICO RELACIONADO CON EL ASUNTO: ${ph(
    asunto,
    "ASUNTO",
  )}.`;
  if (estadoSolicitud.trim()) t += ` ESTADO DE LA SOLICITUD: ${estadoSolicitud.trim().toUpperCase()}.`;
  return t;
}

export function generarPlantillaPlataformaSeg(asunto: string, estadoSolicitud: string): string {
  let t = `SE REALIZA SEGUIMIENTO MEDIANTE PLATAFORMA WEB DE LA EAPB RELACIONADO CON EL ASUNTO: ${ph(
    asunto,
    "ASUNTO",
  )}.`;
  if (estadoSolicitud.trim()) t += ` ESTADO DE LA SOLICITUD: ${estadoSolicitud.trim().toUpperCase()}.`;
  return t;
}

// --- 8. FÍSICO O PRESENCIAL ---
export type AcercamientoTipo = "FAMILIAR" | "PACIENTE" | "SERVICIO" | "OTRO";

export const ACERCAMIENTO_OPCIONES: AcercamientoTipo[] = [
  "FAMILIAR",
  "PACIENTE",
  "SERVICIO",
  "OTRO",
];

export const SERVICIO_OPCIONES = [
  "URGENCIAS",
  "HOSPITALIZACIÓN",
  "QUIRÓFANO",
  "UCI",
  "FACTURACIÓN / ADMISIONES",
];

export type FisicoInput = {
  acercamiento: AcercamientoTipo;
  nombre?: string;
  parentesco?: string;
  servicio?: string;
  funcionario?: string;
  cargo?: string;
  conQuien?: string;
};

export function generarPlantillaFisico(i: FisicoInput): string {
  const base = "SE REALIZA ACERCAMIENTO FÍSICO O PRESENCIAL";
  switch (i.acercamiento) {
    case "FAMILIAR":
      return `${base} CON EL FAMILIAR ${ph(i.nombre, "NOMBRE Y APELLIDO")} (${ph(
        i.parentesco,
        "PARENTESCO",
      )}), DEJANDO TRAZABILIDAD DE LA GESTIÓN REALIZADA EN EL PROCESO DE REMISIÓN.`;
    case "PACIENTE":
      return `${base} CON EL PACIENTE, DEJANDO TRAZABILIDAD DE LA GESTIÓN REALIZADA EN EL PROCESO DE REMISIÓN.`;
    case "SERVICIO":
      return `${base} EN EL SERVICIO DE ${ph(i.servicio, "SERVICIO")}, CON EL FUNCIONARIO ${ph(
        i.funcionario,
        "NOMBRE DEL FUNCIONARIO",
      )} (${ph(i.cargo, "CARGO")}), DEJANDO TRAZABILIDAD DE LA GESTIÓN REALIZADA EN EL PROCESO DE REMISIÓN.`;
    case "OTRO":
    default:
      return `${base} CON ${ph(i.conQuien, "CON QUIÉN")} (${ph(
        i.nombre,
        "NOMBRE Y APELLIDO",
      )}), DEJANDO TRAZABILIDAD DE LA GESTIÓN REALIZADA EN EL PROCESO DE REMISIÓN.`;
  }
}

// --- 9. CONTACTO TELEFÓNICO (con destinatario del contacto) ---
export type ContactoDestino = "CRUE" | "EAPB" | "CRUE_EAPB" | "IPS";

export const CONTACTO_DESTINOS: { value: ContactoDestino; label: string }[] = [
  { value: "CRUE", label: "CRUE" },
  { value: "EAPB", label: "EAPB" },
  { value: "CRUE_EAPB", label: "CRUE Y EAPB" },
  { value: "IPS", label: "IPS" },
];

export type TelefonicoInput = {
  destino: ContactoDestino | "";
  ipsNombre?: string;
  nombre: string;
  telefono: string;
  estadoSolicitud: string;
};

export function generarPlantillaTelefonico(i: TelefonicoInput): string {
  let conQuien: string;
  switch (i.destino) {
    case "CRUE":
      conQuien = "EL CRUE";
      break;
    case "EAPB":
      conQuien = "LA EAPB";
      break;
    case "CRUE_EAPB":
      conQuien = "EL CRUE Y LA EAPB";
      break;
    case "IPS":
      conQuien = `LA IPS ${ph(i.ipsNombre, "NOMBRE IPS")}`;
      break;
    default:
      conQuien = "[CONTACTO REALIZADO CON]";
  }
  let t = `SE REALIZA CONTACTO TELEFÓNICO CON ${conQuien}`;
  if (i.nombre.trim()) t += `, ATENDIDO POR ${i.nombre.trim().toUpperCase()}`;
  if (i.telefono.trim()) t += ` (TELÉFONO ${i.telefono.trim()})`;
  t += ", CON EL FIN DE REALIZAR SEGUIMIENTO AL PROCESO DE REMISIÓN.";
  if (i.estadoSolicitud.trim()) t += ` ESTADO DE LA SOLICITUD: ${i.estadoSolicitud.trim().toUpperCase()}.`;
  return t;
}

// --- 10. ACEPTACIÓN DE IPS RECEPTORA ---
export function generarPlantillaAceptacionIps(ips: string, sede: string): string {
  const i = ph(ips, "IPS RECEPTORA");
  const sedeTxt = (sede || "").trim() ? ` (${sede.trim()})` : "";
  return `SE RECIBE ACEPTACIÓN DEL CASO POR PARTE DE LA IPS RECEPTORA ${i}${sedeTxt}. SE INFORMA AL PACIENTE Y FAMILIAR, Y SE CONTINÚA GESTIÓN PARA LA COORDINACIÓN DEL TRASLADO. ESTADO DE LA SOLICITUD: SÍ ACEPTA.`;
}

// --- 11. TRAZABILIDAD DE NEGACIONES ---
export const NEGACION_MOTIVOS = [
  "NO DISPONIBILIDAD DE CAMAS",
  "NO DISPONIBILIDAD DE RECURSOS HUMANOS",
  "NO DISPONIBILIDAD DE INSUMOS O RECURSOS TECNOLÓGICOS",
  "NIVEL DE COMPETENCIA NO PERTINENTE",
  "OTRO",
];

export type NegacionGrupo = { motivo: string; ips: string[] };

export function generarPlantillaNegaciones(grupos: NegacionGrupo[]): string {
  const validos = grupos.filter((g) => g.motivo && g.ips.length > 0);
  if (validos.length === 0) {
    return "SE DEJA TRAZABILIDAD DE NEGACIONES RECIBIDAS DURANTE EL PROCESO DE REMISIÓN. ESTADO DE LA SOLICITUD: NO ACEPTA.";
  }
  let t = "SE DEJA TRAZABILIDAD DE NEGACIONES RECIBIDAS DURANTE EL PROCESO DE REMISIÓN:";
  for (const g of validos) {
    t += `\n\n${g.motivo.toUpperCase()}:`;
    for (const ips of g.ips) t += `\n- ${ips.toUpperCase()}`;
  }
  t += "\n\nESTADO DE LA SOLICITUD: NO ACEPTA.";
  return t;
}

// --- 13. CANCELACIÓN DE TRÁMITE DE REMISIÓN (unificada) ---
export type CancelacionTipo =
  | "desistimiento_general"
  | "superacion_tope_soat"
  | "aval_integral"
  | "continuidad_integral"
  | "mejoria_alta";

export const CANCELACION_TIPOS: { value: CancelacionTipo; label: string }[] = [
  {
    value: "desistimiento_general",
    label: "CANCELACIÓN POR FIRMA DE DESISTIMIENTO DE TRASLADO GENERAL",
  },
  {
    value: "superacion_tope_soat",
    label: "CANCELACIÓN POR SUPERACIÓN DE TOPE SOAT",
  },
  { value: "aval_integral", label: "CANCELACIÓN POR AVAL PARA MANEJO INTEGRAL" },
  {
    value: "continuidad_integral",
    label: "CANCELACIÓN POR CONTINUIDAD DE MANEJO INTEGRAL",
  },
  { value: "mejoria_alta", label: "CANCELACIÓN POR MEJORÍA CLÍNICA - ALTA MÉDICA" },
];

/** Cancelaciones que cierran el caso al guardar (todas menos superación de tope). */
export const CANCELACION_CIERRA: Record<CancelacionTipo, boolean> = {
  desistimiento_general: true,
  superacion_tope_soat: false,
  aval_integral: true,
  continuidad_integral: true,
  mejoria_alta: true,
};

/** Estado final estructurado por tipo de cancelación que cierra el caso. */
export const CANCELACION_ESTADO_FINAL: Record<CancelacionTipo, string> = {
  desistimiento_general: "CERRADO POR CANCELACION - DESISTIMIENTO DE TRASLADO GENERAL",
  superacion_tope_soat: "",
  aval_integral: "CERRADO POR CANCELACION - AVAL PARA MANEJO INTEGRAL",
  continuidad_integral: "CERRADO POR CANCELACION - CONTINUIDAD DE MANEJO INTEGRAL",
  mejoria_alta: "CERRADO POR CANCELACION - MEJORIA CLINICA / ALTA MEDICA",
};

/** Parentesco / relación de la persona que firma el desistimiento. */
export const PARENTESCO_OPCIONES = [
  "PACIENTE",
  "MADRE",
  "PADRE",
  "CÓNYUGE",
  "HIJO/A",
  "FAMILIAR",
  "ACUDIENTE",
  "REPRESENTANTE LEGAL",
  "OTRO",
];

export type CancelacionInput = {
  tipo: CancelacionTipo;
  /** Desistimiento de traslado general. */
  nombrePersona?: string;
  parentesco?: string;
  /** Superación de tope SOAT (cambio de responsable). */
  aseguradoraAnterior?: string;
  nuevaEapb?: string;
  radicacion?: string;
};

export function generarPlantillaCancelacionRemision(i: CancelacionInput): string {
  switch (i.tipo) {
    case "desistimiento_general":
      return `SE CANCELA EL TRÁMITE DE REMISIÓN POR FIRMA DE DESISTIMIENTO DE TRASLADO GENERAL, SUSCRITO POR ${ph(
        i.nombrePersona,
        "NOMBRE DE LA PERSONA",
      )}, EN CALIDAD DE ${ph(
        i.parentesco,
        "PARENTESCO/RELACIÓN",
      )}. SE INFORMA SOBRE LOS RIESGOS Y POSIBLES COMPLICACIONES ASOCIADAS A LA NO REALIZACIÓN DEL TRASLADO. SE DEJA TRAZABILIDAD DEL PROCESO Y SE CIERRA EL CASO.`;
    case "superacion_tope_soat":
      return generarPlantillaSuperacionTope({
        aseguradoraAnterior: i.aseguradoraAnterior ?? "",
        nuevaEapb: i.nuevaEapb ?? "",
        radicacion: i.radicacion ?? "",
      });
    case "aval_integral":
      return "SE CANCELA EL TRÁMITE DE REMISIÓN POR AVAL PARA CONTINUIDAD DE MANEJO INTEGRAL EN LA INSTITUCIÓN. SE DEJA TRAZABILIDAD DE LA GESTIÓN REALIZADA Y SE CIERRA EL CASO.";
    case "continuidad_integral":
      return "SE CANCELA EL TRÁMITE DE REMISIÓN POR CONTINUIDAD DE MANEJO INTEGRAL DEL PACIENTE EN LA INSTITUCIÓN. SE DEJA TRAZABILIDAD DE LA DECISIÓN Y SE CIERRA EL CASO.";
    case "mejoria_alta":
      return "SE CANCELA EL TRÁMITE DE REMISIÓN POR MEJORÍA CLÍNICA Y ALTA MÉDICA. SE DEJA TRAZABILIDAD DE LA EVOLUCIÓN DEL CASO Y SE CIERRA EL PROCESO DE REMISIÓN.";
    default:
      return "SE CANCELA EL TRÁMITE DE REMISIÓN. SE DEJA TRAZABILIDAD DEL PROCESO.";
  }
}

// --- 14. OTRO ---
export function generarPlantillaOtroSeg(cual: string, estadoSolicitud: string): string {
  let t = `SE DEJA TRAZABILIDAD DE SEGUIMIENTO REALIZADO POR REFERENCIA Y CONTRARREFERENCIA: ${ph(
    cual,
    "CUÁL",
  )}.`;
  if (estadoSolicitud.trim()) t += ` ESTADO DE LA SOLICITUD: ${estadoSolicitud.trim().toUpperCase()}.`;
  return t;
}

// --- 15. NUEVO RADICADO ADICIONAL ---
export function generarPlantillaNuevoRadicado(anterior: string, nuevo: string): string {
  const a = ph(anterior, "RADICADO ANTERIOR");
  const n = ph(nuevo, "NUEVO RADICADO");
  return `SE DEJA TRAZABILIDAD DE LA ASIGNACIÓN DE UN NUEVO NÚMERO DE RADICADO PARA EL TRÁMITE DE REMISIÓN. RADICADO ANTERIOR: ${a}. NUEVO RADICADO: ${n}.`;
}

// --- 16. REVISIÓN AUTORIZACIÓN ESTANCIA HOSPITALARIA (seguimiento de trazabilidad) ---
export type AutorizacionEstanciaOpcion =
  | "CON_AUT_CON_NOTA"
  | "CON_AUT_SIN_NOTA"
  | "SIN_AUT"
  | "";

export const AUTORIZACION_ESTANCIA_OPCIONES: {
  value: Exclude<AutorizacionEstanciaOpcion, "">;
  label: string;
}[] = [
  {
    value: "CON_AUT_CON_NOTA",
    label: "CUENTA CON AUTORIZACIÓN Y NOTA DE ACERCAMIENTO DE AUTORIZACIONES (FACTURACIÓN)",
  },
  {
    value: "CON_AUT_SIN_NOTA",
    label: "CUENTA CON AUTORIZACIÓN SIN NOTA DE ACERCAMIENTO DE AUTORIZACIONES (FACTURACIÓN)",
  },
  { value: "SIN_AUT", label: "NO CUENTA CON AUTORIZACIÓN" },
];

export type RevisionAutInput = {
  opcion: AutorizacionEstanciaOpcion;
  /** Servicio actual del caso (Urgencias, UCI, Hospitalización, etc.). */
  servicio?: string;
};

export function generarPlantillaRevisionAutorizacion(i: RevisionAutInput): string {
  const serv = ph(i.servicio, "SERVICIO");
  switch (i.opcion) {
    case "CON_AUT_CON_NOTA":
      return `SE REVISA AUTORIZACIÓN DE ESTANCIA HOSPITALARIA Y/O SERVICIOS. SE EVIDENCIA AUTORIZACIÓN VIGENTE Y NOTA DE ACERCAMIENTO DEL ÁREA DE AUTORIZACIONES (FACTURACIÓN). DESDE REFERENCIA SE REALIZA ACERCAMIENTO AL SERVICIO ${serv} PARA VALIDAR LA CONTINUIDAD DEL MANEJO INTEGRAL Y DEFINIR LA PERTINENCIA DE CANCELACIÓN DEL TRÁMITE DE REMISIÓN.`;
    case "CON_AUT_SIN_NOTA":
      return "SE REVISA AUTORIZACIÓN DE ESTANCIA HOSPITALARIA Y/O SERVICIOS. SE EVIDENCIA AUTORIZACIÓN VIGENTE, SIN NOTA DE ACERCAMIENTO DEL ÁREA DE AUTORIZACIONES (FACTURACIÓN). DESDE REFERENCIA SE REALIZA ACERCAMIENTO CON EL ÁREA CORRESPONDIENTE PARA SOLICITAR LA GESTIÓN, INFORMACIÓN AL SERVICIO Y TRAZABILIDAD DEL PROCESO.";
    case "SIN_AUT":
      return "SE REVISA AUTORIZACIÓN DE ESTANCIA HOSPITALARIA Y/O SERVICIOS. NO SE EVIDENCIA AUTORIZACIÓN VIGENTE EN EL SISTEMA. DESDE REFERENCIA SE REALIZA ACERCAMIENTO CON EL ÁREA DE AUTORIZACIONES (FACTURACIÓN) PARA CONOCER EL ESTADO DE LA SOLICITUD Y DAR CONTINUIDAD A LA TRAZABILIDAD DEL CASO.";
    default:
      return "SE REALIZA REVISIÓN DE AUTORIZACIÓN DE ESTANCIA HOSPITALARIA PARA CANCELACIÓN DEL TRÁMITE DE REMISIÓN.";
  }
}

// ---------------------------------------------------------------------------
// Derivación del tipo de trámite (ya no se selecciona manualmente).
// Se infiere desde "REMISIÓN POR" y el tipo de entidad del catálogo EAPB/ERP.
// ---------------------------------------------------------------------------
export function derivarTipoTramite(remisionPor: string, tipoEntidad: string): string {
  if (/red\s+no\s+contratada/i.test(remisionPor || "")) {
    return "REMISIÓN POR TRÁMITE ADMINISTRATIVO CANCELABLE";
  }
  if (/aseguradora/i.test(tipoEntidad || "")) {
    return "REMISIÓN ASISTENCIAL POR SOAT";
  }
  return "REMISIÓN ASISTENCIAL";
}

/** Etiqueta corta + completa del tipo de seguimiento de revisión de autorización. */
export const REVISION_AUT_LABEL_CORTO = "REVISIÓN AUTORIZACIÓN ESTANCIA (CANCELACIÓN)";
export const REVISION_AUT_LABEL_COMPLETO =
  "REVISIÓN AUTORIZACIÓN ESTANCIA HOSPITALARIA PARA CANCELACIÓN DE TRÁMITE DE REMISIÓN";

// ===========================================================================
// PHD/PAD/O2/ESPECIALES — radicado por tipo de solicitud.
// ===========================================================================

export type RadicaFlags = {
  radica_phd?: boolean | null;
  radica_pad?: boolean | null;
  radica_oxigeno?: boolean | null;
  radica_unidad_especial?: boolean | null;
};

/**
 * Determina si la EAPB genera radicado para el tipo de solicitud especial.
 * El tipo de solicitud puede ser combinado (p.ej. "PHD + OXIGENO DOMICILIARIO").
 */
export function phdGeneraCodigo(tipoSolicitud: string, flags: RadicaFlags | null | undefined): boolean {
  if (!flags) return false;
  const s = (tipoSolicitud || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
  let aplica = false;
  if (/UNIDAD/.test(s)) aplica = aplica || !!flags.radica_unidad_especial;
  if (/PHD/.test(s)) aplica = aplica || !!flags.radica_phd;
  if (/PAD/.test(s)) aplica = aplica || !!flags.radica_pad;
  if (/OXIGENO|OXÍGENO/.test(s)) aplica = aplica || !!flags.radica_oxigeno;
  return aplica;
}

// ===========================================================================
// REFERENCIA INTERNA — plantillas de seguimiento (texto plano).
// ===========================================================================

export function generarPlantillaRefInternaPendiente(i: {
  funcionario?: string;
  cargo?: string;
}): string {
  let t =
    "SE DEJA TRAZABILIDAD DE LA GESTIÓN DE REFERENCIA INTERNA, LA CUAL SE ENCUENTRA PENDIENTE DE COORDINACIÓN DE FECHA Y HORA DEL EXAMEN.";
  const f = (i.funcionario || "").trim();
  const c = (i.cargo || "").trim();
  if (f || c) {
    t += ` SE REALIZA ACERCAMIENTO CON ${f ? f.toUpperCase() : "[FUNCIONARIO]"}`;
    if (c) t += ` (${c.toUpperCase()})`;
    t += ", QUIEN QUEDA A CARGO DE LA COORDINACIÓN.";
  }
  return t;
}

export function generarPlantillaRefInternaCoordinado(i: {
  fecha?: string;
  hora?: string;
  informoAmbulancia?: boolean;
  informoServicio?: boolean;
}): string {
  const f = ph(i.fecha, "FECHA");
  const h = ph(i.hora, "HORA");
  let t = `SE DEJA TRAZABILIDAD DE QUE EL EXAMEN DE REFERENCIA INTERNA QUEDÓ COORDINADO PARA EL DÍA ${f} A LAS ${h}.`;
  const avisos: string[] = [];
  if (i.informoAmbulancia) avisos.push("A LA AMBULANCIA");
  if (i.informoServicio) avisos.push("AL SERVICIO");
  if (avisos.length > 0) {
    t += ` YA SE INFORMÓ ${avisos.join(" Y ")} SOBRE LA PROGRAMACIÓN.`;
  }
  return t;
}

export function generarPlantillaRefInternaCulminacion(): string {
  return "SE CULMINA LA SOLICITUD DE REFERENCIA INTERNA. SE DEJA TRAZABILIDAD DEL CIERRE DEL PROCESO.";
}

// ===========================================================================
// PENDIENTES — plantillas de cumplimiento (texto plano).
// ===========================================================================

export function generarPlantillaPendienteCumplimiento(
  completo: boolean,
  observaciones?: string | null,
): string {
  let t = completo
    ? "SE DEJA TRAZABILIDAD DEL CUMPLIMIENTO COMPLETO DEL PENDIENTE. SE CIERRA Y ARCHIVA EL CASO."
    : "SE DEJA TRAZABILIDAD DEL CUMPLIMIENTO PARCIAL DEL PENDIENTE. EL CASO CONTINÚA ACTIVO PARA SU SEGUIMIENTO.";
  const obs = (observaciones || "").trim();
  if (obs) t += `\n\nOBSERVACIONES: ${obs}`;
  return t;
}

