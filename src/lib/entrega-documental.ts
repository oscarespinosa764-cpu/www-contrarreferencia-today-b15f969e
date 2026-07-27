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

/**
 * Origen / responsable documental.
 *
 * `SOAT_ADRES` es el código canónico para registros nuevos (unifica SOAT y ADRES
 * en una sola opción visible: "SOAT / ADRES"). Los códigos `SOAT` y `ADRES`
 * quedan reservados para retrocompatibilidad con registros históricos y NO se
 * ofrecen como opciones en el selector. Fase 5B — Parte 4.
 */
export type OrigenDoc = "EPS" | "ARL" | "SOAT_ADRES" | "SOAT" | "ADRES" | "PARTICULAR";

/** Opciones VISIBLES en el selector para registros nuevos. */
export const ORIGENES_DOC: { value: OrigenDoc; label: string }[] = [
  { value: "EPS", label: "EPS" },
  { value: "SOAT_ADRES", label: "SOAT / ADRES" },
  { value: "ARL", label: "ARL / Póliza estudiantil" },
  { value: "PARTICULAR", label: "Particular" },
];

/** Etiqueta legible para cualquier código (incluidos históricos). */
export function labelOrigenDoc(o?: OrigenDoc | string | null): string {
  const v = (o ?? "").toString().toUpperCase();
  if (v === "SOAT_ADRES") return "SOAT / ADRES";
  if (v === "SOAT") return "SOAT";
  if (v === "ADRES") return "ADRES";
  if (v === "EPS") return "EPS";
  if (v === "ARL") return "ARL / Póliza estudiantil";
  if (v === "PARTICULAR") return "Particular";
  return v || "—";
}

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

const DOCS_SOAT_ADRES = [
  ...DOCS_COMUNES,
  "FURIPS",
  "Copia del SOAT / póliza",
  "Informe de accidente de tránsito",
];

/**
 * Lista de chequeo por defecto según el origen documental.
 * NOTA: mientras no exista un catálogo administrable en BD, estos valores actúan
 * como plantilla base; el usuario puede agregar/quitar documentos en el modal.
 * Los códigos históricos SOAT y ADRES consumen la MISMA lista canónica que
 * SOAT_ADRES para no duplicar ítems.
 */
export const DOCUMENTOS_POR_ORIGEN: Record<OrigenDoc, string[]> = {
  EPS: [...DOCS_COMUNES, "Autorización de la EAPB", "Carné / certificado de afiliación EPS"],
  ARL: [...DOCS_COMUNES, "Reporte de accidente laboral (FURAT)", "Autorización de la ARL / Póliza"],
  SOAT_ADRES: DOCS_SOAT_ADRES,
  SOAT: DOCS_SOAT_ADRES,
  ADRES: DOCS_SOAT_ADRES,
  PARTICULAR: [...DOCS_COMUNES, "Soporte / compromiso de pago"],
};

/** Devuelve los documentos base para un origen (o la lista genérica si no hay). */
export function documentosPorOrigen(origen?: OrigenDoc | null): string[] {
  if (origen && DOCUMENTOS_POR_ORIGEN[origen]) return DOCUMENTOS_POR_ORIGEN[origen];
  return DOCUMENTOS_DEFAULT;
}

/** Tipo de catálogo administrable (editable sin código) para la lista de chequeo. */
export const CATALOGO_DOC_ENTREGA = "DOC_ENTREGA";

/**
 * Lista de chequeo administrable por origen (Parte 12.3).
 *
 * Lee la tabla `catalogos` (tipo = DOC_ENTREGA), donde cada fila es un documento:
 *   valor  = nombre del documento
 *   extra1 = origen al que aplica: EPS | ARL | SOAT | PARTICULAR | COMUN (o vacío = común)
 *
 * Se combinan los documentos COMUNES + los específicos del origen, respetando el
 * orden del catálogo. Si el catálogo no tiene filas configuradas, se devuelve la
 * plantilla base por código para no romper el flujo.
 */
export async function fetchDocumentosPorOrigen(origen?: OrigenDoc | null): Promise<string[]> {
  try {
    const { data, error } = await supabase
      .from("catalogos")
      .select("valor, extra1, activo")
      .eq("tipo", CATALOGO_DOC_ENTREGA)
      .eq("activo", true)
      .order("valor");
    if (error) throw error;

    const rows = (data ?? []) as { valor: string; extra1: string | null }[];
    if (rows.length === 0) return documentosPorOrigen(origen);

    const norm = (v?: string | null) => (v ?? "").trim().toUpperCase();
    const org = norm(origen);
    // SOAT_ADRES consume filas marcadas para SOAT o ADRES (compatibilidad con
    // catálogos existentes que aún separan ambos códigos).
    const aplica = (e: string): boolean => {
      if (e === "" || e === "COMUN" || e === "COMÚN") return true;
      if (org === "SOAT_ADRES") return e === "SOAT_ADRES" || e === "SOAT" || e === "ADRES";
      return e === org;
    };
    const seleccion = rows.filter((r) => aplica(norm(r.extra1)));


    if (seleccion.length === 0) return documentosPorOrigen(origen);
    // Deduplica respetando orden.
    const vistos = new Set<string>();
    const out: string[] = [];
    for (const r of seleccion) {
      const label = r.valor.trim();
      const key = label.toUpperCase();
      if (label && !vistos.has(key)) {
        vistos.add(key);
        out.push(label);
      }
    }
    return out.length ? out : documentosPorOrigen(origen);
  } catch {
    return documentosPorOrigen(origen);
  }
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
  // Referencia técnica a la ACEPTACIÓN DE IPS RECEPTORA vigente resuelta
  // server-side por `resolverAceptacionVigente`. Fase 5B — Bloque 2A.
  aceptacion_origen_id?: string | null;
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

/**
 * Plantilla ÍNDIGO CORTA para entrega documental (Parte 14).
 * Breve por el límite de caracteres de Índigo. En MAYÚSCULAS.
 */
export function generarPlantillaIndigoCorta(
  s: SnapshotEntrega,
  firma?: { nombre: string; cargo: string },
): string {
  const empresa = (s.empresa_traslado || "LA EMPRESA DE AMBULANCIA").toUpperCase();
  const ips = (s.ips_receptora || "LA IPS RECEPTORA").toUpperCase();
  const firmante = firma?.nombre ? firma.nombre.toUpperCase() : "EL PERSONAL DE TRASLADO";
  const cargo = firma?.cargo ? ` - ${firma.cargo.toUpperCase()}` : "";
  if (s.origen) {
    return (
      `SE REALIZA ENTREGA DE DOCUMENTACIÓN TIPO ${s.origen} A ${empresa} PARA TRASLADO A ${ips}. ` +
      `DOCUMENTACIÓN VERIFICADA Y RECIBIDA POR ${firmante}${cargo}.`
    );
  }
  return (
    `SE REALIZA ENTREGA DE DOCUMENTACIÓN A ${empresa} PARA TRASLADO DEL PACIENTE A ${ips}. ` +
    `SE VERIFICA ENTREGA DOCUMENTAL SEGÚN LISTA DE CHEQUEO INSTITUCIONAL, FIRMADA POR ${firmante}${cargo}.`
  );
}

