// ---------------------------------------------------------------------------
// Importación de RED / DISPONIBILIDAD (multi-hoja).
// Módulo puro y client-safe: define las hojas de la plantilla, el mapeo de
// cada fila a la tabla `red_operativa` y la clave de deduplicación.
// Se usa tanto en el cliente (generar plantilla / previsualizar) como en el
// servidor (validar + guardar), para mantener una sola fuente de verdad.
// ---------------------------------------------------------------------------

export type HojaRedKey =
  | "IPS"
  | "AMBULANCIAS"
  | "JORNADAS"
  | "CODIGOS_TEP"
  | "ESPECIALIDADES_CEDIM"
  | "DIRECTORIO_EAPB_EPS"
  | "DIRECTORIO_CRUE"
  | "LINEAS_EMERGENCIA"
  | "RECURSOS_REFERENCIA"
  | "DATOS_GENERALES_CEDIM"
  | "SEDES_CEDIM"
  | "DIRECTORIO_INTERNO_CEDIM";

export const HOJAS_RED_ORDEN: HojaRedKey[] = [
  "IPS",
  "AMBULANCIAS",
  "JORNADAS",
  "CODIGOS_TEP",
  "ESPECIALIDADES_CEDIM",
  "DIRECTORIO_EAPB_EPS",
  "DIRECTORIO_CRUE",
  "LINEAS_EMERGENCIA",
  "RECURSOS_REFERENCIA",
  "DATOS_GENERALES_CEDIM",
  "SEDES_CEDIM",
  "DIRECTORIO_INTERNO_CEDIM",
];


// Columnas exactas de cada hoja de la plantilla base.
export const COLUMNAS_RED: Record<HojaRedKey, string[]> = {
  IPS: [
    "tipo_ips", "nombre_ips", "nit", "departamento", "ciudad", "direccion",
    "correo", "telefonos", "contactos", "cargo_contacto", "especialidades",
    "servicios", "eapb_aseguradoras", "observaciones", "estado",
    "disponibilidad_operativa",
  ],
  AMBULANCIAS: [
    "tipo_empresa", "nombre_empresa", "nit", "departamento", "ciudad",
    "direccion", "correo", "telefonos", "contactos", "cargo_contacto",
    "tipos_ambulancia", "servicios", "cobertura_recorridos",
    "eapb_aseguradoras", "cups_asociados", "observaciones", "estado",
    "disponibilidad_operativa",
  ],
  JORNADAS: [
    "especialidad", "fecha_inicio", "fecha_fin", "ips", "ciudad",
    "departamento", "medico_profesional", "jornada", "horario", "contacto",
    "telefono", "correo", "observaciones", "estado",
  ],
  CODIGOS_TEP: [
    "empresa_tep", "tipo_ambulancia", "recorrido_cobertura", "codigo_cups",
    "descripcion_cups", "eapb_aseguradora", "vigencia_desde", "vigencia_hasta",
    "observaciones", "estado",
  ],
  ESPECIALIDADES_CEDIM: [
    "especialidad", "profesional_medico", "jornada", "horario", "sede",
    "servicio", "telefono", "correo", "disponibilidad", "observaciones",
    "estado",
  ],
  DIRECTORIO_EAPB_EPS: [
    "tipo_entidad", "nombre_entidad", "departamento", "ciudad", "nombre_contacto",
    "unidad_cargo", "telefono_principal", "telefonos_alternos", "extension",
    "correo", "direccion", "observaciones", "estado",
  ],
  DIRECTORIO_CRUE: [
    "nombre_crue", "departamento", "ciudad", "indicativo", "nombre_contacto",
    "cargo", "direccion", "telefono_principal", "telefonos_alternos",
    "correo_principal", "correos_alternos", "cobertura", "observaciones", "estado",
  ],
  LINEAS_EMERGENCIA: [
    "entidad", "tipo_entidad", "departamento", "municipio", "nombre_contacto",
    "cargo_dependencia", "telefono_principal", "telefonos_alternos", "correo",
    "cobertura", "observaciones", "estado",
  ],
  RECURSOS_REFERENCIA: [
    "categoria", "entidad", "nombre_recurso", "descripcion", "tipo_recurso",
    "url", "correo", "telefono", "observaciones", "orden_visualizacion", "estado",
  ],
  DATOS_GENERALES_CEDIM: [
    "nombre_institucion", "indicativo", "telefono_general", "extension_referencia",
    "correo_referencia", "direccion_principal", "ciudad", "departamento",
    "horario_atencion", "observaciones", "estado",
  ],
  SEDES_CEDIM: [
    "nombre_sede", "tipo_sede", "direccion", "ciudad", "departamento",
    "telefono_principal", "extension_principal", "correo_institucional",
    "horario_atencion", "servicios", "observaciones", "estado",
  ],
  DIRECTORIO_INTERNO_CEDIM: [
    "sede", "dependencia_area", "funcionario_responsable", "cargo", "extension",
    "opcion_menu", "telefono_directo", "correo_institucional", "observaciones", "estado",
  ],
};

