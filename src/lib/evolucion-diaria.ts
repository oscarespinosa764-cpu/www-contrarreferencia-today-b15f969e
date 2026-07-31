// ---------------------------------------------------------------------------
// FASE 5E · Bloque C.3 — RESOLVER ÚNICO de cumplimiento de EVOLUCIÓN DIARIA.
//
// Fuente de verdad ÚNICA (pura, sin secretos ni imports de servidor) que
// combina en un solo cálculo:
//   - canales requeridos por el catálogo EAPB/ERP;
//   - canales realizados en CANAL DE GESTIÓN (única fuente editable);
//   - estado de funcionamiento de la plataforma;
//   - especialidades tratantes requeridas y evolucionadas;
//   - excepción operativa NUEVA EPS + RED NO CONTRATADA;
//   - pendientes reales y estado final único.
//
// El frontend usa este resolver para mostrar UN solo badge; el servidor
// (trigger private.seguimientos_evolucion_guard) recalcula la misma regla y
// sobreescribe lo persistido: el cliente nunca es autoridad.
// ---------------------------------------------------------------------------
import { CANAL_CODES } from "./canal-gestion";
import { normalizeForSearch } from "./text-normalize";

export type EstadoCumplimiento = "SIN_EVOLUCIONAR" | "EVOLUCION_PARCIAL" | "EVOLUCIONADO";

export type VarianteIndigo = "GENERAL" | "EXCEPCION_PLATAFORMA" | "EXCEPCION_CORREO";

export const EVO_ESTADO_LABEL: Record<EstadoCumplimiento, string> = {
  SIN_EVOLUCIONAR: "SIN EVOLUCIONAR",
  EVOLUCION_PARCIAL: "EVOLUCIÓN PARCIAL",
  EVOLUCIONADO: "EVOLUCIONADO",
};

export const EVO_ESTADO_META: Record<EstadoCumplimiento, { chip: string; dot: string }> = {
  SIN_EVOLUCIONAR: { chip: "bg-muted text-muted-foreground", dot: "bg-muted-foreground" },
  EVOLUCION_PARCIAL: { chip: "bg-status-amber/15 text-status-amber", dot: "bg-status-amber" },
  EVOLUCIONADO: { chip: "bg-status-green/15 text-status-green", dot: "bg-status-green" },
};

export const CANAL_LABEL_EVO: Record<string, string> = {
  [CANAL_CODES.CORREO]: "CORREO ELECTRÓNICO",
  [CANAL_CODES.PLATAFORMA]: "PLATAFORMA WEB",
};

/** Texto exacto exigido para la excepción con plataforma disponible. */
export const INDIGO_EXCEPCION_PLATAFORMA =
  "SE ENVIA EVOLUCION ACTUALIZADA EN PLATAFORMA DE LA EAPB, QUEDANDO A LA ESPERA DE RESPUESTA Y DE PROBABLE AUTORIZACION DE ESTANCIA HOSPITALARIA, DEBIDO A QUE CONTAMOS CON LA CAPACIDAD TECNICO - CIENTIFICA Y ESPECIALIDAD REQUERIDA EN LA ACTUALIDAD.";

/** Texto exacto exigido para la excepción con plataforma fuera de servicio. */
export const INDIGO_EXCEPCION_CORREO =
  "SE ENVIA EVOLUCION ACTUALIZADA POR CORREO ELECTRONICO A LA EAPB DEBIDO A QUE LA PLATAFORMA PRESENTA FALLA, QUEDANDO A LA ESPERA DE FUNCIONAMIENTO DE LA MISMA PARA ENVIARLA Y DE RESPUESTA Y DE PROBABLE AUTORIZACION DE ESTANCIA HOSPITALARIA, DEBIDO A QUE CONTAMOS CON LA CAPACIDAD TECNICO - CIENTIFICA Y ESPECIALIDAD REQUERIDA EN LA ACTUALIDAD.";

export const MOTIVO_PLATAFORMA_NO_FUNCIONAL = "PLATAFORMA EAPB NO FUNCIONAL";

/**
 * Allowlist estricta de alias canónicos de NUEVA EPS tal como existen en el
 * catálogo real (`public.catalogos`, tipo EAPB). NO se usan coincidencias
 * parciales: el texto normalizado debe ser exactamente uno de estos alias.
 */
