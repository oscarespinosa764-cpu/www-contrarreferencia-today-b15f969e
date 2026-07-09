// ══════════════════════════════════════════════════════════════════
//  Negación (Registrar nuevo caso) — motivos, submotivos, documentos
//  y plantillas de texto construidas en cliente.
//
//  IMPORTANTE: solo genera TEXTO plano. El escapado/seguridad de HTML lo
//  aplica buildOficioHTML / OficioPreview al renderizar. No interpolar HTML.
// ══════════════════════════════════════════════════════════════════

// ── Tipo de entidad responsable (clasificación explícita, NO por texto) ──
export type EntidadTipo = "EPS" | "SOAT-ADRES" | "ARL";

// ── Motivos principales de negación (valor interno estable) ──
export type MotivoNeg =
  | "RED_NO_CONTRATADA"
  | "SOLICITUD_DOCUMENTACION"
  | "NO_RECURSO_HUMANO"
  | "NO_DISPONIBILIDAD_UNIDAD"
  | "SOBREOCUPACION"
  | "NIVEL_COMPLEJIDAD"
  | "ARL_DIRECTO";

export interface MotivoDef {
  value: MotivoNeg;
  label: string;
  /** Si se define, solo aparece cuando la entidad responsable es de este tipo. */
  soloEntidad?: EntidadTipo;
}

export const MOTIVOS_NEG: MotivoDef[] = [
  { value: "RED_NO_CONTRATADA", label: "RED NO CONTRATADA" },
  { value: "SOLICITUD_DOCUMENTACION", label: "SOLICITUD DE DOCUMENTACIÓN" },
  { value: "NO_RECURSO_HUMANO", label: "NO RECURSO HUMANO" },
  { value: "NO_DISPONIBILIDAD_UNIDAD", label: "NO DISPONIBILIDAD DE UNIDAD" },
  { value: "SOBREOCUPACION", label: "NO DISPONIBILIDAD DE CAMAS POR SOBREOCUPACIÓN" },
  { value: "NIVEL_COMPLEJIDAD", label: "POR NIVEL DE COMPLEJIDAD" },
  { value: "ARL_DIRECTO", label: "ARL COMENTE CASO DIRECTAMENTE", soloEntidad: "ARL" },
];

export const MOTIVO_NEG_LABEL: Record<string, string> = Object.fromEntries(
  MOTIVOS_NEG.map((m) => [m.value, m.label]),
);

// Mapea el valor interno al nombre de categoría del catálogo de plantillas
// (para reutilizar las plantillas ya existentes en los motivos sin cambios).
export const MOTIVO_NEG_CATALOGO: Partial<Record<MotivoNeg, string>> = {
  RED_NO_CONTRATADA: "RED NO CONTRATADA",
  NO_RECURSO_HUMANO: "NO RECURSO HUMANO",
  NO_DISPONIBILIDAD_UNIDAD: "NO DISPONIBILIDAD DE UNIDAD",
  SOBREOCUPACION: "NO DISPONIBILIDAD DE CAMAS POR SOBREOCUPACIÓN",
};

// ── Subtipos de SOLICITUD DE DOCUMENTACIÓN ──
export type DocSubtipo =
  | "DOCUMENTACION_EPS"
  | "AFILIACION_OFICIO"
  | "DOCUMENTACION_SOAT_ADRES_POLIZA";

export const DOC_SUBTIPOS: { value: DocSubtipo; label: string }[] = [
  { value: "DOCUMENTACION_EPS", label: "DOCUMENTACIÓN EPS" },
  { value: "AFILIACION_OFICIO", label: "AFILIACIÓN DE OFICIO" },
  { value: "DOCUMENTACION_SOAT_ADRES_POLIZA", label: "DOCUMENTACIÓN SOAT / ADRES / PÓLIZA ESTUDIANTIL" },
];

export const DOC_SUBTIPO_LABEL: Record<string, string> = Object.fromEntries(
  DOC_SUBTIPOS.map((d) => [d.value, d.label]),
);

// Casillas de documentos (id estable → texto que aparece en la plantilla).
export interface DocItem {
  id: string;
  texto: string;
}

export const DOCS_EPS: DocItem[] = [
  { id: "epicrisis", texto: "Epicrisis completa." },
  { id: "apoyos", texto: "Apoyos diagnósticos (Imágenes y/o Laboratorios)." },
  { id: "anexo", texto: "Anexo de referencia." },
];

