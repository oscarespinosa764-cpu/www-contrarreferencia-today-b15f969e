// ============================================================
// FASE 7 — Configuración administrable del documento
// "SOLICITUD DE PERMISO O CAMBIO DE TURNO" (TH-FR-09).
//
// Fuente única: plantillas_inventario.contenido_editable
// (código TH-FR-09). Lectura via getPlantillaConfig (caché en
// memoria) e invalidación específica.
//
// Reglas duras:
// - schema_version: 1, validado con Zod.
// - Sólo se administra PRESENTACIÓN autorizada: títulos, etiquetas
//   de sección, márgenes, textos institucionales, notas, pie.
// - COMPONENTES PROTEGIDOS (no configurables aquí):
//   funcionario, documento, cargo, turno, motivo (viene de
//   MOTIVO_PERMISO), clasificación recuperable/no recuperable,
//   fechas/horas, duración, saldo, reemplazo, estado, aprobación,
//   auditoría, identificador y firma real.
// - Retro-compatibilidad: si contenido_editable trae las claves
//   planas ANTERIORES (encabezado_titulo, encabezado_codigo,
//   pie_leyenda), se migran a la forma canónica sin perderlas.
// - Nunca lanza: ante entrada inválida devuelve defaults seguros.
// ============================================================
import { z } from "zod";
import {
  getPlantillaConfig,
  invalidatePlantillaConfig,
} from "./plantillas-inventario-config";

export const SOLICITUD_PERMISO_CODIGO = "TH-FR-09";

const OrientationEnum = z.enum(["portrait", "landscape"]);
const PageSizeEnum = z.enum(["letter", "legal", "a4"]);

export const SolicitudPermisoConfigSchema = z.object({
  schema_version: z.literal(1).default(1),
  page: z
    .object({
      orientation: OrientationEnum.default("portrait"),
      page_size: PageSizeEnum.default("letter"),
      margin_top: z.number().min(4).max(40).default(12),
      margin_right: z.number().min(4).max(40).default(10),
      margin_bottom: z.number().min(4).max(40).default(10),
      margin_left: z.number().min(4).max(40).default(10),
      base_font_size: z.number().min(6).max(12).default(8),
    })
    .prefault(() => ({})),
  header: z
    .object({
      institution_area: z.string().trim().max(80).default("GESTIÓN DE TALENTO HUMANO"),
      format_label: z.string().trim().max(30).default("Formato"),
      document_title: z
        .string()
        .trim()
        .min(1)
        .max(160)
        .default("Solicitud de permiso, ausencia o salida del colaborador"),
      format_code_visible: z.string().trim().min(1).max(30).default("TH-FR-09"),
      version_label: z.string().trim().max(30).default("Versión: 02"),
      approval_label: z.string().trim().max(40).default("Aprobado: 1/07/2026"),
      show_logo: z.boolean().default(true),
    })
    .prefault(() => ({})),
  employee_section: z
    .object({
      band_title: z.string().trim().min(1).max(60).default("DATOS DE IDENTIFICACION"),
      label_fecha_solicitud: z.string().trim().min(1).max(40).default("Fecha de Solicitud:"),
      label_nombre: z.string().trim().min(1).max(40).default("Nombre del Colaborador:"),
      label_identificacion: z.string().trim().min(1).max(40).default("No de identificación:"),
      label_cargo: z.string().trim().min(1).max(20).default("Cargo:"),
      label_sede: z.string().trim().min(1).max(20).default("Sede:"),
    })
    .prefault(() => ({})),
  request_section: z
    .object({
      band_title: z.string().trim().min(1).max(60).default("MOTIVO DE PERMISO"),
      label_no_recuperable: z.string().trim().min(1).max(30).default("NO RECUPERABLE"),
      label_recuperable: z.string().trim().min(1).max(30).default("RECUPERABLE"),
    })
    .prefault(() => ({})),
  schedule_section: z
    .object({
      band_title: z.string().trim().min(1).max(60).default("DESCRIPCION DEL PERMISO"),
      label_turno_original: z.string().trim().min(1).max(30).default("Turno original:"),
      label_turno_nuevo: z.string().trim().min(1).max(30).default("Nuevo turno:"),
      label_cambia_con: z.string().trim().min(1).max(30).default("Cambia con:"),
      label_fecha_inicial: z.string().trim().min(1).max(30).default("Fecha inicial permiso:"),
      label_fecha_final: z.string().trim().min(1).max(30).default("Fecha final del permiso:"),
      label_hora_inicial: z.string().trim().min(1).max(20).default("Hora inicial:"),
      label_hora_final: z.string().trim().min(1).max(20).default("Hora final:"),
      label_recuperado: z.string().trim().min(1).max(40).default("Será recuperado el tiempo:"),
      label_reemplazo: z.string().trim().min(1).max(40).default("Requiere reemplazo:"),
      label_remunerado: z.string().trim().min(1).max(30).default("Remunerado:"),
      label_motivo_detalle: z
        .string()
        .trim()
        .min(1)
        .max(60)
        .default("Especifique motivo del permiso:"),
    })
    .prefault(() => ({})),
  replacement_section: z
    .object({
      label_nombre: z.string().trim().min(1).max(30).default("Nombre del reemplazo:"),
      label_cargo: z.string().trim().min(1).max(20).default("Cargo:"),
      label_firma: z.string().trim().min(1).max(20).default("Firma:"),
    })
    .prefault(() => ({})),
  recovery_section: z
    .object({
      band_title: z
        .string()
        .trim()
        .min(1)
        .max(80)
        .default("BITACORA DE RECUPERACION DEL TIEMPO SI APLICA"),
      col_fecha: z.string().trim().min(1).max(20).default("Fecha"),
      col_horario: z.string().trim().min(1).max(40).default("Hora inicial / Hora final"),
      col_verificado: z.string().trim().min(1).max(30).default("Verificado por"),
    })
    .prefault(() => ({})),
  signatures_section: z
    .object({
      label_colaborador: z.string().trim().min(1).max(40).default("Firma del colaborador"),
      label_jefe: z.string().trim().min(1).max(40).default("Vo. Bo. Jefe Inmediato"),
      label_subgerencia: z.string().trim().min(1).max(40).default("Vo. Bo. Subgerencia"),
      label_gerente: z.string().trim().min(1).max(40).default("Vo. Bo. Gerente"),
    })
    .prefault(() => ({})),
  declaration_section: z
    .object({
      notas: z
        .array(z.string().trim().min(1).max(400))
        .max(12)
        .default([
          "Todo permiso mayor a un día debe solicitarse mínimo 48 horas de antelación y radicar en el área de talento humano",
          "El jefe inmediato únicamente está autorizado para dar permiso hasta por 8 horas en la parte administrativa",
          "El jefe inmediato podrá autorizar un cambio de turno en la parte asistencial",
          "En caso de permisos superiores a 8 horas o un turno, este debe estar autorizado por las subgerencias según corresponda",
          "En caso de permisos o licencias mayores a 3 días debe ser autorizado adicionalmente por la Gerencia General.",
          "CC.: Archivo de ausentismo laboral",
        ]),
    })
    .prefault(() => ({})),
  footer: z
    .object({
      left_text: z
        .string()
        .trim()
        .min(1)
        .max(160)
        .default("Servicios de salud con calidad y humanización"),
      show_verification: z.boolean().default(true),
    })
    .prefault(() => ({})),
});