export const NUEVA_EPS_ALIAS = [
  "nueva eps",
  "nueva eps s.a.",
  "nueva eps sa",
  "nueva eps s a",
  "nueva eps s.a.s.",
] as const;

/** Identificación canónica (equivalencia exacta normalizada) de NUEVA EPS. */
export function esNuevaEpsCanonica(eapb: unknown): boolean {
  const n = normalizeForSearch(eapb);
  return (NUEVA_EPS_ALIAS as readonly string[]).includes(n);
}

/** Identificación canónica (exacta normalizada) de RED NO CONTRATADA. */
export function esRedNoContratadaCanonica(remisionPor: unknown): boolean {
  return normalizeForSearch(remisionPor) === "red no contratada";
}

/**
 * Normalización canónica de nombre de EAPB/ERP para comparar contra el
 * catálogo: sin tildes, mayúsculas, espacios colapsados. NO se usa para
 * persistir ni para mostrar.
 */
export function normEapb(v: unknown): string {
  return normalizeForSearch(v).replace(/\s+/g, " ").trim();
}

export type ResolucionEapbCatalogo<T> = {
  fila: T | null;
  /** Motivo técnico cuando no se resolvió (fail-closed, para la UI). */
  motivo:
    | null
    | "SIN_EAPB"
    | "SIN_COINCIDENCIA_CATALOGO"
    | "MULTIPLES_COINCIDENCIAS";
};

/**
 * Resuelve el registro ACTIVO ÚNICO del catálogo EAPB que corresponde al texto
 * real del caso. Orden estricto:
 *   1) equivalencia exacta normalizada;
 *   2) allowlist canónica de alias (NUEVA EPS) cuando no hubo coincidencia.
 * Nunca usa coincidencias parciales ni toma "el primero" de varios.
 */
export function resolverEapbCatalogo<T extends { valor: string }>(
  nombre: unknown,
  filas: readonly T[],
): ResolucionEapbCatalogo<T> {
  const n = normEapb(nombre);
  if (!n) return { fila: null, motivo: "SIN_EAPB" };

  const exactas = filas.filter((f) => normEapb(f.valor) === n);
  if (exactas.length === 1) return { fila: exactas[0], motivo: null };
  if (exactas.length > 1) return { fila: null, motivo: "MULTIPLES_COINCIDENCIAS" };

  if (esNuevaEpsCanonica(nombre)) {
    const alias = filas.filter((f) => esNuevaEpsCanonica(f.valor));
    if (alias.length === 1) return { fila: alias[0], motivo: null };
    if (alias.length > 1) return { fila: null, motivo: "MULTIPLES_COINCIDENCIAS" };
  }

  return { fila: null, motivo: "SIN_COINCIDENCIA_CATALOGO" };
}


export type ResultadoExcepcion = {
  aplica: boolean;
  eapbCanonica: string | null;
  remisionPorCanonica: string | null;
  motivoNoAplica: string | null;
};

/**
 * Función canónica ÚNICA de la excepción NUEVA EPS + RED NO CONTRATADA.
 * El servidor recalcula la misma tabla de verdad; el cliente nunca es
 * autoridad.
 */
export function resolverExcepcionNuevaEpsRedNoContratada(args: {
  modulo: string;
  esEvolucionDiaria: boolean;
  eapb: unknown;
  remisionPor: unknown;
  correoRequerido: boolean;
  plataformaRequerida: boolean;
}): ResultadoExcepcion {
  const eapbOk = esNuevaEpsCanonica(args.eapb);
  const redOk = esRedNoContratadaCanonica(args.remisionPor);
  const base = {
    eapbCanonica: eapbOk ? "NUEVA EPS" : null,
    remisionPorCanonica: redOk ? "RED NO CONTRATADA" : null,
  };
  let motivo: string | null = null;
  if (args.modulo !== "remision") motivo = "MODULO_NO_APLICA";
  else if (!args.esEvolucionDiaria) motivo = "TIPO_NO_ES_EVOLUCION_DIARIA";
  else if (!eapbOk) motivo = "EAPB_NO_ES_NUEVA_EPS";
  else if (!redOk) motivo = "REMISION_POR_NO_ES_RED_NO_CONTRATADA";
  else if (!args.correoRequerido || !args.plataformaRequerida)
    motivo = "CATALOGO_NO_EXIGE_CORREO_Y_PLATAFORMA";
  return { aplica: motivo === null, motivoNoAplica: motivo, ...base };
}


