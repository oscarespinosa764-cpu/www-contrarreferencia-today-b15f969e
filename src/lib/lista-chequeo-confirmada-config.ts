// ============================================================
// FASE 6 — Configuración administrable del documento
// "LISTA DE CHEQUEO CONFIRMADA · ENTREGA DOCUMENTAL FIRMADA".
//
// Fuente única: plantillas_inventario.contenido_editable (código
// ENTREGA_FIRMA_QR). Se lee mediante getPlantillaConfig (cache en
// memoria) y se invalida con invalidatePlantillaConfig.
//
// - schema_version: 1, validado con Zod.
// - Sólo administra presentación autorizada (títulos, etiquetas,
//   textos, márgenes, tipografía). NO administra los ítems del
//   checklist, respuestas, firma, firmante, código, hash ni
//   evidencia (componentes protegidos).
// - Nunca lanza: ante entrada inválida devuelve defaults seguros
//   y el generador productivo sigue funcionando.
// ============================================================
import { z } from "zod";
import {
  getPlantillaConfig,
  invalidatePlantillaConfig,
} from "./plantillas-inventario-config";

export const LISTA_CHEQUEO_CODIGO = "ENTREGA_FIRMA_QR";

const AlignEnum = z.enum(["left", "center", "right"]);
const OrientationEnum = z.enum(["portrait", "landscape"]);
const PageSizeEnum = z.enum(["letter", "legal", "a4"]);

