// ============================================================
// FASE 5 — Configuración administrable del Reporte General
// Operativo — Remisiones Activas.
//
// Fuente única: plantillas_inventario.contenido_editable, código
// REPORTE_GENERAL_SALIENTES. Se lee mediante getPlantillaConfig
// (cache en memoria) y se invalida con invalidatePlantillaConfig.
//
// Esta capa:
//  - define un esquema Zod cerrado (schema_version: 1);
//  - conserva allowlists inmutables de indicadores y columnas;
//  - fusiona la configuración publicada con defaults seguros;
//  - nunca lanza excepciones: ante entrada inválida devuelve los
//    defaults (fallback seguro) y el generador sigue funcionando.
// ============================================================
import { z } from "zod";
import {
  getPlantillaConfig,
  invalidatePlantillaConfig,
} from "./plantillas-inventario-config";

export const REPORTE_GENERAL_CODIGO = "REPORTE_GENERAL_SALIENTES";

// ---------------------------------------------------------------
// Allowlist de indicadores (5 tarjetas superiores).
// Las claves y las fórmulas son inmutables. Sólo etiqueta/orden/
// visibilidad son configurables desde el editor.
// ---------------------------------------------------------------
export const INDICATOR_KEYS = [
  "total_activas",
  "pendientes_aceptacion",
  "aceptadas_sin_ambulancia",
  "aceptadas_con_ambulancia",
  "egresadas_pendientes_llegada",
] as const;
export type IndicatorKey = (typeof INDICATOR_KEYS)[number];

export const INDICATOR_DEFAULT_LABELS: Record<IndicatorKey, string> = {
  total_activas: "TOTAL REMISIONES ACTIVAS",
  pendientes_aceptacion: "PENDIENTES DE ACEPTACIÓN",
  aceptadas_sin_ambulancia: "ACEPTADAS SIN AMBULANCIA",
  aceptadas_con_ambulancia: "ACEPTADAS CON AMBULANCIA",
  egresadas_pendientes_llegada: "EGRESADAS PEND. LLEGADA",
};

// total_activas es obligatorio por definición institucional.
export const INDICATOR_MANDATORY: Record<IndicatorKey, boolean> = {
  total_activas: true,
  pendientes_aceptacion: false,
  aceptadas_sin_ambulancia: false,
  aceptadas_con_ambulancia: false,
  egresadas_pendientes_llegada: false,
};

// ---------------------------------------------------------------
// Allowlist de columnas (20 columnas actuales).
// La clave es inmutable, la fuente lógica del dato es inmutable.
// Sólo etiqueta/orden/visibilidad/ancho/alineación se configuran.
// ---------------------------------------------------------------
export const COLUMN_KEYS = [
  "fecha_inicio",
  "fecha_radicado",
  "tiempo_tramite",
  "servicio",
  "paciente",
  "identificacion",
  "edad",
  "cie10",
  "especialidades_tratantes",
  "especialidades_receptoras",
  "remision_por",
  "motivo",
  "tipo_tramite",
  "eapb",
  "regimen",
  "radicacion",
  "estado",
  "ips_receptora",
  "tipo_ambulancia",
  "soportes",
] as const;
export type ColumnKey = (typeof COLUMN_KEYS)[number];

export const COLUMN_DEFAULT_LABELS: Record<ColumnKey, string> = {
  fecha_inicio: "F. INICIO",
  fecha_radicado: "F. RADICADO",
  tiempo_tramite: "T. TRÁMITE",
  servicio: "SERVICIO",
  paciente: "PACIENTE",
  identificacion: "IDENT.",
  edad: "EDAD",
  cie10: "CIE-10",
  especialidades_tratantes: "ESP. TRAT.",
  especialidades_receptoras: "ESP. RECEP.",
  remision_por: "REMISIÓN POR",
  motivo: "MOTIVO",
  tipo_tramite: "TIPO TRÁMITE",
  eapb: "EAPB",
  regimen: "RÉGIMEN",
  radicacion: "RADICACIÓN",
  estado: "ESTADO",
  ips_receptora: "IPS RECEPTORA",
  tipo_ambulancia: "TIPO AMB",
  soportes: "SOPORTES",
};

// estado y paciente son operativamente indispensables.
export const COLUMN_MANDATORY: Partial<Record<ColumnKey, boolean>> = {
  paciente: true,
  estado: true,
};

