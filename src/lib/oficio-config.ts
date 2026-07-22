// ============================================================
// FASE 9 — Configuración administrable de los OFICIOS
// INSTITUCIONALES HTML de Entrantes (8 variantes).
//
// Fuente única: plantillas_inventario.contenido_editable
// (uno por cada código documental). Lectura vía getPlantillaConfig
// (caché en memoria compartida) e invalidación específica.
//
// Reglas duras:
// - schema_version: 1 (Zod).
// - Sólo se administra PRESENTACIÓN autorizada.
// - Icono y color se eligen desde ALLOWLISTS cerradas.
// - No se permiten URLs, HTML, CSS ni scripts libres.
// - Nunca lanza: ante entrada inválida devuelve defaults seguros.
// - Retro-compatibilidad: migra claves planas anteriores
//   (institucion_nombre, institucion_sede, institucion_oficina,
//   institucion_aviso, titulo_*).
// ============================================================
import { z } from "zod";
import {
  getPlantillaConfig,
  invalidatePlantillaConfig,
} from "./plantillas-inventario-config";

// ── Tipos de oficio soportados (allowlist) ───────────────────
export const OFICIO_TIPOS = [
  "ACEP",
  "NEG",
  "CAN",
  "AMP",
  "ING",
  "CRUE_ACEP",
  "CRUE_NEG",
  "CRUE_NR",
] as const;
export type OficioTipo = (typeof OFICIO_TIPOS)[number];

// ── Códigos documentales (allowlist tipo → código) ───────────
export const OFICIO_TIPO_A_CODIGO: Record<OficioTipo, string> = {
  ACEP: "ENTRANTES_ACEPTACION_HTML",
  NEG: "ENTRANTES_NEGACION_HTML",
  CAN: "ENTRANTES_CANCELACION_HTML",
  AMP: "ENTRANTES_AMPLIACION_HTML",
  ING: "ENTRANTES_INGRESO_HTML",
  CRUE_ACEP: "ENTRANTES_CRUE_ACEPTACION_HTML",
  CRUE_NEG: "ENTRANTES_CRUE_NEGACION_HTML",
  CRUE_NR: "ENTRANTES_CRUE_NO_REQUERIMIENTO_HTML",
};

export const OFICIO_CODIGOS = Object.values(OFICIO_TIPO_A_CODIGO);

export function isOficioEntrantesCode(codigo: string | null | undefined): boolean {
  return !!codigo && OFICIO_CODIGOS.includes(codigo);
}

export function codigoDocumentalPara(tipo: string): string | null {
  return (OFICIO_TIPO_A_CODIGO as Record<string, string>)[tipo] ?? null;
}

// ── Allowlists de icono y color ──────────────────────────────
export const ICON_KEYS = ["CHECK", "CROSS", "PLUS", "INFO"] as const;
export type IconKey = (typeof ICON_KEYS)[number];

export const ACCENT_COLORS = {
  TEAL: "#19A7AE",
  BLUE: "#0EA5E9",
  MAIN: "#0B3C73",
  RED: "#dc2626",
  ORANGE: "#d97706",
} as const;
export type AccentKey = keyof typeof ACCENT_COLORS;
export const ACCENT_KEYS = Object.keys(ACCENT_COLORS) as AccentKey[];

// ── Variante por defecto (título, icono, color) por tipo ─────
export const OFICIO_DEFAULT_VARIANT: Record<
  OficioTipo,
  { title: string; icon_key: IconKey; accent_color: AccentKey }