export const DOCS_SOAT: DocItem[] = [
  { id: "epicrisis", texto: "Epicrisis completa." },
  { id: "apoyos", texto: "Apoyos diagnósticos (Imágenes y/o Laboratorios)." },
  { id: "anexo", texto: "Anexo de referencia." },
  { id: "id_conductor", texto: "Copias de documentos de identidad del conductor y/o accidentado." },
  { id: "tarjeta_prop", texto: "Tarjeta de propiedad del vehículo involucrado." },
  { id: "declaracion", texto: "Declaración juramentada." },
  { id: "soat_runt", texto: "SOAT o RUNT." },
  { id: "reporte_accidente", texto: "Reporte de accidente de tránsito, realizado por la autoridad competente." },
  { id: "prefactura_remitente", texto: "Pre-factura de gastos incurridos en la institución remitente." },
  {
    id: "prefactura_primaria",
    texto:
      "Pre-factura de gastos incurridos en la institución donde recibió atención primaria, cuando corresponda.",
  },
  {
    id: "historia_primaria",
    texto:
      "Historia clínica del centro asistencial donde recibió atención primaria, cuando corresponda.",
  },
];

// ── Subtipos de RED NO CONTRATADA ──
export type RedSubtipo = "SERVICIO" | "CONJUNTO";
export const RED_SUBTIPOS: { value: RedSubtipo; label: string }[] = [
  { value: "SERVICIO", label: "RED NO CONTRATADA PARA EL SERVICIO O ESPECIALIDAD SOLICITADA" },
  {
    value: "CONJUNTO",
    label: "RED NO CONTRATADA PARA MANEJO CONJUNTO CON ESPECIALIDADES FUERA DE LA RED",
  },
];

// ── Subtipos de MAYOR COMPLEJIDAD ──
export type ComplejidadSub = "CON_ESP" | "SIN_ESP";

// ── Helpers de texto ──
/** Une una lista para redacción: "A, B y C". */
export function unirEspecialidades(items: string[]): string {
  const xs = items.map((s) => s.trim()).filter(Boolean);
  if (xs.length === 0) return "";
  if (xs.length === 1) return xs[0];
  return `${xs.slice(0, -1).join(", ")} y ${xs[xs.length - 1]}`;
}

/** Bloque de observaciones (solo si hay contenido), antes de "Cordialmente;". */
function bloqueObs(obs?: string): string {
  const t = (obs || "").trim();
  return t ? `\n${t}\n` : "";
}

const NOTA_EPS =
  "NOTA: FAVOR ENVIAR LA INFORMACIÓN SOLICITADA PARA PODER COMENTAR AL MÉDICO DE TURNO, PERO ESTO NO ES UN CORREO DE ACEPTACIÓN.";
const NOTA_SOAT =
  "NOTA: FAVOR ENVIAR LA INFORMACIÓN SOLICITADA, EL CASO YA SE ESTÁ COMENTANDO AL MÉDICO DE TURNO, PERO ESTO NO ES UN CORREO DE ACEPTACIÓN.";

function plantillaDocumentos(titulo: string, nota: string, docs: string[], obs?: string): string {
  const lista = docs.map((d) => `• ${d}`).join("\n");
  return [
    `${titulo}`,
    "",
    "Cordial saludo,",
    "",
    "Tras revisar la solicitud, se informa que falta la siguiente documentación, la cual es requerida:",
    "",
    lista,
    "",
    nota,
    bloqueObs(obs),
    "Cordialmente;",
  ].join("\n");
}

export function plantillaDocEps(docsSeleccionados: string[], obs?: string): string {
  return plantillaDocumentos("DOCUMENTOS (EPS):", NOTA_EPS, docsSeleccionados, obs);
}

export function plantillaDocSoat(docsSeleccionados: string[], obs?: string): string {
  return plantillaDocumentos(
    "DOCUMENTOS (SOAT / ADRES / PÓLIZA ESTUDIANTIL):",
    NOTA_SOAT,
    docsSeleccionados,
    obs,
  );
}

export function plantillaArlDirecto(codigo: string, obs?: string): string {
  return [
    "ARL COMENTE DIRECTAMENTE:",
    "",
    "Cordial saludo,",
    "",
    `Paciente *NO ACEPTADO*, con el código *${codigo}*.`,
    "",
    "Para continuar con el proceso de remisión, la ARL deberá comentar el caso directamente. Quedamos atentos.",
    bloqueObs(obs),
    "Cordialmente;",
  ].join("\n");
}

