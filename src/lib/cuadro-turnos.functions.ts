// FASE 6 · BLOQUE B — Eliminación de turnos programados (Cuadro de Turno).
// Núcleo único server-side para el borrado individual y el borrado múltiple:
// la RPC canónica valida actor admin ACTIVO, relee las filas con lock, audita
// dentro de la misma transacción y ejecuta un único DELETE bajo el contexto
// transaccional app.shift_delete_ctx. El DELETE directo está bloqueado por
// trigger fail-closed en la base de datos.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export type EliminarTurnosResultado = {
  ok: boolean;
  eliminados?: number;
  idsEliminados?: string[];
  loteId?: string;
  error?: string;
};

const schema = z
  .object({
    ids: z.array(z.string().uuid()).min(1).max(200),
    scheduleId: z.string().uuid(),
    memberId: z.string().uuid(),
  })
  .strict();

const MENSAJES: Record<string, string> = {
  NO_AUTENTICADO: "No tiene permisos para eliminar turnos.",
  SIN_PERMISO: "No tiene permisos para eliminar turnos.",
  INACTIVO: "El usuario no está activo.",
  LOTE_NO_VALIDO: "No fue posible eliminar los turnos seleccionados.",
  PROGRAMACION_CAMBIO:
    "La programación cambió. Actualice el Cuadro de Turno e inténtelo nuevamente.",
};

type RpcFn = (
  name: string,
  args: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message: string } | null }>;

export const eliminarTurnosProgramadosLote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => {
    const parsed = schema.parse(input);
    const ids = Array.from(new Set(parsed.ids));
    if (ids.length === 0 || ids.length > 200) throw new Error("LOTE_NO_VALIDO");
    return { ...parsed, ids };
  })
  .handler(async ({ data, context }): Promise<EliminarTurnosResultado> => {
    const { data: isActive } = await (context.supabase.rpc as unknown as RpcFn)(
      "is_active_member",
      { _user_id: context.userId },
    );
    if (!isActive) return { ok: false, error: MENSAJES.INACTIVO };

    const { data: isAdmin } = await (context.supabase.rpc as unknown as RpcFn)("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) return { ok: false, error: MENSAJES.SIN_PERMISO };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: res, error } = await (supabaseAdmin.rpc as unknown as RpcFn)(
      "eliminar_turnos_programados_lote",
      {
        _actor: context.userId,
        _schedule_id: data.scheduleId,
        _member_id: data.memberId,
        _ids: data.ids,
      },
    );
    if (error) {
      console.error("eliminarTurnosProgramadosLote", error.message);
      return { ok: false, error: "No fue posible eliminar los turnos seleccionados." };
    }
    const out = (res ?? {}) as {
      ok?: boolean;
      eliminados?: number;
      ids_eliminados?: string[];
      lote_id?: string;
      error?: string;
    };
    if (!out.ok) {
      return {
        ok: false,
        error:
          MENSAJES[out.error ?? ""] ?? "No fue posible eliminar los turnos seleccionados.",
      };
    }
    return {
      ok: true,
      eliminados: out.eliminados ?? 0,
      idsEliminados: out.ids_eliminados ?? [],
      loteId: out.lote_id,
    };
  });