export type CumplimientoEvolucionInput = {
  /** Regla operativa del catálogo EAPB: EVOLUCIÓN POR CORREO ELECTRÓNICO. */
  correoRequerido: boolean;
  /** Regla operativa del catálogo EAPB: EVOLUCIÓN EN PLATAFORMA WEB. */
  plataformaRequerida: boolean;
  /** Códigos de canal seleccionados en CANAL DE GESTIÓN. */
  canalesRealizados: string[];
  /** Respuesta del selector ¿PLATAFORMA EAPB FUNCIONANDO? */
  plataformaFuncionando: boolean | null;
  especialidadesRequeridas: string[];
  especialidadesEvolucionadas: string[];
  /** Excepción: resueltos desde datos reales del caso, nunca desde labels. */
  esNuevaEps?: boolean;
  esRedNoContratada?: boolean;
  /** Evidencia estructurada válida acumulada dentro del mismo ciclo. */
  canalesPreviosCiclo?: string[];
  especialidadesPreviasCiclo?: string[];
  motivoPendiente?: string | null;
};

export type CumplimientoEvolucion = {
  estado: EstadoCumplimiento;
  canales_requeridos: string[];
  canales_exigibles: string[];
  canales_realizados: string[];
  canales_pendientes: string[];
  canales_exentos: string[];
  especialidades_requeridas: string[];
  especialidades_evolucionadas: string[];
  especialidades_pendientes: string[];
  plataforma_funcionando: boolean | null;
  excepcion_aplicada: null | "NUEVA_EPS_RED_NO_CONTRATADA";
  plataforma_pendiente_por_falla: boolean;
  motivo_pendiente: string | null;
  variante_indigo: VarianteIndigo;
  /** Errores bloqueantes de coherencia (se validan también en servidor). */
  errores: string[];
};

const upper = (s: string) => (s || "").trim().toUpperCase();

