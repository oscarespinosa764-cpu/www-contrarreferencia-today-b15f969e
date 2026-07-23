// ============================================================
// Fase 12 · Etapa 2 — Piloto FRM_RED_OPERATIVA_EDIT
//
// Módulo canónico de configuración del formulario Red operativa.
//
// - Fuente de verdad técnica: RED_OPERATIVA_FIELD_REGISTRY. Este mapa fija
//   la clave técnica, obligatoriedad, protección, tipo, componente, catálogo,
//   capacidad de ocultamiento y defaults presentacionales. La base de datos
//   NO puede modificar estos atributos: schema_config solo contiene overrides
//   de presentación autorizados.
// - Esquema Zod .strict() para validar schema_config antes de guardar/publicar
//   y antes de aplicar en runtime.
// - Loader único con caché e invalidación específica por código.
// - Fallback seguro reproduciendo defaults ante cualquier error o versión
//   incompatible.
// ============================================================

import { z } from "zod";

// ------------------------------------------------------------------
// 1. Registro técnico fijo (allowlist)
// ------------------------------------------------------------------

export const RED_OPERATIVA_FORM_CODE = "FRM_RED_OPERATIVA_EDIT" as const;

/** Anchos cerrados soportados por el layout responsive actual. */
export const RED_OP_WIDTHS = ["full", "half"] as const;
export type RedOpWidth = (typeof RED_OP_WIDTHS)[number];

/** Secciones allowlisted. El editor solo puede asignar campos a estas. */
export const RED_OP_SECTIONS = [
  "identificacion",
  "clasificacion",
  "ubicacion",
  "contacto",
  "operativo",
  "vigencia",
  "recurso",
  "observaciones",
] as const;
export type RedOpSectionKey = (typeof RED_OP_SECTIONS)[number];

export type FieldClass =
  | "PRESENTACIONAL_CONFIGURABLE"
  | "OPCIONAL_VISIBILIDAD_CONFIGURABLE"
  | "OPERATIVO_PROTEGIDO"
  | "CATALOGO_PROTEGIDO";

export interface FieldRegistryEntry {
  key: string;
  clasificacion: FieldClass;
  required_hint: boolean; // referencia informativa; la obligatoriedad real la impone `validar`
  protected: boolean; // si true, el editor no permite ocultar
  optional_visibility: boolean; // solo estos pueden alternar `visible`
  data_type: "text" | "select" | "date" | "textarea" | "boolean" | "number" | "autocomplete";
  catalog_type: string | null; // catálogo canónico, solo informativo
  default_section: RedOpSectionKey;
  default_order: number;
  default_label: string;
  default_help: string;
  default_placeholder: string;
  default_width: RedOpWidth;
}

