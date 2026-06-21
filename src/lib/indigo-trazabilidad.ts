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