export function resolverCumplimientoEvolucionDiaria(
  i: CumplimientoEvolucionInput,
): CumplimientoEvolucion {
  const C = CANAL_CODES.CORREO;
  const P = CANAL_CODES.PLATAFORMA;

  const requeridos: string[] = [];
  if (i.correoRequerido) requeridos.push(C);
  if (i.plataformaRequerida) requeridos.push(P);
  // Fase 5E · C.5: cuando la EAPB/ERP no declara ninguna regla operativa NO se
  // inventa un canal exigible (antes se forzaba CORREO por defecto).

  const realizadosSet: Set<string> = new Set(
    [...(i.canalesPreviosCiclo ?? []), ...(i.canalesRealizados ?? [])]
      .map(upper)
      .filter((c) => c === C || c === P),
  );
  const realizados = requeridos.filter((c) => realizadosSet.has(c));

  const requeridasEsp = (i.especialidadesRequeridas ?? []).map(upper).filter(Boolean);
  const evolucionadasSet: Set<string> = new Set(
    [...(i.especialidadesPreviasCiclo ?? []), ...(i.especialidadesEvolucionadas ?? [])].map(upper),
  );
  const especialidades_evolucionadas = requeridasEsp.filter((e) => evolucionadasSet.has(e));
  const especialidades_pendientes = requeridasEsp.filter((e) => !evolucionadasSet.has(e));

  const errores: string[] = [];
  // Contradicción: la plataforma no funciona pero se declara realizada.
  if (i.plataformaRequerida && i.plataformaFuncionando === false && realizadosSet.has(P)) {
    errores.push(
      "No puede registrar PLATAFORMA WEB como realizada cuando indicó que la plataforma no está funcionando.",
    );
  }
  if (i.plataformaRequerida && i.plataformaFuncionando == null) {
    errores.push("Indique si la plataforma de la EAPB está funcionando.");
  }
  if (realizados.length === 0 && (i.canalesRealizados ?? []).length === 0) {
    errores.push("Seleccione el canal de gestión utilizado para la evolución.");
  }

  // --- Excepción canónica NUEVA EPS + RED NO CONTRATADA ---------------------
  const excepcionElegible =
    i.esNuevaEps === true &&
    i.esRedNoContratada === true &&
    i.correoRequerido === true &&
    i.plataformaRequerida === true;

  const canales_exentos: string[] = [];
  let excepcion_aplicada: CumplimientoEvolucion["excepcion_aplicada"] = null;
  let variante_indigo: VarianteIndigo = "GENERAL";

  if (excepcionElegible) {
    if (i.plataformaFuncionando === true && realizadosSet.has(P)) {
      canales_exentos.push(C);
      excepcion_aplicada = "NUEVA_EPS_RED_NO_CONTRATADA";
      variante_indigo = "EXCEPCION_PLATAFORMA";
    } else if (
      i.plataformaFuncionando === false &&
      realizadosSet.has(C) &&
      !realizadosSet.has(P)
    ) {
      canales_exentos.push(P);
      excepcion_aplicada = "NUEVA_EPS_RED_NO_CONTRATADA";
      variante_indigo = "EXCEPCION_CORREO";
    }
  }

  const canales_exigibles = requeridos.filter((c) => !canales_exentos.includes(c));
  const canales_pendientes = canales_exigibles.filter((c) => !realizadosSet.has(c));

  const plataforma_pendiente_por_falla =
    i.plataformaRequerida === true && i.plataformaFuncionando === false && !realizadosSet.has(P);

  let motivo_pendiente: string | null =
    (i.motivoPendiente ?? "").trim().toUpperCase() || null;
  if (plataforma_pendiente_por_falla && !motivo_pendiente) {
    motivo_pendiente = MOTIVO_PLATAFORMA_NO_FUNCIONAL;
  }
  if (!plataforma_pendiente_por_falla && motivo_pendiente === MOTIVO_PLATAFORMA_NO_FUNCIONAL) {
    motivo_pendiente = canales_pendientes.length > 0 ? motivo_pendiente : null;
  }

  const algunaGestion =
    realizados.length > 0 ||
    especialidades_evolucionadas.length > 0 ||
    (i.canalesRealizados ?? []).length > 0;

  let estado: EstadoCumplimiento;
  if (!algunaGestion) estado = "SIN_EVOLUCIONAR";
  else if (canales_pendientes.length === 0 && especialidades_pendientes.length === 0)
    estado = "EVOLUCIONADO";
  else estado = "EVOLUCION_PARCIAL";

  return {
    estado,
    canales_requeridos: requeridos,
    canales_exigibles,
    canales_realizados: realizados,
    canales_pendientes,
    canales_exentos,
    especialidades_requeridas: requeridasEsp,
    especialidades_evolucionadas,
    especialidades_pendientes,
    plataforma_funcionando: i.plataformaRequerida ? (i.plataformaFuncionando ?? null) : null,
    excepcion_aplicada,
    plataforma_pendiente_por_falla,
    motivo_pendiente,
    variante_indigo,
    errores,
  };
}

/** Estado por canal para el resumen informativo (no editable) del cuadro. */
export function estadoCanalEvolucion(
  r: CumplimientoEvolucion,
  canal: string,
): "REALIZADO" | "PENDIENTE" | "PENDIENTE POR FALLA" | "EXENTO" | "NO APLICA" {
  if (!r.canales_requeridos.includes(canal)) return "NO APLICA";
  if (r.canales_realizados.includes(canal)) return "REALIZADO";
  if (r.canales_exentos.includes(canal)) return "EXENTO";
  if (canal === CANAL_CODES.PLATAFORMA && r.plataforma_pendiente_por_falla)
    return "PENDIENTE POR FALLA";
  return "PENDIENTE";
}

/** Datos estructurados que se persisten dentro de `detalles` (JSONB vigente). */
export function persistirCumplimiento(r: CumplimientoEvolucion): Record<string, unknown> {
  return {
    canales_requeridos: r.canales_requeridos,
    canales_realizados: r.canales_realizados,
    canales_pendientes: r.canales_pendientes,
    canales_exentos: r.canales_exentos,
    plataforma_funcionando: r.plataforma_funcionando,
    especialidades_requeridas: r.especialidades_requeridas,
    especialidades_evolucionadas: r.especialidades_evolucionadas,
    especialidades_pendientes: r.especialidades_pendientes,
    estado_cumplimiento: r.estado,
    excepcion_aplicada: r.excepcion_aplicada,
    motivo_pendiente: r.motivo_pendiente,
    plataforma_pendiente_por_falla: r.plataforma_pendiente_por_falla || null,
  };
}