> = {
  ACEP: { title: "Caso aceptado", icon_key: "CHECK", accent_color: "TEAL" },
  NEG: { title: "Caso negado", icon_key: "CROSS", accent_color: "RED" },
  CAN: { title: "Cancelación registrada", icon_key: "CROSS", accent_color: "ORANGE" },
  AMP: { title: "Ampliación registrada", icon_key: "PLUS", accent_color: "BLUE" },
  ING: { title: "Ingreso confirmado", icon_key: "CHECK", accent_color: "TEAL" },
  CRUE_ACEP: {
    title: "Aceptación de direccionamiento CRUE",
    icon_key: "CHECK",
    accent_color: "TEAL",
  },
  CRUE_NEG: {
    title: "Negación al direccionamiento CRUE",
    icon_key: "CROSS",
    accent_color: "RED",
  },
  CRUE_NR: {
    title: "No requerimiento de direccionamiento",
    icon_key: "INFO",
    accent_color: "BLUE",
  },
};

// ── Institución (defaults sincronizados con oficio.ts) ───────
export const OFICIO_INSTITUCION_DEFAULT = {
  short_name: "CEDIM IPS",
  long_name: "Centro de Imágenes Diagnósticas CEDIM IPS",
  site_name: "Sede Clínica Gloria Patricia Pinzón",
  office_name: "Oficina de Referencia y Contrarreferencia",
  city_name: "Florencia · Caquetá, Colombia",
};

// ── Esquema Zod ─────────────────────────────────────────────
const AlignmentEnum = z.enum(["left", "center", "right"]);

export const OficioConfigSchema = z.object({
  schema_version: z.literal(1).default(1),
  institution: z
    .object({
      short_name: z.string().trim().min(1).max(80).default(OFICIO_INSTITUCION_DEFAULT.short_name),
      long_name: z.string().trim().min(1).max(160).default(OFICIO_INSTITUCION_DEFAULT.long_name),
      site_name: z.string().trim().max(160).default(OFICIO_INSTITUCION_DEFAULT.site_name),
      office_name: z.string().trim().max(160).default(OFICIO_INSTITUCION_DEFAULT.office_name),
      city_name: z.string().trim().max(160).default(OFICIO_INSTITUCION_DEFAULT.city_name),
    })
    .prefault(() => ({})),
  header: z
    .object({
      show_logo: z.boolean().default(true),
      show_mascot: z.boolean().default(true),
      alignment: AlignmentEnum.default("center"),
      institution_text_visible: z.boolean().default(true),
      office_strip_visible: z.boolean().default(true),
    })
    .prefault(() => ({})),
  variant: z
    .object({
      title: z.string().trim().min(1).max(120).default("Notificación"),
      icon_key: z.enum(ICON_KEYS).default("INFO"),
      accent_color: z.enum(ACCENT_KEYS as [AccentKey, ...AccentKey[]]).default("MAIN"),
    })
    .prefault(() => ({})),
  body: z
    .object({
      base_font_size: z.number().min(11).max(18).default(14),
      line_height: z.number().min(1.2).max(2).default(1.6),
      paragraph_spacing: z.number().min(2).max(20).default(9),
      text_alignment: AlignmentEnum.default("left"),
      accent_visible: z.boolean().default(true),
    })
    .prefault(() => ({})),
  notice: z
    .object({
      visible: z.boolean().default(true),
      label: z.string().trim().max(30).default("⛨ Aviso"),
      text: z
        .string()
        .trim()
        .max(300)
        .default("Por favor, no responda a este mensaje."),
    })
    .prefault(() => ({})),
  footer: z
    .object({
      visible: z.boolean().default(true),
      copyright_text: z.string().trim().max(160).default(OFICIO_INSTITUCION_DEFAULT.long_name),
      show_city: z.boolean().default(true),
      show_year: z.boolean().default(true),
      alignment: AlignmentEnum.default("center"),
    })
    .prefault(() => ({})),
});

export type OficioConfig = z.infer<typeof OficioConfigSchema>;

// Defaults por tipo — resuelve variant.* según el tipo solicitado.
export function getOficioDefaults(tipo: OficioTipo): OficioConfig {
  const v = OFICIO_DEFAULT_VARIANT[tipo] ?? {
    title: "Notificación",
    icon_key: "INFO" as IconKey,
    accent_color: "MAIN" as AccentKey,
  };
  return OficioConfigSchema.parse({
    variant: { title: v.title, icon_key: v.icon_key, accent_color: v.accent_color },
  });
}

