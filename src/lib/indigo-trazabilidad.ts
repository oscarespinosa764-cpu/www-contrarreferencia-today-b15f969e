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