export const COLUMN_CLASIFICACION: Record<ColumnKey, "OPERATIVA" | "PERSONAL" | "CLINICA"> = {
  fecha_inicio: "OPERATIVA",
  fecha_radicado: "OPERATIVA",
  tiempo_tramite: "OPERATIVA",
  servicio: "OPERATIVA",
  paciente: "PERSONAL",
  identificacion: "PERSONAL",
  edad: "PERSONAL",
  cie10: "CLINICA",
  especialidades_tratantes: "CLINICA",
  especialidades_receptoras: "CLINICA",
  remision_por: "OPERATIVA",
  motivo: "OPERATIVA",
  tipo_tramite: "OPERATIVA",
  eapb: "OPERATIVA",
  regimen: "OPERATIVA",
  radicacion: "OPERATIVA",
  estado: "OPERATIVA",
  ips_receptora: "OPERATIVA",
  tipo_ambulancia: "OPERATIVA",
  soportes: "OPERATIVA",
};

// ---------------------------------------------------------------
// Esquema Zod (validación estricta con fallback seguro).
// ---------------------------------------------------------------
const AlignEnum = z.enum(["left", "center", "right"]);
const OrientationEnum = z.enum(["landscape", "portrait"]);
const PageSizeEnum = z.enum(["legal", "letter", "a4"]);

const IndicatorItem = z.object({
  key: z.enum(INDICATOR_KEYS),
  label: z.string().trim().min(1).max(80).optional(),
  visible: z.boolean().optional(),
  order: z.number().int().min(0).max(100).optional(),
});

const ColumnItem = z.object({
  key: z.enum(COLUMN_KEYS),
  label: z.string().trim().min(1).max(80).optional(),
  visible: z.boolean().optional(),
  order: z.number().int().min(0).max(100).optional(),
  width: z.number().min(4).max(80).optional(), // mm
  alignment: AlignEnum.optional(),
});

export const ReporteGeneralSalientesConfigSchema = z.object({
  schema_version: z.literal(1).default(1),
  page: z
    .object({
      orientation: OrientationEnum.default("landscape"),
      page_size: PageSizeEnum.default("legal"),
      margin_top: z.number().min(4).max(40).default(7),
      margin_right: z.number().min(4).max(40).default(8),
      margin_bottom: z.number().min(4).max(40).default(10),
      margin_left: z.number().min(4).max(40).default(8),
      base_font_size: z.number().min(5).max(9).default(5.6),
    })
    .prefault(() => ({})),
  header: z
    .object({
      institution_name: z.string().trim().max(160).default("CENTRO DE IMAGENES DIAGNOSTICAS CEDIM I.P.S S.A.S"),
      institution_identifier_label: z.string().trim().max(20).default("NIT:"),
      institution_identifier_value: z.string().trim().max(40).default("900559103-5"),
      report_title: z.string().trim().min(1).max(120).default("REPORTE GENERAL OPERATIVO — REMISIONES ACTIVAS"),
      report_subtitle: z.string().trim().max(160).default(""),
      show_logo: z.boolean().default(true),
      generated_by_label: z.string().trim().max(40).default("Generado por"),
      show_generated_by: z.boolean().default(true),
      show_generated_at: z.boolean().default(true),
      alignment: AlignEnum.default("center"),
    })
    .prefault(() => ({})),
  summary: z
    .object({
      indicators: z.array(IndicatorItem).max(INDICATOR_KEYS.length).default([]),
    })
    .prefault(() => ({})),
  table: z
    .object({
      columns: z.array(ColumnItem).max(COLUMN_KEYS.length).default([]),
      repeat_header: z.boolean().default(true),
    })
    .prefault(() => ({})),
  footer: z
    .object({
      left_text: z.string().trim().max(160).default("SISTEMA DE REFERENCIA Y CONTRARREFERENCIA"),
      show_page_number: z.boolean().default(true),
      show_total_pages: z.boolean().default(true),
      show_generated_at: z.boolean().default(true),
      generated_at_label: z.string().trim().max(40).default("Generado"),
      show_system_name: z.boolean().default(false),
      system_name: z.string().trim().max(80).default(""),
      alignment: AlignEnum.default("right"),
    })
    .prefault(() => ({})),
});

export type ReporteGeneralSalientesConfig = z.infer<typeof ReporteGeneralSalientesConfigSchema>;

// ---------------------------------------------------------------
// Defaults reales usados como fallback seguro y como base al fusionar.
// ---------------------------------------------------------------
export function getReporteGeneralSalientesDefaults(): ReporteGeneralSalientesConfig {
  return ReporteGeneralSalientesConfigSchema.parse({});
}