// Orden por defecto reproduce el flujo visual actual del formulario.
export const RED_OPERATIVA_FIELD_REGISTRY: Record<string, FieldRegistryEntry> = {
  tipo_red: mk("tipo_red", "OPERATIVO_PROTEGIDO", true, true, false, "select", null, "clasificacion", 1, "Tipo de registro", "", ""),
  estado: mk("estado", "OPERATIVO_PROTEGIDO", true, true, false, "select", null, "clasificacion", 2, "Estado", "", ""),
  ambito: mk("ambito", "OPERATIVO_PROTEGIDO", false, true, false, "select", null, "clasificacion", 3, "Ámbito", "", ""),
  entidad: mk("entidad", "OPERATIVO_PROTEGIDO", true, true, false, "text", null, "identificacion", 1, "Nombre / entidad", "", ""),
  nit: mk("nit", "PRESENTACIONAL_CONFIGURABLE", false, false, false, "text", null, "identificacion", 2, "NIT (si aplica)", "", ""),
  servicio_especialidad: mk("servicio_especialidad", "OPERATIVO_PROTEGIDO", false, true, false, "autocomplete", "especialidades", "operativo", 1, "Especialidad", "", ""),
  medico: mk("medico", "PRESENTACIONAL_CONFIGURABLE", false, false, false, "text", null, "operativo", 2, "Médico / profesional", "", ""),
  sede: mk("sede", "PRESENTACIONAL_CONFIGURABLE", false, false, false, "text", null, "ubicacion", 1, "Sede", "", ""),
  ciudad: mk("ciudad", "OPERATIVO_PROTEGIDO", false, true, false, "text", null, "ubicacion", 2, "Ciudad / municipio", "", ""),
  departamento: mk("departamento", "PRESENTACIONAL_CONFIGURABLE", false, false, false, "text", null, "ubicacion", 3, "Departamento", "", ""),
  direccion: mk("direccion", "PRESENTACIONAL_CONFIGURABLE", false, false, false, "text", null, "ubicacion", 4, "Dirección", "", ""),
  telefono: mk("telefono", "PRESENTACIONAL_CONFIGURABLE", false, false, false, "text", null, "contacto", 1, "Teléfono", "", ""),
  correo: mk("correo", "PRESENTACIONAL_CONFIGURABLE", false, false, false, "text", null, "contacto", 2, "Correo electrónico", "", ""),
  contacto_principal: mk("contacto_principal", "PRESENTACIONAL_CONFIGURABLE", false, false, false, "text", null, "contacto", 3, "Contacto principal", "", ""),
  cargo_contacto: mk("cargo_contacto", "PRESENTACIONAL_CONFIGURABLE", false, false, false, "text", null, "contacto", 4, "Cargo del contacto", "", ""),
  eapb_aseguradoras: mk("eapb_aseguradoras", "PRESENTACIONAL_CONFIGURABLE", false, false, false, "text", null, "operativo", 3, "EAPB / aseguradoras", "", ""),
  tipo_ambulancia: mk("tipo_ambulancia", "CATALOGO_PROTEGIDO", false, true, false, "select", "TIPOS_AMBULANCIA", "operativo", 4, "Tipo de ambulancia", "", ""),
  tipo_apoyo: mk("tipo_apoyo", "PRESENTACIONAL_CONFIGURABLE", false, false, false, "text", null, "operativo", 5, "Tipo de apoyo", "", ""),
  cups: mk("cups", "PRESENTACIONAL_CONFIGURABLE", false, false, false, "text", null, "operativo", 6, "CUPS", "", ""),
  codigo_principal: mk("codigo_principal", "PRESENTACIONAL_CONFIGURABLE", false, false, false, "text", null, "operativo", 7, "Extensión / código", "", ""),
  cups_descripcion: mk("cups_descripcion", "PRESENTACIONAL_CONFIGURABLE", false, false, false, "text", null, "operativo", 8, "Descripción CUPS", "", ""),
  recorrido: mk("recorrido", "PRESENTACIONAL_CONFIGURABLE", false, false, false, "text", null, "operativo", 9, "Recorrido / cobertura", "", ""),
  empresa_tep: mk("empresa_tep", "OPERATIVO_PROTEGIDO", false, true, false, "text", null, "operativo", 10, "Empresa TEP", "", ""),
  jornada: mk("jornada", "CATALOGO_PROTEGIDO", false, true, false, "select", "JORNADAS", "operativo", 11, "Jornada", "", ""),
  horario: mk("horario", "PRESENTACIONAL_CONFIGURABLE", false, false, false, "text", null, "operativo", 12, "Horario", "", ""),
  fecha_inicio: mk("fecha_inicio", "PRESENTACIONAL_CONFIGURABLE", false, false, false, "date", null, "vigencia", 1, "Fecha inicio", "", ""),
  fecha_final: mk("fecha_final", "PRESENTACIONAL_CONFIGURABLE", false, false, false, "date", null, "vigencia", 2, "Fecha final", "", ""),
  vigencia_desde: mk("vigencia_desde", "PRESENTACIONAL_CONFIGURABLE", false, false, false, "date", null, "vigencia", 3, "Vigencia desde", "", ""),
  vigencia_hasta: mk("vigencia_hasta", "PRESENTACIONAL_CONFIGURABLE", false, false, false, "date", null, "vigencia", 4, "Vigencia hasta", "", ""),
  disponible_para_remisiones: mk("disponible_para_remisiones", "OPERATIVO_PROTEGIDO", false, true, false, "boolean", null, "operativo", 13, "Disponible para remisiones", "", ""),
  observaciones: mk("observaciones", "PRESENTACIONAL_CONFIGURABLE", false, false, false, "textarea", null, "observaciones", 1, "Observaciones", "", ""),
  // === Los 5 opcionales con visibilidad configurable ===
  telefonos_alternos: mk("telefonos_alternos", "OPCIONAL_VISIBILIDAD_CONFIGURABLE", false, false, true, "text", null, "contacto", 5, "Teléfonos alternos", "", "Separa varios con , o salto de línea"),
  correos_alternos: mk("correos_alternos", "OPCIONAL_VISIBILIDAD_CONFIGURABLE", false, false, true, "text", null, "contacto", 6, "Correos alternos", "", ""),
  indicativo: mk("indicativo", "OPCIONAL_VISIBILIDAD_CONFIGURABLE", false, false, true, "text", null, "identificacion", 3, "Indicativo (si aplica)", "", ""),
  opcion_menu: mk("opcion_menu", "OPCIONAL_VISIBILIDAD_CONFIGURABLE", false, false, true, "text", null, "operativo", 14, "Opción de menú", "", ""),
  descripcion: mk("descripcion", "OPCIONAL_VISIBILIDAD_CONFIGURABLE", false, false, true, "textarea", null, "recurso", 4, "Descripción", "", ""),
  // === Recurso y otros ===
  cobertura: mk("cobertura", "CATALOGO_PROTEGIDO", false, true, false, "select", "COBERTURAS", "operativo", 15, "Cobertura", "", ""),
  tipo_recurso: mk("tipo_recurso", "CATALOGO_PROTEGIDO", false, true, false, "select", "TIPOS_RECURSO", "recurso", 1, "Tipo de recurso", "", ""),
  categoria: mk("categoria", "CATALOGO_PROTEGIDO", false, true, false, "select", "CATEGORIAS_RECURSO", "recurso", 2, "Categoría", "", ""),
  subcategoria: mk("subcategoria", "OPERATIVO_PROTEGIDO", false, true, false, "text", null, "recurso", 3, "Nombre del recurso", "", ""),
  link: mk("link", "PRESENTACIONAL_CONFIGURABLE", false, false, false, "text", null, "recurso", 5, "URL", "", ""),
  orden_visualizacion: mk("orden_visualizacion", "PRESENTACIONAL_CONFIGURABLE", false, false, false, "number", null, "recurso", 6, "Orden de visualización", "", ""),
};