// Columnas obligatorias para considerar la fila válida (identifican el registro).
const REQUERIDAS: Record<HojaRedKey, string[]> = {
  IPS: ["nombre_ips"],
  AMBULANCIAS: ["nombre_empresa"],
  JORNADAS: ["especialidad", "ips"],
  CODIGOS_TEP: ["empresa_tep", "codigo_cups"],
  ESPECIALIDADES_CEDIM: ["especialidad", "profesional_medico"],
  DIRECTORIO_EAPB_EPS: ["nombre_entidad"],
  DIRECTORIO_CRUE: ["nombre_crue"],
  LINEAS_EMERGENCIA: ["entidad"],
  RECURSOS_REFERENCIA: ["nombre_recurso"],
  DATOS_GENERALES_CEDIM: ["nombre_institucion"],
  SEDES_CEDIM: ["nombre_sede"],
  DIRECTORIO_INTERNO_CEDIM: ["dependencia_area"],
};


export const norm = (v: unknown) =>
  String(v ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "")
    .trim();

const txt = (v: unknown) => {
  const s = String(v ?? "").trim();
  return s === "" ? null : s;
};

function parseFecha(v: unknown): string | null {
  if (v == null || v === "") return null;
  if (typeof v === "number" && Number.isFinite(v)) {
    const ms = Math.round((v - 25569) * 86400 * 1000);
    const d = new Date(ms);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  const s = String(v).trim();
  const m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (m) {
    let [, d, mo, y] = m;
    if (y.length === 2) y = "20" + y;
    const dt = new Date(Number(y), Number(mo) - 1, Number(d));
    if (!Number.isNaN(dt.getTime())) return dt.toISOString();
  }
  const dt = new Date(s);
  if (!Number.isNaN(dt.getTime())) return dt.toISOString();
  return null;
}

const VERDADERO = ["true", "si", "sí", "1", "x", "activo", "disponible", "verdadero", "yes"];
function parseBool(v: unknown): boolean {
  return VERDADERO.includes(norm(v));
}

function estadoNorm(v: unknown): string {
  const s = norm(v);
  if (!s) return "activo";
  return ["inactivo", "finalizado", "suspendido"].includes(s) ? s : "activo";
}

function parseEntero(v: unknown): number | null {
  const n = Number(String(v ?? "").replace(/[^0-9-]/g, ""));
  return Number.isFinite(n) && String(v ?? "").trim() !== "" ? n : null;
}

// Normaliza el tipo de entidad EAPB/EPS a un valor de catálogo.
function tipoEntidadNorm(v: unknown): string | null {
  const s = norm(v);
  if (!s) return "EPS";
  if (s.includes("eapb")) return "EAPB";
  if (s.includes("arl")) return "ARL";
  if (s.includes("aseg")) return "Aseguradora";
  if (s.includes("eps")) return "EPS";
  return "Otra";
}

// Palabras que sugieren credenciales; están prohibidas en Recursos de referencia.
const PATRONES_CREDENCIAL = [
  "contrasena", "contraseña", "password", "clave", "token", "api_key", "apikey",
  "api key", "service_role", "secret", "credencial", "usuario_acceso", "user:", "pass:",
];

// Detecta valores que parezcan credenciales en una fila de recursos de referencia.
function detectarCredencial(f: Record<string, unknown>): string | null {
  for (const [key, val] of Object.entries(f)) {
    const hay = `${norm(key)} ${String(val ?? "").toLowerCase()}`;
    for (const p of PATRONES_CREDENCIAL) {
      if (hay.includes(p)) {
        return `No se permiten credenciales en Recursos de referencia (se detectó "${p}").`;
      }
    }
  }
  return null;
}


export type FilaRedMapeada = Record<string, unknown> & { tipo_red: string };

export type ErrorFila = {
  hoja: HojaRedKey;
  fila: number; // 1-indexado (fila de datos)
  columna: string;
  error: string;
  valor: string;
};

// Normaliza las llaves de una fila cruda (encabezados) a snake_case.
export function normalizarFila(fila: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fila)) out[norm(k)] = v;
  return out;
}