export type SolicitudPermisoConfig = z.infer<typeof SolicitudPermisoConfigSchema>;

export function getSolicitudPermisoDefaults(): SolicitudPermisoConfig {
  return SolicitudPermisoConfigSchema.parse({});
}

// Migración retro-compatible: mapea claves planas anteriores hacia
// la forma canónica sin perder overrides ya publicados.
function migrateLegacy(raw: Record<string, unknown>): Record<string, unknown> {
  if (raw && typeof raw === "object" && raw.schema_version === 1) return raw;
  const migrated: Record<string, unknown> = { ...raw };
  const legacyTitle = typeof raw.encabezado_titulo === "string" ? raw.encabezado_titulo.trim() : "";
  const legacyCodigo = typeof raw.encabezado_codigo === "string" ? raw.encabezado_codigo.trim() : "";
  const legacyPie = typeof raw.pie_leyenda === "string" ? raw.pie_leyenda.trim() : "";
  if (legacyTitle || legacyCodigo) {
    migrated.header = {
      ...((raw.header as object) ?? {}),
      ...(legacyTitle ? { document_title: legacyTitle } : {}),
      ...(legacyCodigo ? { format_code_visible: legacyCodigo } : {}),
    };
  }
  if (legacyPie) {
    migrated.footer = {
      ...((raw.footer as object) ?? {}),
      left_text: legacyPie,
    };
  }
  migrated.schema_version = 1;
  return migrated;
}

export async function loadSolicitudPermisoConfig(): Promise<{
  config: SolicitudPermisoConfig;
  fallback: boolean;
}> {
  try {
    const raw = await getPlantillaConfig(SOLICITUD_PERMISO_CODIGO);
    const migrated = migrateLegacy((raw ?? {}) as Record<string, unknown>);
    const parsed = SolicitudPermisoConfigSchema.safeParse(migrated);
    if (parsed.success) return { config: parsed.data, fallback: false };
    // eslint-disable-next-line no-console
    console.warn(
      "[solicitud-permiso] configuración inválida; usando defaults.",
      parsed.error?.issues,
    );
    return { config: getSolicitudPermisoDefaults(), fallback: true };
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("[solicitud-permiso] error al leer configuración; usando defaults.", e);
    return { config: getSolicitudPermisoDefaults(), fallback: true };
  }
}

export function invalidateSolicitudPermisoConfig() {
  invalidatePlantillaConfig(SOLICITUD_PERMISO_CODIGO);
}
