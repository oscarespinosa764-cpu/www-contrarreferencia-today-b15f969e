import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader, getRequestIP } from "@tanstack/react-start/server";
import { z } from "zod";

// ────────────────────────────────────────────────────────────────────────────
// Firma por QR — endpoints PÚBLICOS protegidos por TOKEN (sin login).
//
// El QR contiene una URL con un token aleatorio. En la base de datos NUNCA se
// guarda el token en texto plano: solo su hash SHA-256. Estas funciones validan
// el token, controlan vencimiento y uso único, y registran la evidencia.
//
// No se usan proveedores externos pagos, ni IA, ni almacenamiento de PDFs:
// la evidencia se guarda como datos estructurados livianos.
// ────────────────────────────────────────────────────────────────────────────

/** SHA-256 (hex) usando Web Crypto (disponible en el runtime del worker). */
async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Código de verificación corto y legible (sin caracteres ambiguos). */
function generarCodigoVerificacion(): string {
  const abc = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    out += abc[bytes[i] % abc.length];
    if (i === 3) out += "-";
  }
  return out;
}

// Forma COMPLETA del snapshot almacenado (uso interno). Contiene PHI y NUNCA
// se devuelve tal cual a la ruta pública.
type EntregaSnapshotInterno = {
  paciente?: string;
  documento?: string;
  ips_receptora?: string;
  empresa_traslado?: string;
  fecha_entrega?: string;
  documentos?: ({ label: string; marcado?: boolean } | string)[];
  caso_id?: string;
  caso_ref?: string;
  [k: string]: unknown;
};

// Forma MÍNIMA que ve el firmante externo en la ruta pública (sin login).
// Solo datos estrictamente necesarios para confirmar la entrega: iniciales,
// documento enmascarado, IPS receptora y la lista de documentos a recibir.
export type SnapshotPublico = {
  paciente_iniciales?: string;
  documento_enmascarado?: string;
  ips_receptora?: string;
  fecha_entrega?: string;
  documentos?: string[];
};

/** Convierte "Juan Pérez Gómez" → "J.P.G." (nunca expone el nombre completo). */
function inicialesNombre(nombre?: string): string {
  const partes = (nombre ?? "").trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "—";
  return partes.map((p) => p[0]!.toUpperCase()).join(".") + ".";
}

/** Enmascara un documento dejando solo los últimos 2 dígitos: 1117545825 → •••••••25 */
function enmascararDocumento(doc?: string): string {
  const d = (doc ?? "").replace(/\s+/g, "");
  if (!d) return "—";
  if (d.length <= 2) return "•".repeat(d.length);
  return "•".repeat(Math.max(3, d.length - 2)) + d.slice(-2);
}

/** Reduce el snapshot interno a lo mínimo visible en la ruta pública. */
function snapshotPublicoDesde(raw: EntregaSnapshotInterno): SnapshotPublico {
  const docs = (raw.documentos ?? [])
    .map((d) => (typeof d === "string" ? { label: d, marcado: true } : d))
    .filter((d) => d && d.marcado !== false)
    .map((d) => d.label)
    .filter((l): l is string => typeof l === "string" && l.length > 0);
  return {
    paciente_iniciales: inicialesNombre(raw.paciente),
    documento_enmascarado: enmascararDocumento(raw.documento),
    ips_receptora: raw.ips_receptora || undefined,
    fecha_entrega: raw.fecha_entrega || undefined,
    documentos: docs,
  };
}

type SesionPublica = {
  estado: "PENDIENTE" | "FIRMADA" | "VENCIDA" | "ANULADA" | "NO_EXISTE";
  snapshot?: SnapshotPublico;
  codigo_verificacion?: string | null;
};

/** Lee la sesión asociada a un token y devuelve solo información mínima. */
export const obtenerSesionFirma = createServerFn({ method: "POST" })
  .inputValidator((data: { token: string }) =>
    z.object({ token: z.string().min(10).max(200) }).parse(data),
  )
  .handler(async ({ data }): Promise<SesionPublica> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const tokenHash = await sha256Hex(data.token);

    const { data: row } = await supabaseAdmin
      .from("entrega_firmas")
      .select("id, estado, expira_at, snapshot, codigo_verificacion")
      .eq("token_hash", tokenHash)
      .maybeSingle();

    if (!row) return { estado: "NO_EXISTE" };

    if (row.estado === "FIRMADA")
      return { estado: "FIRMADA", codigo_verificacion: row.codigo_verificacion };
    if (row.estado === "ANULADA") return { estado: "ANULADA" };

    // Vencimiento (marca como VENCIDA de forma perezosa, sin tareas programadas).
    if (new Date(row.expira_at).getTime() < Date.now()) {
      if (row.estado !== "VENCIDA") {
        await supabaseAdmin
          .from("entrega_firmas")
          .update({ estado: "VENCIDA" })
          .eq("id", row.id);
      }
      return { estado: "VENCIDA" };
    }

    // Solo datos mínimos enmascarados: nunca se envía el snapshot crudo con PHI.
    return {
      estado: "PENDIENTE",
      snapshot: snapshotPublicoDesde((row.snapshot ?? {}) as EntregaSnapshotInterno),
    };
  });