// Mapea una fila normalizada de una hoja a la estructura de `red_operativa`.
export function mapearFilaRed(
  hoja: HojaRedKey,
  f: Record<string, unknown>,
): { row: FilaRedMapeada | null; error: string | null } {
  // Requeridas
  for (const req of REQUERIDAS[hoja]) {
    if (!txt(f[req])) return { row: null, error: `Falta el valor obligatorio '${req}'.` };
  }

  if (hoja === "IPS") {
    const tipo = norm(f["tipo_ips"]);
    return {
      row: {
        tipo_red: tipo.includes("nacion") ? "ips_nacional" : "ips_departamental",
        entidad: txt(f["nombre_ips"]),
        nit: txt(f["nit"]),
        departamento: txt(f["departamento"]),
        ciudad: txt(f["ciudad"]),
        direccion: txt(f["direccion"]),
        correo: txt(f["correo"]),
        telefono: txt(f["telefonos"]),
        contacto_principal: txt(f["contactos"]),
        cargo_contacto: txt(f["cargo_contacto"]),
        servicio_especialidad:
          [txt(f["especialidades"]), txt(f["servicios"])].filter(Boolean).join(" · ") || null,
        eapb_aseguradoras: txt(f["eapb_aseguradoras"]),
        observaciones: txt(f["observaciones"]),
        estado: estadoNorm(f["estado"]),
        disponible_para_remisiones: parseBool(f["disponibilidad_operativa"]),
      },
      error: null,
    };
  }

  if (hoja === "AMBULANCIAS") {
    return {
      row: {
        tipo_red: "ambulancia_autorizacion",
        entidad: txt(f["nombre_empresa"]),
        tipo_apoyo: txt(f["tipo_empresa"]),
        nit: txt(f["nit"]),
        departamento: txt(f["departamento"]),
        ciudad: txt(f["ciudad"]),
        direccion: txt(f["direccion"]),
        correo: txt(f["correo"]),
        telefono: txt(f["telefonos"]),
        contacto_principal: txt(f["contactos"]),
        cargo_contacto: txt(f["cargo_contacto"]),
        tipo_ambulancia: txt(f["tipos_ambulancia"]),
        servicio_especialidad: txt(f["servicios"]),
        recorrido: txt(f["cobertura_recorridos"]),
        eapb_aseguradoras: txt(f["eapb_aseguradoras"]),
        cups: txt(f["cups_asociados"]),
        observaciones: txt(f["observaciones"]),
        estado: estadoNorm(f["estado"]),
        disponible_para_remisiones: parseBool(f["disponibilidad_operativa"]),
      },
      error: null,
    };
  }

  if (hoja === "JORNADAS") {
    return {
      row: {
        tipo_red: "jornada_especialidad",
        servicio_especialidad: txt(f["especialidad"]),
        fecha_inicio: parseFecha(f["fecha_inicio"]),
        fecha_final: parseFecha(f["fecha_fin"]),
        entidad: txt(f["ips"]),
        ciudad: txt(f["ciudad"]),
        departamento: txt(f["departamento"]),
        medico: txt(f["medico_profesional"]),
        jornada: txt(f["jornada"]),
        horario: txt(f["horario"]),
        contacto_principal: txt(f["contacto"]),
        telefono: txt(f["telefono"]),
        correo: txt(f["correo"]),
        observaciones: txt(f["observaciones"]),
        estado: estadoNorm(f["estado"]),
      },
      error: null,
    };
  }

  if (hoja === "CODIGOS_TEP") {
    return {
      row: {
        tipo_red: "codigo_tep",
        empresa_tep: txt(f["empresa_tep"]),
        entidad: txt(f["empresa_tep"]),
        tipo_ambulancia: txt(f["tipo_ambulancia"]),
        recorrido: txt(f["recorrido_cobertura"]),
        cups: txt(f["codigo_cups"]),
        cups_descripcion: txt(f["descripcion_cups"]),
        eapb_aseguradoras: txt(f["eapb_aseguradora"]),
        vigencia_desde: parseFecha(f["vigencia_desde"]),
        vigencia_hasta: parseFecha(f["vigencia_hasta"]),
        observaciones: txt(f["observaciones"]),
        estado: estadoNorm(f["estado"]),
      },
      error: null,
    };
  }

  if (hoja === "DIRECTORIO_EAPB_EPS") {
    return {
      row: {
        tipo_red: "eapb_eps",
        tipo_apoyo: tipoEntidadNorm(f["tipo_entidad"]),
        entidad: txt(f["nombre_entidad"]),
        departamento: txt(f["departamento"]),
        ciudad: txt(f["ciudad"]),
        contacto_principal: txt(f["nombre_contacto"]),
        cargo_contacto: txt(f["unidad_cargo"]),
        telefono: txt(f["telefono_principal"]),
        telefonos_alternos: txt(f["telefonos_alternos"]),
        codigo_principal: txt(f["extension"]),
        correo: txt(f["correo"]),
        direccion: txt(f["direccion"]),
        observaciones: txt(f["observaciones"]),
        estado: estadoNorm(f["estado"]),
      },
      error: null,
    };
  }

  if (hoja === "DIRECTORIO_CRUE") {
    return {
      row: {
        tipo_red: "crue",
        entidad: txt(f["nombre_crue"]),
        departamento: txt(f["departamento"]),
        ciudad: txt(f["ciudad"]),
        indicativo: txt(f["indicativo"]),
        contacto_principal: txt(f["nombre_contacto"]),
        cargo_contacto: txt(f["cargo"]),
        direccion: txt(f["direccion"]),
        telefono: txt(f["telefono_principal"]),
        telefonos_alternos: txt(f["telefonos_alternos"]),
        correo: txt(f["correo_principal"]),
        correos_alternos: txt(f["correos_alternos"]),
        cobertura: txt(f["cobertura"]),
        observaciones: txt(f["observaciones"]),
        estado: estadoNorm(f["estado"]),
      },
      error: null,
    };
  }

  if (hoja === "LINEAS_EMERGENCIA") {
    return {
      row: {
        tipo_red: "linea_emergencia",
        entidad: txt(f["entidad"]),
        tipo_apoyo: txt(f["tipo_entidad"]),
        departamento: txt(f["departamento"]),
        ciudad: txt(f["municipio"]),
        contacto_principal: txt(f["nombre_contacto"]),
        cargo_contacto: txt(f["cargo_dependencia"]),
        telefono: txt(f["telefono_principal"]),
        telefonos_alternos: txt(f["telefonos_alternos"]),
        correo: txt(f["correo"]),
        cobertura: txt(f["cobertura"]),
        observaciones: txt(f["observaciones"]),
        estado: estadoNorm(f["estado"]),
      },
      error: null,
    };
  }

  if (hoja === "RECURSOS_REFERENCIA") {
    // Seguridad: no permitir credenciales en recursos de referencia.
    const credErr = detectarCredencial(f);
    if (credErr) return { row: null, error: credErr };
    return {
      row: {
        tipo_red: "recurso_referencia",
        categoria: txt(f["categoria"]),
        entidad: txt(f["entidad"]),
        subcategoria: txt(f["nombre_recurso"]),
        descripcion: txt(f["descripcion"]),
        tipo_recurso: txt(f["tipo_recurso"]),
        link: txt(f["url"]),
        correo: txt(f["correo"]),
        telefono: txt(f["telefono"]),
        observaciones: txt(f["observaciones"]),
        orden_visualizacion: parseEntero(f["orden_visualizacion"]),
        estado: estadoNorm(f["estado"]),
      },
      error: null,
    };
  }

  if (hoja === "DATOS_GENERALES_CEDIM") {
    return {
      row: {
        tipo_red: "directorio_referencia",
        entidad: txt(f["nombre_institucion"]),
        indicativo: txt(f["indicativo"]),
        telefono: txt(f["telefono_general"]),
        codigo_principal: txt(f["extension_referencia"]),
        correo: txt(f["correo_referencia"]),
        direccion: txt(f["direccion_principal"]),
        ciudad: txt(f["ciudad"]),
        departamento: txt(f["departamento"]),
        horario: txt(f["horario_atencion"]),
        observaciones: txt(f["observaciones"]),
        estado: estadoNorm(f["estado"]),
      },
      error: null,
    };
  }

  if (hoja === "SEDES_CEDIM") {
    return {
      row: {
        tipo_red: "sede",
        entidad: txt(f["nombre_sede"]),
        tipo_apoyo: txt(f["tipo_sede"]),
        direccion: txt(f["direccion"]),
        ciudad: txt(f["ciudad"]),
        departamento: txt(f["departamento"]),
        telefono: txt(f["telefono_principal"]),
        codigo_principal: txt(f["extension_principal"]),
        correo: txt(f["correo_institucional"]),
        horario: txt(f["horario_atencion"]),
        servicio_especialidad: txt(f["servicios"]),
        observaciones: txt(f["observaciones"]),
        estado: estadoNorm(f["estado"]),
      },
      error: null,
    };
  }

  if (hoja === "DIRECTORIO_INTERNO_CEDIM") {
    return {
      row: {
        tipo_red: "directorio_contacto",
        sede: txt(f["sede"]),
        entidad: txt(f["dependencia_area"]),
        medico: txt(f["funcionario_responsable"]),
        cargo_contacto: txt(f["cargo"]),
        codigo_principal: txt(f["extension"]),
        opcion_menu: txt(f["opcion_menu"]),
        telefono: txt(f["telefono_directo"]),
        correo: txt(f["correo_institucional"]),
        observaciones: txt(f["observaciones"]),
        estado: estadoNorm(f["estado"]),
      },
      error: null,
    };
  }

  // ESPECIALIDADES_CEDIM

  return {
    row: {
      tipo_red: "especialista_interno",
      servicio_especialidad: txt(f["especialidad"]),
      medico: txt(f["profesional_medico"]),
      jornada: txt(f["jornada"]),
      horario: txt(f["horario"]),
      sede: txt(f["sede"]),
      tipo_apoyo: txt(f["servicio"]),
      telefono: txt(f["telefono"]),
      correo: txt(f["correo"]),
      observaciones: txt(f["observaciones"]),
      estado: estadoNorm(f["estado"]),
      disponible_para_remisiones: parseBool(f["disponibilidad"]),
    },
    error: null,
  };
}

