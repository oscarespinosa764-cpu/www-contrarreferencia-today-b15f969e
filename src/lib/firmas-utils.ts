import { supabase } from "@/lib/backend-client";

/** Convierte un dataURL PNG a Blob. */
function dataURLtoBlob(dataUrl: string): Blob {
  const [head, body] = dataUrl.split(",");
  const mime = /:(.*?);/.exec(head)?.[1] || "image/png";
  const bin = atob(body);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

/** SHA-256 (hex) de una cadena. */
export async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Guarda la firma del usuario en el bucket PRIVADO `firmas` (carpeta = user_id),
 * marca como inactivas las anteriores y registra una nueva fila activa.
 * Devuelve { id, hash, path }.
 */
export async function guardarFirma(params: {
  userId: string;
  uploadedBy: string;
  dataUrl: string;
}): Promise<{ id: string; hash: string; path: string }> {
  const { userId, uploadedBy, dataUrl } = params;
  const hash = await sha256Hex(dataUrl);
  const path = `${userId}/firma-${Date.now()}.png`;
  const blob = dataURLtoBlob(dataUrl);

  const { error: upErr } = await supabase.storage
    .from("firmas")
    .upload(path, blob, { contentType: "image/png", upsert: true });
  if (upErr) throw upErr;

  // Desactivar firmas previas del usuario
  await supabase.from("user_signatures").update({ active: false }).eq("user_id", userId);

  const { data, error } = await supabase
    .from("user_signatures")
    .insert({
      user_id: userId,
      uploaded_by: uploadedBy,
      signature_path: path,
      signature_hash: hash,
      active: true,
    })
    .select("id")
    .single();
  if (error) throw error;

  return { id: data.id, hash, path };
}

/** Obtiene la firma activa del usuario (si existe) con URL firmada temporal. */
export async function getFirmaActiva(userId: string): Promise<{
  id: string;
  hash: string | null;
  signedUrl: string | null;
} | null> {
  const { data } = await supabase
    .from("user_signatures")
    .select("id, signature_path, signature_hash")
    .eq("user_id", userId)
    .eq("active", true)
    .maybeSingle();
  if (!data) return null;
  let signedUrl: string | null = null;
  if (data.signature_path) {
    const { data: signed } = await supabase.storage
      .from("firmas")
      .createSignedUrl(data.signature_path, 60 * 30);
    signedUrl = signed?.signedUrl ?? null;
  }
  return { id: data.id, hash: data.signature_hash, signedUrl };
}

/**
 * Devuelve la firma (data URL PNG) a partir del id de una fila user_signatures.
 * Sirve para incrustar la firma en PDF generados bajo demanda (admin puede leer
 * cualquier firma; el usuario solo la propia, según RLS).
 */
/** Devuelve la firma activa (data URL PNG) de un usuario por su user_id. */
export async function getFirmaDataUrlByUser(userId: string): Promise<string | null> {
  const { data } = await supabase
    .from("user_signatures")
    .select("id")
    .eq("user_id", userId)
    .eq("active", true)
    .maybeSingle();
  if (!data?.id) return null;
  return getFirmaDataUrlById(data.id);
}

export async function getFirmaDataUrlById(signatureId: string): Promise<string | null> {
  const { data } = await supabase
    .from("user_signatures")
    .select("signature_path")
    .eq("id", signatureId)
    .maybeSingle();
  if (!data?.signature_path) return null;
  const { data: signed } = await supabase.storage
    .from("firmas")
    .createSignedUrl(data.signature_path, 60 * 5);
  if (!signed?.signedUrl) return null;
  try {
    const res = await fetch(signed.signedUrl);
    const blob = await res.blob();
    return await new Promise<string>((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result as string);
      fr.onerror = reject;
      fr.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}
