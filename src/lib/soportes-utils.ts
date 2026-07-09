// ============================================================================
// Soportes de permisos (Cita médica / Calamidad) — bucket PRIVADO.
// Validación de extensión + MIME + tamaño, subida a `permiso-soportes`
// bajo la carpeta {user_id}/, y URL firmada temporal para lectura.
// Nunca base64, nunca público, nunca en auditoría. Metadata mínima.
// ============================================================================
import { supabase } from "@/lib/backend-client";

export const SOPORTE_EXT = ["pdf", "jpg", "jpeg", "png", "webp"] as const;
export const SOPORTE_MIME = ["application/pdf", "image/jpeg", "image/png", "image/webp"] as const;
export const SOPORTE_MAX_BYTES = 8 * 1024 * 1024; // 8 MB

export interface SoporteMetadata {
  nombre: string; // nombre sanitizado
  mime: string;
  size: number;
  path: string; // ruta privada
  uploaded_at: string;
  uploaded_by: string;
}

function sanitizeNombre(name: string): string {
  return name.replace(/[^\w.\-]+/g, "_").slice(-120);
}

/** Firma "mágica" mínima para detectar el tipo real del archivo. */
async function detectMimeReal(file: File): Promise<string | null> {
  const buf = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const hex = Array.from(buf)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  // PDF: 25 50 44 46 ("%PDF")
  if (hex.startsWith("25504446")) return "application/pdf";
  // JPEG: FF D8 FF
  if (hex.startsWith("ffd8ff")) return "image/jpeg";
  // PNG: 89 50 4E 47
  if (hex.startsWith("89504e47")) return "image/png";
  // WEBP: "RIFF"...."WEBP"
  if (hex.startsWith("52494646") && hex.slice(16, 24) === "57454250") return "image/webp";
  return null;
}

export function validarNombreExt(name: string): boolean {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return (SOPORTE_EXT as readonly string[]).includes(ext);
}

/** Valida y sube el soporte. Devuelve la metadata mínima. */
export async function subirSoporte(params: {
  userId: string;
  file: File;
}): Promise<SoporteMetadata> {
  const { userId, file } = params;

  if (!validarNombreExt(file.name)) {
    throw new Error("Formato no permitido. Usa PDF, JPG, JPEG, PNG o WEBP.");
  }
  if (file.size <= 0) throw new Error("El archivo está vacío.");
  if (file.size > SOPORTE_MAX_BYTES) {
    throw new Error("El archivo supera el tamaño máximo permitido (8 MB).");
  }
  // MIME declarado + MIME real (evita ejecutables renombrados como PDF).
  const real = await detectMimeReal(file);
  if (!real || !(SOPORTE_MIME as readonly string[]).includes(real)) {
    throw new Error("El contenido del archivo no corresponde a un soporte válido.");
  }
  if (file.type && !(SOPORTE_MIME as readonly string[]).includes(file.type)) {
    throw new Error("Tipo de archivo no permitido.");
  }

  const ext = file.name.split(".").pop()?.toLowerCase() ?? "bin";
  const path = `${userId}/soporte-${Date.now()}.${ext}`;
  const { error } = await supabase.storage
    .from("permiso-soportes")
    .upload(path, file, { contentType: real, upsert: false });
  if (error) throw error;

  return {
    nombre: sanitizeNombre(file.name),
    mime: real,
    size: file.size,
    path,
    uploaded_at: new Date().toISOString(),
    uploaded_by: userId,
  };
}

/** URL firmada temporal para ver el soporte (solo dueño/admin por RLS). */
export async function getSoporteSignedUrl(path: string, secs = 300): Promise<string | null> {
  if (!path) return null;
  const { data } = await supabase.storage.from("permiso-soportes").createSignedUrl(path, secs);
  return data?.signedUrl ?? null;
}

/** Elimina un soporte antes de enviar (limpieza). */
export async function eliminarSoporte(path: string): Promise<void> {
  if (!path) return;
  await supabase.storage.from("permiso-soportes").remove([path]);
}