const soloFecha = (v: unknown) => String(v ?? "").slice(0, 10);
const k = (v: unknown) => norm(v);

// Clave de deduplicación derivada del `tipo_red` y los campos mapeados.
// Funciona tanto para filas entrantes como para registros existentes en BD.
export function claveDedupRed(row: Record<string, unknown>): string {
  const tipo = String(row.tipo_red ?? "");
  const nit = txt(row.nit);
  if (tipo === "ips_nacional" || tipo === "ips_departamental") {
    return nit
      ? `ips|nit:${k(nit)}`
      : `ips|${k(row.entidad)}|${k(row.ciudad)}|${k(row.departamento)}`;
  }
  if (tipo === "ambulancia_autorizacion" || tipo === "ips_aliada") {
    return nit
      ? `amb|nit:${k(nit)}`
      : `amb|${k(row.entidad)}|${k(row.ciudad)}|${k(row.departamento)}`;
  }
  if (tipo === "jornada_especialidad") {
    return `jor|${k(row.servicio_especialidad)}|${soloFecha(row.fecha_inicio)}|${soloFecha(row.fecha_final)}|${k(row.entidad)}`;
  }
  if (tipo === "codigo_tep") {
    return `tep|${k(row.empresa_tep)}|${k(row.cups)}|${k(row.tipo_ambulancia)}|${k(row.recorrido)}`;
  }
  if (tipo === "eapb_eps") {
    return `eapb|${k(row.entidad)}|${k(row.ciudad)}`;
  }
  if (tipo === "crue") {
    return `crue|${k(row.entidad)}|${k(row.departamento)}|${k(row.ciudad)}`;
  }
  if (tipo === "linea_emergencia") {
    return `lin|${k(row.entidad)}|${k(row.ciudad)}|${k(row.telefono)}`;
  }
  if (tipo === "recurso_referencia") {
    return `rec|${k(row.entidad)}|${k(row.subcategoria)}|${k(row.tipo_recurso)}`;
  }
  if (tipo === "directorio_referencia") {
    return `dgen|${k(row.entidad)}`;
  }
  if (tipo === "sede") {
    return `sede|${k(row.entidad)}|${k(row.direccion)}`;
  }
  if (tipo === "directorio_contacto") {
    return `int|${k(row.sede)}|${k(row.entidad)}|${k(row.codigo_principal)}`;
  }
  return `esp|${k(row.servicio_especialidad)}|${k(row.medico)}|${k(row.jornada)}`;
}