// ── Migración retro-compatible ───────────────────────────────
function migrateLegacy(
  raw: Record<string, unknown>,
  tipo: OficioTipo,
): Record<string, unknown> {
  if (raw && typeof raw === "object" && raw.schema_version === 1) return raw;

  const inst: Record<string, unknown> = { ...((raw.institution as object) ?? {}) };
  if (typeof raw.institucion_nombre === "string") inst.short_name = raw.institucion_nombre;
  if (typeof raw.institucion_nombre_largo === "string") inst.long_name = raw.institucion_nombre_largo;
  if (typeof raw.institucion_sede === "string") inst.site_name = raw.institucion_sede;
  if (typeof raw.institucion_oficina === "string") inst.office_name = raw.institucion_oficina;
  if (typeof raw.institucion_ciudad === "string") inst.city_name = raw.institucion_ciudad;

  const notice: Record<string, unknown> = { ...((raw.notice as object) ?? {}) };
  if (typeof raw.institucion_aviso === "string") notice.text = raw.institucion_aviso;

  const variant: Record<string, unknown> = { ...((raw.variant as object) ?? {}) };
  const legacyTitleKey =
    tipo === "ACEP"
      ? "titulo_aceptacion"
      : tipo === "NEG"
        ? "titulo_negacion"
        : tipo === "CAN"
          ? "titulo_cancelacion"
          : tipo === "AMP"
            ? "titulo_ampliacion"
            : tipo === "ING"
              ? "titulo_ingreso"
              : tipo === "CRUE_ACEP"
                ? "titulo_crue_aceptacion"
                : tipo === "CRUE_NEG"
                  ? "titulo_crue_negacion"
                  : "titulo_crue_no_requerimiento";
  const legacyTitle = raw[legacyTitleKey];
  if (typeof legacyTitle === "string" && legacyTitle.trim()) {
    variant.title = legacyTitle.trim();
  }

  return {
    ...raw,
    schema_version: 1,
    institution: inst,
    notice,
    variant,
  };
}

// ── Carga y validación (published) ───────────────────────────
export async function loadOficioConfig(tipo: OficioTipo): Promise<{
  config: OficioConfig;
  fallback: boolean;
}> {
  const codigo = OFICIO_TIPO_A_CODIGO[tipo];
  if (!codigo) return { config: getOficioDefaults(tipo), fallback: true };
  try {
    const raw = await getPlantillaConfig(codigo);
    const migrated = migrateLegacy((raw ?? {}) as Record<string, unknown>, tipo);
    // Combina defaults por tipo + overrides publicados.
    const base = getOficioDefaults(tipo);
    const merged = {
      ...base,
      ...migrated,
      institution: { ...base.institution, ...((migrated.institution as object) ?? {}) },
      header: { ...base.header, ...((migrated.header as object) ?? {}) },
      variant: { ...base.variant, ...((migrated.variant as object) ?? {}) },
      body: { ...base.body, ...((migrated.body as object) ?? {}) },
      notice: { ...base.notice, ...((migrated.notice as object) ?? {}) },
      footer: { ...base.footer, ...((migrated.footer as object) ?? {}) },
    };
    const parsed = OficioConfigSchema.safeParse(merged);
    if (parsed.success) return { config: parsed.data, fallback: false };
    // eslint-disable-next-line no-console
    console.warn("[oficio-config] configuración inválida; usando defaults.", parsed.error?.issues);
    return { config: getOficioDefaults(tipo), fallback: true };
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("[oficio-config] error al leer configuración; usando defaults.", e);
    return { config: getOficioDefaults(tipo), fallback: true };
  }
}

export function invalidateOficioConfig(codigo: string) {
  invalidatePlantillaConfig(codigo);
}
