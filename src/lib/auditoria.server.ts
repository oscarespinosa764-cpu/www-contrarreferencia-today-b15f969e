// Server-only audit writer. Runs with the service role and attributes every
// entry to the server-verified user id. NEVER import this from client code.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sanitizeAuditoria } from "./auditoria-allowlist";

export type AuditoriaPayload = {
  accion: string;
  modulo?: string | null;
  tabla?: string | null;
  registroId?: string | null;
  resultado?: string | null;
  detalles?: Record<string, unknown> | null;
};

// Writes an audit entry attributed to `userId`. Never throws: auditing must
// not interrupt the underlying operation. All fields are sanitized against the
// shared allowlists (defense in depth for internal server callers too).
export async function registrarAuditoriaServer(
  userId: string,
  payload: AuditoriaPayload,
): Promise<void> {
  try {
    const clean = sanitizeAuditoria(payload);
    await (supabaseAdmin as unknown as {
      rpc: (n: string, a: Record<string, unknown>) => Promise<unknown>;
    }).rpc("registrar_auditoria_srv", {
      _user_id: userId,
      _accion: clean.accion,
      _modulo: clean.modulo,
      _tabla: clean.tabla,
      _registro_id: clean.registroId,
      _resultado: clean.resultado,
      _detalles: clean.detalles,
    });
  } catch {
    /* la auditoría no debe interrumpir la operación */
  }
}