// ---------------------------------------------------------------
// Devuelve la lista efectiva de indicadores ya ordenada y filtrada
// por visibilidad, respetando obligatoriedad.
// ---------------------------------------------------------------
export function getIndicatorsResolved(cfg: ReporteGeneralSalientesConfig): Array<{
  key: IndicatorKey;
  label: string;
  visible: boolean;
  order: number;
}> {
  const overrides = new Map(cfg.summary.indicators.map((i) => [i.key, i] as const));
  return INDICATOR_KEYS.map((key, idx) => {
    const o = overrides.get(key);
    const mandatory = INDICATOR_MANDATORY[key];
    return {
      key,
      label: o?.label ?? INDICATOR_DEFAULT_LABELS[key],
      visible: mandatory ? true : (o?.visible ?? true),
      order: o?.order ?? idx,
    };
  })
    .sort((a, b) => a.order - b.order)
    .filter((i) => i.visible);
}

// ---------------------------------------------------------------
// Devuelve la lista efectiva de columnas ya ordenada y filtrada.
// Nunca oculta las obligatorias.
// ---------------------------------------------------------------
export function getColumnsResolved(cfg: ReporteGeneralSalientesConfig): Array<{
  key: ColumnKey;
  label: string;
  visible: boolean;
  order: number;
  width?: number;
  alignment: "left" | "center" | "right";
}> {
  const overrides = new Map(cfg.table.columns.map((c) => [c.key, c] as const));
  return COLUMN_KEYS.map((key, idx) => {
    const o = overrides.get(key);
    const mandatory = COLUMN_MANDATORY[key] === true;
    return {
      key,
      label: o?.label ?? COLUMN_DEFAULT_LABELS[key],
      visible: mandatory ? true : (o?.visible ?? true),
      order: o?.order ?? idx,
      width: o?.width,
      alignment: o?.alignment ?? "left",
    };
  })
    .sort((a, b) => a.order - b.order)
    .filter((c) => c.visible);
}

// ---------------------------------------------------------------
// Carga la configuración runtime del reporte. Nunca lanza: ante
// entrada inválida devuelve defaults y el generador continúa.
// Devuelve además una bandera fallback para poder registrar
// advertencias técnicas cuando corresponda.
// ---------------------------------------------------------------
export async function loadReporteGeneralSalientesConfig(): Promise<{
  config: ReporteGeneralSalientesConfig;
  fallback: boolean;
}> {
  try {
    const raw = await getPlantillaConfig(REPORTE_GENERAL_CODIGO);
    // Compatibilidad con la estructura anterior (encabezado_titulo, etc.):
    // sólo mapeamos si NO existe la nueva forma (schema_version).
    const source = migrateLegacyIfNeeded(raw);
    const parsed = ReporteGeneralSalientesConfigSchema.safeParse(source);
    if (parsed.success) return { config: parsed.data, fallback: false };
    // eslint-disable-next-line no-console
    console.warn(
      "[reporte-general-salientes] configuración publicada inválida; usando defaults.",
      parsed.error?.issues,
    );
    return { config: getReporteGeneralSalientesDefaults(), fallback: true };
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("[reporte-general-salientes] error al leer configuración; usando defaults.", e);
    return { config: getReporteGeneralSalientesDefaults(), fallback: true };
  }
}

// ---------------------------------------------------------------
// Interpreta configuraciones antiguas (schema_version ausente) y
// las adapta al nuevo esquema sin perder overrides existentes.
// ---------------------------------------------------------------
function migrateLegacyIfNeeded(raw: Record<string, unknown>): Record<string, unknown> {
  if (!raw || typeof raw !== "object") return {};
  if ("schema_version" in raw) return raw;
  const out: Record<string, unknown> = {};
  const header: Record<string, unknown> = {};
  const footer: Record<string, unknown> = {};
  if (typeof raw.encabezado_titulo === "string") header.report_title = raw.encabezado_titulo;
  if (typeof raw.encabezado_subtitulo === "string") header.report_subtitle = raw.encabezado_subtitulo;
  if (typeof raw.pie_leyenda === "string") footer.left_text = raw.pie_leyenda;
  if (Object.keys(header).length) out.header = header;
  if (Object.keys(footer).length) out.footer = footer;
  return out;
}

export function invalidateReporteGeneralSalientesConfig() {
  invalidatePlantillaConfig(REPORTE_GENERAL_CODIGO);
}
