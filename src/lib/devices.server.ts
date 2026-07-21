// Server-only helpers para el subsistema de autorización de navegadores.
// Nunca importar desde código de cliente.

const CHALLENGE_TTL_SEC = 120;

export type DevicePurpose =
  | "REGISTER_DEVICE"
  | "VERIFY_DEVICE"
  | "LINK_SESSION"
  | "REVOKE_DEVICE"
  | "ADMIN_APPROVAL";

function base64urlEncode(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64urlDecode(str: string): Uint8Array {
  const s = str.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((str.length + 3) % 4);
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  const bytes = new Uint8Array(buf);
  let hex = "";
  for (let i = 0; i < bytes.length; i++) hex += bytes[i].toString(16).padStart(2, "0");
  return hex;
}

/** Crea un desafío aleatorio y persiste su hash. Devuelve el desafío en claro para el cliente. */
export async function createChallenge(
  userId: string,
  purpose: DevicePurpose,
  deviceId?: string | null,
): Promise<{ challenge: string; expiresAt: string }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const raw = new Uint8Array(32);
  crypto.getRandomValues(raw);
  const challenge = base64urlEncode(raw);
  const hash = await sha256Hex(challenge);
  const expiresAt = new Date(Date.now() + CHALLENGE_TTL_SEC * 1000).toISOString();

  const { error } = await (supabaseAdmin as unknown as {
    from: (t: string) => {
      insert: (r: Record<string, unknown>) => Promise<{ error: unknown }>;
    };
  })
    .from("device_challenges")
    .insert({
      user_id: userId,
      device_id: deviceId ?? null,
      challenge_hash: hash,
      purpose,
      expires_at: expiresAt,
    });

  if (error) throw new Error("No se pudo crear el desafío.");
  return { challenge, expiresAt };
}

/** Consume un desafío (verifica que exista, no haya expirado ni se haya usado). */
export async function consumeChallenge(
  userId: string,
  challenge: string,
  purpose: DevicePurpose,
): Promise<boolean> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const hash = await sha256Hex(challenge);
  const admin = supabaseAdmin as unknown as {
    from: (t: string) => {
      select: (c: string) => {
        eq: (k: string, v: unknown) => {
          eq: (k: string, v: unknown) => {
            eq: (k: string, v: unknown) => {
              is: (k: string, v: unknown) => {
                gt: (k: string, v: unknown) => {
                  maybeSingle: () => Promise<{ data: { id: string } | null }>;
                };
              };
            };
          };
        };
      };
      update: (r: Record<string, unknown>) => {
        eq: (k: string, v: unknown) => Promise<{ error: unknown }>;
      };
    };
  };

  const { data } = await admin
    .from("device_challenges")
    .select("id")
    .eq("user_id", userId)
    .eq("challenge_hash", hash)
    .eq("purpose", purpose)
    .is("used_at", null)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  if (!data) return false;
  await admin
    .from("device_challenges")
    .update({ used_at: new Date().toISOString() })
    .eq("id", data.id);
  return true;
}

/** Verifica una firma ECDSA P-256 SHA-256 en formato IEEE P1363 (64 bytes) o DER. */
export async function verifyEcdsaSignature(
  publicKeyJwk: JsonWebKey,
  challenge: string,
  signatureB64u: string,
): Promise<boolean> {
  try {
    const key = await crypto.subtle.importKey(
      "jwk",
      publicKeyJwk,
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["verify"],
    );
    const sig = base64urlDecode(signatureB64u);
    const data = new TextEncoder().encode(challenge);
    return await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, key, sig, data);
  } catch (e) {
    console.error("[devices] verifyEcdsaSignature", e);
    return false;
  }
}

/** Resumen de user-agent (marca del navegador y SO), sin datos identificatorios extra. */
export function resumirUserAgent(ua: string | null | undefined): {
  navegador: string;
  sistema_operativo: string;
  tipo_dispositivo: string;
  user_agent_resumido: string;
} {
  const u = (ua ?? "").slice(0, 300);
  const nav = /Edg\//.test(u)
    ? "Edge"
    : /OPR\//.test(u)
      ? "Opera"
      : /Chrome\//.test(u)
        ? "Chrome"
        : /Firefox\//.test(u)
          ? "Firefox"
          : /Safari\//.test(u)
            ? "Safari"
            : "Desconocido";
  const so = /Windows NT/.test(u)
    ? "Windows"
    : /Mac OS X/.test(u)
      ? "macOS"
      : /Android/.test(u)
        ? "Android"
        : /iPhone|iPad|iOS/.test(u)
          ? "iOS"
          : /Linux/.test(u)
            ? "Linux"
            : "Desconocido";
  const tipo = /Mobile|Android|iPhone/.test(u) ? "movil" : /iPad|Tablet/.test(u) ? "tablet" : "escritorio";
  return {
    navegador: nav,
    sistema_operativo: so,
    tipo_dispositivo: tipo,
    user_agent_resumido: u.slice(0, 160),
  };
}