// Campos que la deduplicación necesita leer de los registros existentes.
export const CAMPOS_DEDUP = [
  "id", "tipo_red", "nit", "entidad", "ciudad", "departamento",
  "servicio_especialidad", "fecha_inicio", "fecha_final", "empresa_tep",
  "cups", "tipo_ambulancia", "recorrido", "medico", "jornada",
  "telefono", "subcategoria", "tipo_recurso", "direccion", "sede",
  "codigo_principal",
] as const;


export type ResumenRed = {
  nuevos: number;
  actualizados: number;
  omitidos: number;
  errores: ErrorFila[];
};

// ---------------------------------------------------------------------------
// EXPORTACIÓN de RED / DISPONIBILIDAD: mapeo inverso de `red_operativa` a las
// hojas de la plantilla. Se usa para descargar la información actual con el
// MISMO formato de la plantilla (actualización controlada / respaldo).
// ---------------------------------------------------------------------------

const soloFechaExport = (v: unknown) => {
  const s = String(v ?? "").trim();
  return s ? s.slice(0, 10) : "";
};
const sino = (v: unknown) => (v === true ? "SI" : v === false ? "NO" : "");
const val = (v: unknown) => (v == null ? "" : String(v));

/** Devuelve la hoja de la plantilla a la que pertenece un registro. */
export function hojaDeTipoRed(tipo: string): HojaRedKey | null {
  if (tipo === "ips_nacional" || tipo === "ips_departamental") return "IPS";
  if (tipo === "ambulancia_autorizacion" || tipo === "ips_aliada") return "AMBULANCIAS";
  if (tipo === "jornada_especialidad") return "JORNADAS";
  if (tipo === "codigo_tep") return "CODIGOS_TEP";
  if (tipo === "especialista_interno") return "ESPECIALIDADES_CEDIM";
  if (tipo === "eapb_eps") return "DIRECTORIO_EAPB_EPS";
  if (tipo === "crue") return "DIRECTORIO_CRUE";
  if (tipo === "linea_emergencia") return "LINEAS_EMERGENCIA";
  if (tipo === "recurso_referencia") return "RECURSOS_REFERENCIA";
  if (tipo === "directorio_referencia") return "DATOS_GENERALES_CEDIM";
  if (tipo === "sede") return "SEDES_CEDIM";
  if (tipo === "directorio_contacto") return "DIRECTORIO_INTERNO_CEDIM";
  return null;
}