function mk(
  key: string,
  clasificacion: FieldClass,
  required_hint: boolean,
  protectedField: boolean,
  optional_visibility: boolean,
  data_type: FieldRegistryEntry["data_type"],
  catalog_type: string | null,
  default_section: RedOpSectionKey,
  default_order: number,
  default_label: string,
  default_help: string,
  default_placeholder: string,
): FieldRegistryEntry {
  return {
    key,
    clasificacion,
    required_hint,
    protected: protectedField,
    optional_visibility,
    data_type,
    catalog_type,
    default_section,
    default_order,
    default_label,
    default_help,
    default_placeholder,
    default_width: "full",
  };
}

// ------------------------------------------------------------------
// 2. Defaults de secciones
// ------------------------------------------------------------------

export interface SectionMeta {
  key: RedOpSectionKey;
  label: string;
  description: string;
  order: number;
}

export const DEFAULT_SECTION_META: Record<RedOpSectionKey, SectionMeta> = {
  clasificacion: { key: "clasificacion", label: "Clasificación", description: "Tipo, estado y ámbito del registro.", order: 1 },
  identificacion: { key: "identificacion", label: "Identificación", description: "Datos de identificación de la entidad o registro.", order: 2 },
  ubicacion: { key: "ubicacion", label: "Ubicación", description: "Sede, ciudad, dirección.", order: 3 },
  contacto: { key: "contacto", label: "Contacto", description: "Teléfonos, correos y responsables.", order: 4 },
  operativo: { key: "operativo", label: "Datos operativos", description: "Especialidad, servicios y parámetros operativos.", order: 5 },
  vigencia: { key: "vigencia", label: "Vigencia", description: "Fechas de inicio, fin y vigencia contractual.", order: 6 },
  recurso: { key: "recurso", label: "Recurso de referencia", description: "Aplica a directorios externos y recursos.", order: 7 },
  observaciones: { key: "observaciones", label: "Observaciones", description: "Notas complementarias.", order: 8 },
};

// ------------------------------------------------------------------
// 3. Esquema Zod (.strict())
// ------------------------------------------------------------------

const MAX_LABEL = 80;
const MAX_HELP = 240;
const MAX_PLACEHOLDER = 120;
const MAX_SECTION_LABEL = 60;
const MAX_SECTION_DESC = 240;

const sectionSchema = z
  .object({
    key: z.enum(RED_OP_SECTIONS),
    label: z.string().min(1).max(MAX_SECTION_LABEL),
    description: z.string().max(MAX_SECTION_DESC).default(""),
    order: z.number().int().min(0).max(9999),
  })
  .strict();

const fieldSchema = z
  .object({
    key: z.string().min(1).max(64),
    label: z.string().min(1).max(MAX_LABEL),
    help_text: z.string().max(MAX_HELP).default(""),
    placeholder: z.string().max(MAX_PLACEHOLDER).default(""),
    visible: z.boolean().default(true),
    order: z.number().int().min(0).max(9999),
    section_key: z.enum(RED_OP_SECTIONS),
    width: z.enum(RED_OP_WIDTHS),
  })
  .strict();

export const redOperativaFormSchema = z
  .object({
    schema_version: z.literal(1),
    sections: z.array(sectionSchema),
    fields: z.array(fieldSchema),
  })
  .strict();

export type RedOperativaFormConfig = z.infer<typeof redOperativaFormSchema>;

// ------------------------------------------------------------------
// 4. Defaults derivados del registry
// ------------------------------------------------------------------