export const ListaChequeoConfirmadaConfigSchema = z.object({
  schema_version: z.literal(1).default(1),
  page: z
    .object({
      orientation: OrientationEnum.default("portrait"),
      page_size: PageSizeEnum.default("letter"),
      margin_top: z.number().min(4).max(40).default(10),
      margin_right: z.number().min(4).max(40).default(14),
      margin_bottom: z.number().min(4).max(40).default(12),
      margin_left: z.number().min(4).max(40).default(14),
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
      document_area: z.string().trim().max(80).default("GESTIÓN DE URGENCIAS"),
      format_code_label: z.string().trim().max(30).default("GU-FR-"),
      version_label: z.string().trim().max(20).default("Versión:"),
      version_value: z.string().trim().max(10).default("1"),
      approval_label: z.string().trim().max(20).default("Aprobado:"),
      document_title: z
        .string()
        .trim()
        .min(1)
        .max(160)
        .default("Lista de Chequeo de Documentación Referencia"),
      document_subtitle: z.string().trim().max(160).default(""),
      show_logo: z.boolean().default(true),
    })
    .prefault(() => ({})),
  patient_section: z
    .object({
      label_fecha: z.string().trim().min(1).max(40).default("FECHA"),
      label_eapb: z.string().trim().min(1).max(40).default("EAPB"),
      label_nombres: z.string().trim().min(1).max(60).default("NOMBRES Y APELLIDOS"),
      label_tipo_documento: z.string().trim().min(1).max(40).default("TIPO DE DOCUMENTO"),
      label_no_documento: z.string().trim().min(1).max(40).default("No. DOCUMENTO"),
      label_cie10: z.string().trim().min(1).max(40).default("CIE-10 PRINCIPAL"),
      label_origen: z.string().trim().min(1).max(40).default("ORIGEN"),
      show_origen: z.boolean().default(true),
    })
    .prefault(() => ({})),
  checklist_table: z
    .object({
      intro_text: z
        .string()
        .trim()
        .min(1)
        .max(240)
        .default(
          "ANTES DEL TRASLADO DEL PACIENTE, VERIFIQUE LA SIGUIENTE DOCUMENTACIÓN:",
        ),
      col_numero: z.string().trim().min(1).max(10).default("N°"),
      col_detalle: z.string().trim().min(1).max(30).default("DETALLE"),
      col_referencia: z.string().trim().min(1).max(30).default("REFERENCIA"),
      col_personal: z.string().trim().min(1).max(40).default("PERSONAL DE TRASLADO"),
      label_c: z.string().trim().min(1).max(4).default("C"),
      label_nc: z.string().trim().min(1).max(4).default("NC"),
      label_na: z.string().trim().min(1).max(4).default("NA"),
      repeat_header: z.boolean().default(true),
    })
    .prefault(() => ({})),
  responsible_section: z
    .object({
      label_nombre: z.string().trim().min(1).max(60).default("NOMBRE / RESPONSABLE"),
      label_cargo: z.string().trim().min(1).max(40).default("CARGO"),
      label_hora: z.string().trim().min(1).max(60).default("HORA DE REALIZACIÓN"),
      label_observaciones: z.string().trim().min(1).max(40).default("OBSERVACIONES"),
    })
    .prefault(() => ({})),
  signer_section: z
    .object({
      title: z
        .string()
        .trim()
        .min(1)
        .max(80)
        .default("DATOS DEL FIRMANTE (PERSONAL DE TRASLADO)"),
      label_nombre: z.string().trim().min(1).max(40).default("NOMBRE"),
      label_cargo: z.string().trim().min(1).max(40).default("CARGO"),
      label_documento: z.string().trim().min(1).max(40).default("DOCUMENTO / ID"),
      label_telefono: z.string().trim().min(1).max(40).default("TELÉFONO"),
      label_empresa: z.string().trim().min(1).max(40).default("EMPRESA DE AMBULANCIA"),
      label_fecha_firma: z.string().trim().min(1).max(40).default("FECHA/HORA DE FIRMA"),
    })
    .prefault(() => ({})),
  acceptance_section: z
    .object({
      title: z.string().trim().min(1).max(60).default("ACEPTACIÓN DE RECIBIDO"),
      text: z
        .string()
        .trim()
        .min(10)
        .max(600)
        .default(
          "Declaro que recibo la documentación relacionada en la lista de chequeo para el traslado del paciente y que la información registrada corresponde a la entrega realizada.",
        ),
    })
    .prefault(() => ({})),
  verification_section: z
    .object({
      label_firma: z.string().trim().min(1).max(20).default("FIRMA"),
      label_codigo: z.string().trim().min(1).max(60).default("CÓDIGO DE VERIFICACIÓN"),
      label_hash: z.string().trim().min(1).max(60).default("Hash de evidencia"),
      show_hash: z.boolean().default(true),
    })
    .prefault(() => ({})),
  footer: z
    .object({
      left_text: z
        .string()
        .trim()
        .max(160)
        .default("Servicios de salud con calidad y humanización"),
      show_generated_at: z.boolean().default(true),
      alignment: AlignEnum.default("center"),
    })
    .prefault(() => ({})),
});

export type ListaChequeoConfirmadaConfig = z.infer<
  typeof ListaChequeoConfirmadaConfigSchema
>;

export function getListaChequeoConfirmadaDefaults(): ListaChequeoConfirmadaConfig {
  return ListaChequeoConfirmadaConfigSchema.parse({});
}

export async function loadListaChequeoConfirmadaConfig(): Promise<{
  config: ListaChequeoConfirmadaConfig;
  fallback: boolean;
}> {
  try {
    const raw = await getPlantillaConfig(LISTA_CHEQUEO_CODIGO);
    const parsed = ListaChequeoConfirmadaConfigSchema.safeParse(raw);
    if (parsed.success) return { config: parsed.data, fallback: false };
    // eslint-disable-next-line no-console
    console.warn(
      "[lista-chequeo-confirmada] configuración inválida; usando defaults.",
      parsed.error?.issues,
    );
    return { config: getListaChequeoConfirmadaDefaults(), fallback: true };
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("[lista-chequeo-confirmada] error al leer configuración; usando defaults.", e);
    return { config: getListaChequeoConfirmadaDefaults(), fallback: true };
  }
}

export function invalidateListaChequeoConfirmadaConfig() {
  invalidatePlantillaConfig(LISTA_CHEQUEO_CODIGO);
}