/** Mapea un registro de `red_operativa` a la fila de su hoja (columnas de plantilla). */
export function desmapearFilaRed(
  r: Record<string, unknown>,
): { hoja: HojaRedKey; fila: Record<string, string> } | null {
  const tipo = String(r.tipo_red ?? "");
  const hoja = hojaDeTipoRed(tipo);
  if (!hoja) return null;

  if (hoja === "IPS") {
    return {
      hoja,
      fila: {
        tipo_ips: tipo === "ips_nacional" ? "Nacional" : "Departamental",
        nombre_ips: val(r.entidad),
        nit: val(r.nit),
        departamento: val(r.departamento),
        ciudad: val(r.ciudad),
        direccion: val(r.direccion),
        correo: val(r.correo),
        telefonos: val(r.telefono),
        contactos: val(r.contacto_principal),
        cargo_contacto: val(r.cargo_contacto),
        especialidades: val(r.servicio_especialidad),
        servicios: "",
        eapb_aseguradoras: val(r.eapb_aseguradoras),
        observaciones: val(r.observaciones),
        estado: val(r.estado),
        disponibilidad_operativa: sino(r.disponible_para_remisiones),
      },
    };
  }
  if (hoja === "AMBULANCIAS") {
    return {
      hoja,
      fila: {
        tipo_empresa: val(r.tipo_apoyo),
        nombre_empresa: val(r.entidad),
        nit: val(r.nit),
        departamento: val(r.departamento),
        ciudad: val(r.ciudad),
        direccion: val(r.direccion),
        correo: val(r.correo),
        telefonos: val(r.telefono),
        contactos: val(r.contacto_principal),
        cargo_contacto: val(r.cargo_contacto),
        tipos_ambulancia: val(r.tipo_ambulancia),
        servicios: val(r.servicio_especialidad),
        cobertura_recorridos: val(r.recorrido),
        eapb_aseguradoras: val(r.eapb_aseguradoras),
        cups_asociados: val(r.cups),
        observaciones: val(r.observaciones),
        estado: val(r.estado),
        disponibilidad_operativa: sino(r.disponible_para_remisiones),
      },
    };
  }
  if (hoja === "JORNADAS") {
    return {
      hoja,
      fila: {
        especialidad: val(r.servicio_especialidad),
        fecha_inicio: soloFechaExport(r.fecha_inicio),
        fecha_fin: soloFechaExport(r.fecha_final),
        ips: val(r.entidad),
        ciudad: val(r.ciudad),
        departamento: val(r.departamento),
        medico_profesional: val(r.medico),
        jornada: val(r.jornada),
        horario: val(r.horario),
        contacto: val(r.contacto_principal),
        telefono: val(r.telefono),
        correo: val(r.correo),
        observaciones: val(r.observaciones),
        estado: val(r.estado),
      },
    };
  }
  if (hoja === "CODIGOS_TEP") {
    return {
      hoja,
      fila: {
        empresa_tep: val(r.empresa_tep),
        tipo_ambulancia: val(r.tipo_ambulancia),
        recorrido_cobertura: val(r.recorrido),
        codigo_cups: val(r.cups),
        descripcion_cups: val(r.cups_descripcion),
        eapb_aseguradora: val(r.eapb_aseguradoras),
        vigencia_desde: soloFechaExport(r.vigencia_desde),
        vigencia_hasta: soloFechaExport(r.vigencia_hasta),
        observaciones: val(r.observaciones),
        estado: val(r.estado),
      },
    };
  }
  if (hoja === "DIRECTORIO_EAPB_EPS") {
    return {
      hoja,
      fila: {
        tipo_entidad: val(r.tipo_apoyo),
        nombre_entidad: val(r.entidad),
        departamento: val(r.departamento),
        ciudad: val(r.ciudad),
        nombre_contacto: val(r.contacto_principal),
        unidad_cargo: val(r.cargo_contacto),
        telefono_principal: val(r.telefono),
        telefonos_alternos: val(r.telefonos_alternos),
        extension: val(r.codigo_principal),
        correo: val(r.correo),
        direccion: val(r.direccion),
        observaciones: val(r.observaciones),
        estado: val(r.estado),
      },
    };
  }
  if (hoja === "DIRECTORIO_CRUE") {
    return {
      hoja,
      fila: {
        nombre_crue: val(r.entidad),
        departamento: val(r.departamento),
        ciudad: val(r.ciudad),
        indicativo: val(r.indicativo),
        nombre_contacto: val(r.contacto_principal),
        cargo: val(r.cargo_contacto),
        direccion: val(r.direccion),
        telefono_principal: val(r.telefono),
        telefonos_alternos: val(r.telefonos_alternos),
        correo_principal: val(r.correo),
        correos_alternos: val(r.correos_alternos),
        cobertura: val(r.cobertura),
        observaciones: val(r.observaciones),
        estado: val(r.estado),
      },
    };
  }
  if (hoja === "LINEAS_EMERGENCIA") {
    return {
      hoja,
      fila: {
        entidad: val(r.entidad),
        tipo_entidad: val(r.tipo_apoyo),
        departamento: val(r.departamento),
        municipio: val(r.ciudad),
        nombre_contacto: val(r.contacto_principal),
        cargo_dependencia: val(r.cargo_contacto),
        telefono_principal: val(r.telefono),
        telefonos_alternos: val(r.telefonos_alternos),
        correo: val(r.correo),
        cobertura: val(r.cobertura),
        observaciones: val(r.observaciones),
        estado: val(r.estado),
      },
    };
  }
  if (hoja === "RECURSOS_REFERENCIA") {
    return {
      hoja,
      fila: {
        categoria: val(r.categoria),
        entidad: val(r.entidad),
        nombre_recurso: val(r.subcategoria),
        descripcion: val(r.descripcion),
        tipo_recurso: val(r.tipo_recurso),
        url: val(r.link),
        correo: val(r.correo),
        telefono: val(r.telefono),
        observaciones: val(r.observaciones),
        orden_visualizacion: val(r.orden_visualizacion),
        estado: val(r.estado),
      },
    };
  }
  if (hoja === "DATOS_GENERALES_CEDIM") {
    return {
      hoja,
      fila: {
        nombre_institucion: val(r.entidad),
        indicativo: val(r.indicativo),
        telefono_general: val(r.telefono),
        extension_referencia: val(r.codigo_principal),
        correo_referencia: val(r.correo),
        direccion_principal: val(r.direccion),
        ciudad: val(r.ciudad),
        departamento: val(r.departamento),
        horario_atencion: val(r.horario),
        observaciones: val(r.observaciones),
        estado: val(r.estado),
      },
    };
  }
  if (hoja === "SEDES_CEDIM") {
    return {
      hoja,
      fila: {
        nombre_sede: val(r.entidad),
        tipo_sede: val(r.tipo_apoyo),
        direccion: val(r.direccion),
        ciudad: val(r.ciudad),
        departamento: val(r.departamento),
        telefono_principal: val(r.telefono),
        extension_principal: val(r.codigo_principal),
        correo_institucional: val(r.correo),
        horario_atencion: val(r.horario),
        servicios: val(r.servicio_especialidad),
        observaciones: val(r.observaciones),
        estado: val(r.estado),
      },
    };
  }
  if (hoja === "DIRECTORIO_INTERNO_CEDIM") {
    return {
      hoja,
      fila: {
        sede: val(r.sede),
        dependencia_area: val(r.entidad),
        funcionario_responsable: val(r.medico),
        cargo: val(r.cargo_contacto),
        extension: val(r.codigo_principal),
        opcion_menu: val(r.opcion_menu),
        telefono_directo: val(r.telefono),
        correo_institucional: val(r.correo),
        observaciones: val(r.observaciones),
        estado: val(r.estado),
      },
    };
  }
  // ESPECIALIDADES_CEDIM
  return {
    hoja,
    fila: {
      especialidad: val(r.servicio_especialidad),
      profesional_medico: val(r.medico),
      jornada: val(r.jornada),
      horario: val(r.horario),
      sede: val(r.sede),
      servicio: val(r.tipo_apoyo),
      telefono: val(r.telefono),
      correo: val(r.correo),
      disponibilidad: sino(r.disponible_para_remisiones),
      observaciones: val(r.observaciones),
      estado: val(r.estado),
    },
  };
}

// ---------------------------------------------------------------------------
// Alias de nombres de hoja del archivo histórico DIRECTORIO.xlsx a las hojas
// de la plantilla. Permite importar el archivo original sin renombrar hojas.
// ---------------------------------------------------------------------------
export const ALIAS_HOJAS_DIRECTORIO: Record<string, HojaRedKey> = {
  eps: "DIRECTORIO_EAPB_EPS",
  eapb: "DIRECTORIO_EAPB_EPS",
  ips: "IPS",
  crue: "DIRECTORIO_CRUE",
  lineas_de_emergencias: "LINEAS_EMERGENCIA",
  lineas_de_emergencia: "LINEAS_EMERGENCIA",
  info_general_entes_referencia: "RECURSOS_REFERENCIA",
  dispo_esp_cedim: "ESPECIALIDADES_CEDIM",
  dispo_amb: "AMBULANCIAS",
  dispo_jornadas_ips: "JORNADAS",
  interno_cedim: "DIRECTORIO_INTERNO_CEDIM",
};

