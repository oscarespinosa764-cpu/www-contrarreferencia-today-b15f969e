// ============================================================
// FASE 8 — Configuración administrable de la Bitácora operativa
// (documento PDF "GESTIÓN DE REFERENCIA").
//
// Fuente única: plantillas_inventario.contenido_editable (código
// BITACORA_ENTRANTES). Se lee mediante getPlantillaConfig (cache
// en memoria) y se invalida con invalidatePlantillaConfig.
//
// - schema_version: 1, validado con Zod.
// - Sólo administra presentación autorizada (títulos, etiquetas,
//   textos, márgenes, tipografía y columnas de la tabla de
//   seguimientos). NO administra los datos operativos (paciente,
//   caso, seguimientos, estados, fechas, responsables ni orden
//   cronológico): esos son componentes protegidos.
// - Nunca lanza: ante entrada inválida devuelve defaults seguros
//   y el generador productivo sigue funcionando.
// ============================================================
import { z } from "zod";
import {
  getPlantillaConfig,
  invalidatePlantillaConfig,
} from "./plantillas-inventario-config";

export const BITACORA_CODIGO = "BITACORA_ENTRANTES";

const AlignEnum = z.enum(["left", "center", "right"]);
const OrientationEnum = z.enum(["portrait", "landscape"]);
const PageSizeEnum = z.enum(["letter", "legal", "a4"]);

// Columnas autorizadas (allowlist cerrada). No se permite crear
// columnas nuevas ni cambiar la clave técnica desde el editor.
export const BITACORA_COLUMN_KEYS = [
  "fecha",
  "entidad",
  "observaciones",
  "estado",
  "accion",
  "funcionario",
] as const;
export type BitacoraColumnKey = (typeof BITACORA_COLUMN_KEYS)[number];

const ColumnSchema = z.object({
  key: z.enum(BITACORA_COLUMN_KEYS),
  label: z.string().trim().min(1).max(40),
  visible: z.boolean().default(true),
  width: z.number().min(10).max(120).nullable().default(null),
  alignment: AlignEnum.default("left"),
});

const DEFAULT_COLUMNS: z.input<typeof ColumnSchema>[] = [
  { key: "fecha", label: "Fecha registro", visible: true, width: 22, alignment: "left" },
  { key: "entidad", label: "Entidad", visible: true, width: 26, alignment: "left" },
  { key: "observaciones", label: "Observaciones", visible: true, width: null, alignment: "left" },
  { key: "estado", label: "Estado", visible: true, width: 22, alignment: "left" },
  { key: "accion", label: "Acción realizada", visible: true, width: 26, alignment: "left" },
  { key: "funcionario", label: "Funcionario", visible: true, width: 24, alignment: "left" },
];

export const BitacoraConfigSchema = z.object({
  schema_version: z.literal(1).default(1),
  page: z
    .object({
      orientation: OrientationEnum.default("portrait"),
      page_size: PageSizeEnum.default("a4"),
      margin_top: z.number().min(6).max(30).default(12),
      margin_right: z.number().min(6).max(30).default(12),
      margin_bottom: z.number().min(6).max(30).default(14),
      margin_left: z.number().min(6).max(30).default(12),
      base_font_size: z.number().min(6).max(12).default(8),
    })
    .prefault(() => ({})),
  header: z
    .object({
      institution_name: z
        .string()
        .trim()
        .max(160)
        .default("CENTRO DE IMAGENES DIAGNOSTICAS CEDIM I.P.S S.A.S"),
      institution_identifier_label: z.string().trim().max(20).default("NIT:"),
      institution_identifier_value: z.string().trim().max(40).default("900559103-5"),
      report_title: z.string().trim().min(1).max(80).default("GESTIÓN DE REFERENCIA"),
      report_subtitle: z.string().trim().max(120).default(""),
      show_logo: z.boolean().default(true),
      show_generated_at: z.boolean().default(true),
      generated_at_label: z.string().trim().max(40).default("Fecha De Impresión:"),
    })
    .prefault(() => ({})),
  patient_section: z
    .object({
      title: z.string().trim().min(1).max(60).default("DATOS DEL PACIENTE"),
    })
    .prefault(() => ({})),
  case_section: z
    .object({
      title: z.string().trim().min(1).max(60).default("DATOS DE REFERENCIA"),
    })
    .prefault(() => ({})),
  timeline_section: z
    .object({
      title: z.string().trim().min(1).max(80).default("SEGUIMIENTOS REFERENCIA"),
      empty_text: z.string().trim().max(120).default("Sin seguimientos registrados."),
      repeat_header: z.boolean().default(true),
    })
    .prefault(() => ({})),
  entries_table: z
    .object({
      columns: z.array(ColumnSchema).min(1).max(BITACORA_COLUMN_KEYS.length).default(() => DEFAULT_COLUMNS.map((c) => ColumnSchema.parse(c))),
    })
    .prefault(() => ({ columns: DEFAULT_COLUMNS })),
  footer: z
    .object({
      institution_line: z
        .string()
        .trim()
        .max(160)
        .default("SISTEMA DE REFERENCIA Y CONTRARREFERENCIA"),
      show_generated_by: z.boolean().default(true),
      show_page_numbers: z.boolean().default(true),
      alignment: AlignEnum.default("left"),
    })
    .prefault(() => ({})),
});

export type BitacoraConfig = z.infer<typeof BitacoraConfigSchema>;

export function getBitacoraDefaults(): BitacoraConfig {
  return BitacoraConfigSchema.parse({});
}

// Normaliza la lista de columnas: garantiza que existan todas las
// claves protegidas obligatorias (fecha, observaciones, funcionario),
// respeta el orden guardado y evita duplicados.
export function normalizarColumnas(cfg: BitacoraConfig): BitacoraConfig["entries_table"]["columns"] {
  const cols = cfg.entries_table.columns.slice();
  const vistos = new Set<string>();
  const dedup = cols.filter((c) => (vistos.has(c.key) ? false : (vistos.add(c.key), true)));
  // Reincorpora columnas faltantes (default oculta = false para no perder datos).
  for (const def of DEFAULT_COLUMNS) {
    if (!vistos.has(def.key)) dedup.push(ColumnSchema.parse(def));
  }
  // Fuerza visibilidad de columnas obligatorias.
  const OBLIGATORIAS: BitacoraColumnKey[] = ["fecha", "observaciones", "funcionario"];
  return dedup.map((c) => (OBLIGATORIAS.includes(c.key) ? { ...c, visible: true } : c));
}

export async function loadBitacoraConfig(): Promise<{
  config: BitacoraConfig;
  fallback: boolean;
}> {
  try {
    const raw = await getPlantillaConfig(BITACORA_CODIGO);
    const parsed = BitacoraConfigSchema.safeParse(raw);
    if (parsed.success) {
      return {
        config: {
          ...parsed.data,
          entries_table: { columns: normalizarColumnas(parsed.data) },
        },
        fallback: false,
      };
    }
    // eslint-disable-next-line no-console
    console.warn("[bitacora] configuración inválida; usando defaults.", parsed.error?.issues);
    return { config: getBitacoraDefaults(), fallback: true };
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("[bitacora] error al leer configuración; usando defaults.", e);
    return { config: getBitacoraDefaults(), fallback: true };
  }
}

export function invalidateBitacoraConfig() {
  invalidatePlantillaConfig(BITACORA_CODIGO);
}