const firmaInput = z.object({
  token: z.string().min(10).max(200),
  firmante_nombre: z.string().trim().min(2).max(160),
  firmante_cargo: z.string().trim().min(2).max(120),
  firmante_empresa: z.string().trim().max(160).optional().default(""),
  firmante_documento: z.string().trim().max(60).optional().default(""),
  firmante_telefono: z.string().trim().max(40).optional().default(""),
  firma_data: z.string().min(50).max(700000), // dataURL PNG
  aceptacion: z.literal(true),
});

type FirmaResultado =
  | { ok: true; codigo_verificacion: string; firmado_at: string }
  | { ok: false; error: "NO_EXISTE" | "VENCIDA" | "FIRMADA" | "ANULADA" | "DATOS" };

/** Registra la firma del personal externo. Valida token, vencimiento y uso único. */
export const firmarEntrega = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => firmaInput.parse(data))
  .handler(async ({ data }): Promise<FirmaResultado> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const tokenHash = await sha256Hex(data.token);

    const { data: row } = await supabaseAdmin
      .from("entrega_firmas")
      .select("id, estado, expira_at, snapshot, usuario_genero, caso_id")
      .eq("token_hash", tokenHash)
      .maybeSingle();

    if (!row) return { ok: false, error: "NO_EXISTE" };
    if (row.estado === "FIRMADA") return { ok: false, error: "FIRMADA" };
    if (row.estado === "ANULADA") return { ok: false, error: "ANULADA" };
    if (new Date(row.expira_at).getTime() < Date.now()) {
      await supabaseAdmin.from("entrega_firmas").update({ estado: "VENCIDA" }).eq("id", row.id);
      return { ok: false, error: "VENCIDA" };
    }

    const ip =
      getRequestIP({ xForwardedFor: true }) ?? getRequestHeader("cf-connecting-ip") ?? null;
    const ua = getRequestHeader("user-agent") ?? null;
    const codigo = generarCodigoVerificacion();
    const firmadoAt = new Date().toISOString();

    // Hash de evidencia (no es el PDF, es el resumen estructurado firmado).
    const pdfHash = await sha256Hex(
      JSON.stringify({
        caso: row.caso_id,
        firmante: data.firmante_nombre,
        cargo: data.firmante_cargo,
        firmadoAt,
        codigo,
      }),
    );

    const { error: upErr } = await supabaseAdmin
      .from("entrega_firmas")
      .update({
        estado: "FIRMADA",
        firmante_nombre: data.firmante_nombre,
        firmante_cargo: data.firmante_cargo,
        firmante_empresa: data.firmante_empresa || null,
        firmante_documento: data.firmante_documento || null,
        firmante_telefono: data.firmante_telefono || null,
        aceptacion: true,
        firma_data: data.firma_data,
        firma_ip: ip,
        firma_user_agent: ua,
        firmado_at: firmadoAt,
        codigo_verificacion: codigo,
        pdf_hash: pdfHash,
      })
      .eq("id", row.id)
      .eq("estado", "PENDIENTE"); // condición de uso único (carrera)

    if (upErr) return { ok: false, error: "DATOS" };

    // Auditoría atribuida al usuario interno que generó el QR.
    try {
      if (row.usuario_genero) {
        const { registrarAuditoriaServer } = await import("./auditoria.server");
        await registrarAuditoriaServer(row.usuario_genero, {
          accion: "FIRMA_ENTREGA_EXTERNA",
          modulo: "remisiones salientes",
          tabla: "entrega_firmas",
          registroId: row.id,
          resultado: "exito",
          detalles: { codigo, firmante: data.firmante_nombre, ip },
        });
      }
    } catch {
      /* la auditoría no interrumpe la firma */
    }

    return {
      ok: true,
      codigo_verificacion: codigo,
      firmado_at: firmadoAt,
      snapshot: (row.snapshot ?? {}) as EntregaSnapshot,
      firmante: {
        nombre: data.firmante_nombre,
        cargo: data.firmante_cargo,
        empresa: data.firmante_empresa || "",
        documento: data.firmante_documento || "",
        telefono: data.firmante_telefono || "",
      },
      firma_data: data.firma_data,
    };
  });
