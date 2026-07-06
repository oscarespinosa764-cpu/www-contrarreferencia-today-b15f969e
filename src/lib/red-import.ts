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
  | "ESPECIALIDADES_CEDIM";

export const HOJAS_RED_ORDEN: HojaRedKey[] = [
  "IPS",
  "AMBULANCIAS",
  "JORNADAS",
  "CODIGOS_TEP",
  "ESPECIALIDADES_CEDIM",
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
};

// Columnas obligatorias para considerar la fila válida (identifican el registro).
const REQUERIDAS: Record<HojaRedKey, string[]> = {
  IPS: ["nombre_ips"],
  AMBULANCIAS: ["nombre_empresa"],
  JORNADAS: ["especialidad", "ips"],
  CODIGOS_TEP: ["empresa_tep", "codigo_cups"],
  ESPECIALIDADES_CEDIM: ["especialidad", "profesional_medico"],
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
  return `esp|${k(row.servicio_especialidad)}|${k(row.medico)}|${k(row.jornada)}`;
}

// Campos que la deduplicación necesita leer de los registros existentes.
export const CAMPOS_DEDUP = [
  "id", "tipo_red", "nit", "entidad", "ciudad", "departamento",
  "servicio_especialidad", "fecha_inicio", "fecha_final", "empresa_tep",
  "cups", "tipo_ambulancia", "recorrido", "medico", "jornada",
] as const;

export type ResumenRed = {
  nuevos: number;
  actualizados: number;
  omitidos: number;
  errores: ErrorFila[];
};
