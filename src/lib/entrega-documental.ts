// Helpers cliente para la ENTREGA DOCUMENTAL con firma por QR.
//
// El token se genera y se hashea en el cliente: en la base de datos solo viaja
// el token_hash (SHA-256). El token en texto plano vive únicamente dentro de la
// URL del QR. No se usan servicios externos ni IA.

import { supabase } from "@/lib/backend-client";
import { sha256Hex } from "@/lib/firmas-utils";

/** Vencimiento por defecto del enlace de firma (2 horas). */
export const TTL_FIRMA_MS = 2 * 60 * 60 * 1000;

/** Lista de chequeo documental por defecto (editable por el usuario). */
export const DOCUMENTOS_DEFAULT: string[] = [
  "Historia clínica / epicrisis",
  "Orden de remisión",
  "Resultados de laboratorio",
  "Imágenes diagnósticas",
  "Consentimiento informado",
  "Documento de identidad del paciente",
  "Autorización de la EAPB",
  "Notas de enfermería",
  "Hoja de administración de medicamentos",
];

/** Origen / responsable documental (define qué documentos aparecen). */
export type OrigenDoc = "EPS" | "ARL" | "SOAT" | "PARTICULAR";

export const ORIGENES_DOC: { value: OrigenDoc; label: string }[] = [
  { value: "EPS", label: "EPS" },
  { value: "ARL", label: "ARL" },
  { value: "SOAT", label: "SOAT" },
  { value: "PARTICULAR", label: "Particular" },
];

/** Documentos comunes a todos los orígenes. */
const DOCS_COMUNES = [
  "Historia clínica / epicrisis",
  "Orden de remisión",
  "Resultados de laboratorio",
  "Imágenes diagnósticas",
  "Consentimiento informado",
  "Documento de identidad del paciente",
  "Notas de enfermería",
  "Hoja de administración de medicamentos",
];

/**
 * Lista de chequeo por defecto según el origen documental.
 * NOTA: mientras no exista un catálogo administrable en BD, estos valores actúan
 * como plantilla base; el usuario puede agregar/quitar documentos en el modal.
 */
export const DOCUMENTOS_POR_ORIGEN: Record<OrigenDoc, string[]> = {
  EPS: [...DOCS_COMUNES, "Autorización de la EAPB", "Carné / certificado de afiliación EPS"],
  ARL: [...DOCS_COMUNES, "Reporte de accidente laboral (FURAT)", "Autorización de la ARL"],
  SOAT: [
    ...DOCS_COMUNES,
    "FURIPS",
    "Copia del SOAT / póliza",
    "Informe de accidente de tránsito",
  ],
  PARTICULAR: [...DOCS_COMUNES, "Soporte / compromiso de pago"],
};

/** Devuelve los documentos base para un origen (o la lista genérica si no hay). */
export function documentosPorOrigen(origen?: OrigenDoc | null): string[] {
  if (origen && DOCUMENTOS_POR_ORIGEN[origen]) return DOCUMENTOS_POR_ORIGEN[origen];
  return DOCUMENTOS_DEFAULT;
}

export type DocItem = { label: string; marcado: boolean };

export type SnapshotEntrega = {
  paciente: string;
  documento: string;
  ips_receptora: string;
  empresa_traslado: string;
  fecha_entrega: string;
  documentos: DocItem[];
  caso_ref?: string;
  origen?: OrigenDoc | null;
  especialidad?: string;
  entidad_pago?: string;
  tipo_ambulancia?: string;
  quien_acepta?: string;
  cargo_acepta?: string;
};


/** Token aleatorio (48 hex). Nunca se persiste en texto plano. */
function generarToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** URL pública del enlace de firma (sin datos sensibles, solo el token). */
export function urlFirma(token: string): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/firma-entrega?t=${token}`;
}

/**
 * Crea una sesión de firma. Devuelve el id y el token en texto plano para
 * construir el QR (el token NO se guarda; solo su hash).
 */
export async function crearSesionFirma(params: {
  casoId: string;
  tipoCaso: string;
  snapshot: SnapshotEntrega;
  userId: string;
  nombreUsuario: string;
  seguimientoId?: string | null;
}): Promise<{ id: string; token: string; expira_at: string }> {
  const token = generarToken();
  const token_hash = await sha256Hex(token);
  const expira_at = new Date(Date.now() + TTL_FIRMA_MS).toISOString();

  const { data, error } = await supabase
    .from("entrega_firmas")
    .insert({
      caso_id: params.casoId,
      tipo_caso: params.tipoCaso,
      seguimiento_id: params.seguimientoId ?? null,
      token_hash,
      estado: "PENDIENTE",
      expira_at,
      usuario_genero: params.userId,
      nombre_usuario: params.nombreUsuario,
      snapshot: params.snapshot as never,
    })
    .select("id")
    .single();
  if (error) throw error;
  return { id: data.id, token, expira_at };
}

/** Anula una sesión activa (no podrá usarse). */
export async function anularSesion(id: string): Promise<void> {
  const { error } = await supabase
    .from("entrega_firmas")
    .update({ estado: "ANULADA" })
    .eq("id", id)
    .eq("estado", "PENDIENTE");
  if (error) throw error;
}

/** Genera el texto plano para Índigo de la entrega documental. */
export function generarPlantillaIndigoEntrega(s: SnapshotEntrega, firma?: {
  nombre: string;
  cargo: string;
  empresa: string;
  documento: string;
  firmado_at: string;
  codigo: string;
}): string {
  const docs = s.documentos
    .filter((d) => d.marcado)
    .map((d) => `• ${d.label}`)
    .join("\n");
  const base = [
    "LLEGADA DE AMBULANCIA / ENTREGA DOCUMENTAL",
    `Paciente: ${s.paciente}`,
    `Documento: ${s.documento}`,
    `IPS receptora: ${s.ips_receptora}`,
    `Empresa de traslado: ${s.empresa_traslado}`,
    `Fecha/hora de entrega: ${s.fecha_entrega}`,
    "",
    "Documentación entregada:",
    docs || "• (sin documentos marcados)",
  ];
  if (firma) {
    base.push(
      "",
      "FIRMA DE RECIBIDO:",
      `Firmante: ${firma.nombre}`,
      `Cargo: ${firma.cargo}`,
      `Empresa: ${firma.empresa}`,
      `Documento/ID: ${firma.documento}`,
      `Fecha/hora de firma: ${firma.firmado_at}`,
      `Código de verificación: ${firma.codigo}`,
    );
  }
  return base.join("\n");
}
