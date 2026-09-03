// Clasificación canónica de fallos de inicio de sesión.
// Objetivo: no mostrar "Credenciales incorrectas" ante cualquier excepción.
// No revela detalles técnicos al usuario; el detalle queda en consola/logs.

export type LoginFallo =
  | "AUTH_INVALID_CREDENTIALS"
  | "AUTH_USER_BANNED"
  | "AUTH_RATE_LIMIT"
  | "AUTH_EMAIL_NO_CONFIRMADO"
  | "RED"
  | "USUARIO_INACTIVO"
  | "PERFIL_INVALIDO"
  | "ROL_INVALIDO"
  | "TURNO_NO_PERMITIDO"
  | "SESION"
  | "INTERNO";

export const MENSAJES_LOGIN: Record<LoginFallo, string> = {
  AUTH_INVALID_CREDENTIALS: "Credenciales incorrectas. Verifica tu correo y contraseña.",
  AUTH_USER_BANNED: "Tu usuario se encuentra bloqueado. Contacta al administrador.",
  AUTH_RATE_LIMIT: "Demasiados intentos. Espera unos minutos e inténtalo nuevamente.",
  AUTH_EMAIL_NO_CONFIRMADO: "Tu correo aún no está confirmado. Contacta al administrador.",
  RED: "No fue posible conectar con el servidor. Verifica tu conexión e inténtalo nuevamente.",
  USUARIO_INACTIVO: "Tu usuario se encuentra inactivo. Contacta al administrador.",
  PERFIL_INVALIDO: "No fue posible validar tu perfil de acceso.",
  ROL_INVALIDO: "No fue posible validar los permisos de tu usuario.",
  TURNO_NO_PERMITIDO: "El turno seleccionado no corresponde al horario autorizado.",
  SESION: "No fue posible establecer la sesión. Intenta nuevamente.",
  INTERNO: "No fue posible iniciar sesión. Intenta nuevamente o contacta al administrador.",
};

/** Traduce un error de Supabase Auth (o de red) a un fallo canónico. */
export function clasificarErrorAuth(error: unknown): LoginFallo {
  if (!error) return "INTERNO";
  const e = error as { status?: number; code?: string; name?: string; message?: string };
  const code = (e.code ?? "").toLowerCase();
  const msg = (e.message ?? "").toLowerCase();
  const status = typeof e.status === "number" ? e.status : undefined;

  if (status === 429 || code.includes("rate_limit") || msg.includes("rate limit")) {
    return "AUTH_RATE_LIMIT";
  }
  if (code === "user_banned" || msg.includes("banned")) return "AUTH_USER_BANNED";
  if (code === "email_not_confirmed" || msg.includes("email not confirmed")) {
    return "AUTH_EMAIL_NO_CONFIRMADO";
  }
  if (code === "invalid_credentials" || msg.includes("invalid login credentials")) {
    return "AUTH_INVALID_CREDENTIALS";
  }
  if (
    e.name === "AuthRetryableFetchError" ||
    e.name === "TypeError" ||
    msg.includes("failed to fetch") ||
    msg.includes("network") ||
    (status !== undefined && status >= 500)
  ) {
    return "RED";
  }
  if (status === 400 || status === 401) return "AUTH_INVALID_CREDENTIALS";
  return "INTERNO";
}

export function mensajeLogin(fallo: LoginFallo): string {
  return MENSAJES_LOGIN[fallo];
}
