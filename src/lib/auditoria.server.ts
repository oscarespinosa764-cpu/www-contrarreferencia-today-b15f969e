// Server-only audit writer. Runs with the service role and attributes every
// entry to the server-verified user id. NEVER import this from client code.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type AuditoriaPayload = {
  accion: string;
  modulo?: string | null;
  tabla?: string | null;
  registroId?: string | null;
  resultado?: string | null;
  detalles?: Record<string, unknown> | null;
};

// Writes an audit entry attributed to `userId`. Never throws: auditing must
// not interrupt the underlying operation.
export async function registrarAuditoriaServer(
  userId: string,
  payload: AuditoriaPayload,
): Promise<void> {
  try {
    await (supabaseAdmin as unknown as {
      rpc: (n: string, a: Record<string, unknown>) => Promise<unknown>;
    }).rpc("registrar_auditoria_srv", {
      _user_id: userId,
      _accion: payload.accion,
      _modulo: payload.modulo ?? null,
      _tabla: payload.tabla ?? null,
      _registro_id: payload.registroId ?? null,
      _resultado: payload.resultado ?? "exito",
      _detalles: payload.detalles ?? null,
    });
  } catch {
    /* la auditoría no debe interrumpir la operación */
  }
}