export function plantillaRedConjunto(d: {
  codigo: string;
  ips: string;
  profesional: string;
  espProfesional: string;
  espPrincipal: string;
  especialidadesExtra: string[];
  obs?: string;
}): string {
  const extra = unirEspecialidades(d.especialidadesExtra);
  const profesional = [d.profesional.trim(), d.espProfesional.trim()].filter(Boolean).join(" — ");
  return [
    "Cordial saludo,",
    "",
    `Paciente *NO ACEPTADO*, con el código *${d.codigo}*.`,
    "",
    `Señores ${d.ips || "[IPS REMITENTE]"}, agradecemos su comunicación y la confianza depositada en nuestra institución para atender su solicitud.`,
    "",
    `Una vez realizada la verificación del caso del usuario en trámite de remisión por parte de ${profesional || "el profesional que revisa"}, informamos que en el momento no se puede dar aceptación debido a que el paciente requiere manejo conjunto por las especialidades de ${extra || "[ESPECIALIDADES FUERA DE LA RED]"}, las cuales no se encuentran incluidas dentro de la red o contratación establecida.`,
    "",
    `Se solicita comentar nuevamente al paciente cuando solo requiera manejo por la especialidad de ${d.espPrincipal || "[ESPECIALIDAD PRINCIPAL]"}.`,
    "",
    "Sugerimos canalizar la remisión a través de la EAPB, solicitando una gestión oportuna dentro de su red prestadora, garantizando la disponibilidad de una IPS con capacidad técnico-científica para la continuidad de su manejo integral.",
    bloqueObs(d.obs),
    "Agradecemos su comprensión.",
    "",
    "Cordialmente;",
  ].join("\n");
}

export function plantillaMayorConEsp(codigo: string, especialidad: string, obs?: string): string {
  return [
    "Cordial saludo,",
    "",
    `Paciente *NO ACEPTADO*, con el código *${codigo}*.`,
    "",
    `Tras la revisión del caso, se informa que el paciente requiere atención en una institución de mayor nivel de complejidad para la especialidad de ${especialidad || "[ESPECIALIDAD]"}, la cual no se encuentra disponible en nuestra institución.`,
    "",
    "Sugerimos canalizar la remisión a través de la EAPB y su red prestadora, garantizando la continuidad de su manejo integral.",
    bloqueObs(obs),
    "Cordialmente;",
  ].join("\n");
}

export function plantillaMayorSinEsp(codigo: string, obs?: string): string {
  return [
    "Cordial saludo,",
    "",
    `Paciente *NO ACEPTADO*, con el código *${codigo}*.`,
    "",
    "Tras la revisión del caso, se informa que el paciente requiere atención en una institución de mayor nivel de complejidad, con capacidad técnico-científica y recursos suficientes para garantizar la continuidad de su manejo integral.",
    "",
    "Sugerimos canalizar la remisión a través de la EAPB y su red prestadora.",
    bloqueObs(obs),
    "Cordialmente;",
  ].join("\n");
}

// ── Plantillas CRUE (incluyen funcionario, unidad, especialidades y motivos) ──
export function plantillaCrueBase(d: {
  subtipoLabel: string;
  codigo: string;
  codigoCrue: string;
  ips: string;
  nombreFuncionario: string;
  cargoFuncionario: string;
  unidad?: string;
  especialidades?: string[];
  motivos?: string[];
  obs?: string;
  cierre: string;
}): string {
  const lineas: string[] = [
    `${d.subtipoLabel}:`,
    "",
    "Cordial saludo,",
    "",
    `Código de gestión: *${d.codigo}*.`,
  ];
  if (d.codigoCrue.trim()) lineas.push(`Código CRUE: ${d.codigoCrue.trim()}.`);
  if (d.ips.trim()) lineas.push(`IPS: ${d.ips.trim()}.`);
  lineas.push(
    `Funcionario que reporta: ${d.nombreFuncionario.trim()}${
      d.cargoFuncionario.trim() ? ` — ${d.cargoFuncionario.trim()}` : ""
    }.`,
  );
  if (d.unidad && d.unidad.trim()) lineas.push(`Unidad: ${d.unidad.trim()}.`);
  const esps = (d.especialidades || []).map((e) => e.trim()).filter(Boolean);
  if (esps.length) {
    lineas.push("", "Especialidad(es) requerida(s):", ...esps.map((e) => `• ${e}`));
  }
  const mots = (d.motivos || []).map((m) => m.trim()).filter(Boolean);
  if (mots.length) {
    lineas.push("", "Motivo(s) de negación del direccionamiento:", ...mots.map((m) => `• ${m}`));
  }
  lineas.push("", d.cierre);
  lineas.push(bloqueObs(d.obs), "Cordialmente;");
  return lineas.join("\n");
}