export function buildDefaultConfig(): RedOperativaFormConfig {
  const sections: SectionMeta[] = RED_OP_SECTIONS.map((k) => ({ ...DEFAULT_SECTION_META[k] }));
  const fields = Object.values(RED_OPERATIVA_FIELD_REGISTRY).map((r) => ({
    key: r.key,
    label: r.default_label,
    help_text: r.default_help,
    placeholder: r.default_placeholder,
    visible: true,
    order: r.default_order,
    section_key: r.default_section,
    width: r.default_width,
  }));
  return { schema_version: 1, sections, fields };
}

// ------------------------------------------------------------------
// 5. Normalización: descarta claves desconocidas, fuerza campos
//    protegidos como visibles, ordena y completa faltantes.
// ------------------------------------------------------------------

export function normalizeConfig(raw: unknown): RedOperativaFormConfig {
  const defaults = buildDefaultConfig();

  // Parse best-effort
  let parsed: RedOperativaFormConfig | null = null;
  try {
    const check = redOperativaFormSchema.safeParse(raw);
    if (check.success) parsed = check.data;
  } catch {
    parsed = null;
  }

  const inputFields = parsed?.fields ?? [];
  const inputFieldsMap = new Map(inputFields.filter((f) => RED_OPERATIVA_FIELD_REGISTRY[f.key]).map((f) => [f.key, f]));

  const finalFields = defaults.fields.map((def) => {
    const reg = RED_OPERATIVA_FIELD_REGISTRY[def.key]!;
    const override = inputFieldsMap.get(def.key);
    const secKey = override && (RED_OP_SECTIONS as readonly string[]).includes(override.section_key)
      ? override.section_key
      : def.section_key;
    // Los campos NO optional_visibility siempre visibles.
    const visible = reg.optional_visibility ? override?.visible ?? true : true;
    return {
      key: def.key,
      label: (override?.label || def.label).slice(0, MAX_LABEL),
      help_text: (override?.help_text ?? def.help_text).slice(0, MAX_HELP),
      placeholder: (override?.placeholder ?? def.placeholder).slice(0, MAX_PLACEHOLDER),
      visible,
      order: typeof override?.order === "number" ? override.order : def.order,
      section_key: secKey as RedOpSectionKey,
      width: (RED_OP_WIDTHS as readonly string[]).includes(override?.width as string)
        ? (override!.width as RedOpWidth)
        : def.width,
    };
  });

  const inputSectionsMap = new Map((parsed?.sections ?? []).map((s) => [s.key, s]));
  const finalSections = RED_OP_SECTIONS.map((k) => {
    const def = DEFAULT_SECTION_META[k];
    const ov = inputSectionsMap.get(k);
    return {
      key: k,
      label: (ov?.label || def.label).slice(0, MAX_SECTION_LABEL),
      description: (ov?.description ?? def.description).slice(0, MAX_SECTION_DESC),
      order: typeof ov?.order === "number" ? ov.order : def.order,
    };
  }).sort((a, b) => a.order - b.order);

  return {
    schema_version: 1,
    sections: finalSections,
    fields: finalFields.sort((a, b) => a.order - b.order),
  };
}

// ------------------------------------------------------------------
// 6. Caché runtime específica del formulario
// ------------------------------------------------------------------

const configCache = new Map<string, Promise<RedOperativaFormConfig>>();

export function invalidateFormularioConfig(codigo: string) {
  configCache.delete(codigo);
}

/**
 * Loader especializado. Solicita únicamente FRM_RED_OPERATIVA_EDIT.
 * Ante error, versión inválida o ausencia devuelve defaults seguros.
 */
export async function loadRedOperativaFormConfig(): Promise<RedOperativaFormConfig> {
  const codigo = RED_OPERATIVA_FORM_CODE;
  const cached = configCache.get(codigo);
  if (cached) return cached;

  const p = (async () => {
    try {
      const { obtenerFormularioPublicado } = await import("./formularios.functions");
      const raw = await obtenerFormularioPublicado({ data: { codigo } });
      return normalizeConfig(raw?.schema_config);
    } catch (err) {
      if (typeof console !== "undefined") {
        console.warn(`[FRM_RED_OPERATIVA_EDIT] usando defaults por error de carga`, err);
      }
      return buildDefaultConfig();
    }
  })();
  configCache.set(codigo, p);
  return p;
}

/**
 * Utilidad para búsquedas por clave (usada por el operativo y el editor
 * en vista previa).
 */
export function fieldConfigByKey(cfg: RedOperativaFormConfig): Map<string, RedOperativaFormConfig["fields"][number]> {
  return new Map(cfg.fields.map((f) => [f.key, f]));
}
