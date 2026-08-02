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

// ============================================================================
// FASE 9 · BLOQUE C.2 — Creación y decisión server-authoritative de solicitudes.
// Toda la autoridad vive en la RPC transaccional: el cliente solo envía la
// intención mínima. El actor SIEMPRE proviene de la sesión (context.userId).
// ============================================================================

const MENSAJES_C2: Record<string, string> = {
  PROGRAMACION_CAMBIADA:
    "La programación cambió después de crear la solicitud. Revise nuevamente los turnos antes de aprobar.",
  REEMPLAZO_OCUPADO: "El reemplazo seleccionado ya tiene un turno programado para esta fecha.",
  REEMPLAZO_CONFLICTO_HORARIO:
    "El reemplazo tiene una programación que se cruza con el turno solicitado.",
  MIEMBRO_NO_VINCULADO: "El colaborador no está vinculado correctamente al Cuadro de Turno.",
  IDENTIDAD_AMBIGUA: "No fue posible identificar de forma única al colaborador.",
  SCHEDULE_AMBIGUO: "Existe más de un Cuadro de Turno para este periodo.",
  PROGRAMACION_INCONSISTENTE: "La programación presenta una inconsistencia.",
  SIN_TURNO: "No existe turno programado para aplicar esta solicitud.",
  DOBLE_DECISION: "La solicitud ya fue procesada.",
  SIN_PERMISO: "No tiene permisos para realizar esta operación.",
  LIMITE_MENSUAL: "Alcanzó el límite mensual de solicitudes.",
  ERROR_GENERAL: "No fue posible procesar la solicitud.",
};

function mensajeC2(code: string | undefined | null): string {
  return MENSAJES_C2[code ?? ""] ?? MENSAJES_C2.ERROR_GENERAL;
}

const FECHA_C2 = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const HORA_C2 = z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/);

const fraccionSchema = z
  .object({
    return_date: FECHA_C2.nullable().optional(),
    receiver_id: z.string().uuid().nullable().optional(),
    receiver_name: z.string().max(160).nullable().optional(),
    receiver_role: z.string().max(160).nullable().optional(),
    shift_code: z.string().max(32).nullable().optional(),
    start_time: HORA_C2.nullable().optional(),
    end_time: HORA_C2.nullable().optional(),
    minutes: z.number().int().min(0).max(1440).optional(),
    notes: z.string().max(500).nullable().optional(),
  })
  .strict();

const crearSchema = z
  .object({
    request_type: z.enum(["permiso", "cambio_turno"]),
    reason_type: z.string().max(80),
    other_reason: z.string().max(300).nullable().optional(),
    reason_recoverable: z.boolean().optional(),
    start_date: FECHA_C2.nullable().optional(),
    end_date: FECHA_C2.nullable().optional(),
    start_time: HORA_C2.nullable().optional(),
    end_time: HORA_C2.nullable().optional(),
    paid: z.boolean().optional(),
    will_recover_time: z.boolean().optional(),
    requires_replacement: z.boolean().optional(),
    replacement_user_id: z.string().uuid().nullable().optional(),
    swap_user_id: z.string().uuid().nullable().optional(),
    original_shift_date: FECHA_C2.nullable().optional(),
    original_shift_code: z.string().max(32).nullable().optional(),
    requested_shift_date: FECHA_C2.nullable().optional(),
    return_fractioned: z.boolean().optional(),
    requested_minutes: z.number().int().min(0).max(100000).nullable().optional(),
    fracciones: z.array(fraccionSchema).max(20).optional(),
    reason_detail: z.string().max(2000).nullable().optional(),
    observations: z.string().max(2000).nullable().optional(),
    out_of_rule_justification: z.string().max(2000).nullable().optional(),
    support_path: z.string().max(500).nullable().optional(),
    support_metadata: z.record(z.string(), z.unknown()).nullable().optional(),
    requester_signature_id: z.string().uuid().nullable().optional(),
    requester_signature_hash: z.string().max(200).nullable().optional(),
  })
  .strict();

export type CrearSolicitudResultado = { ok: boolean; id?: string; error?: string };

export const crearSolicitudTurno = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => crearSchema.parse(input))
  .handler(async ({ data, context }): Promise<CrearSolicitudResultado> => {
    const { data: isActive } = await (context.supabase.rpc as unknown as RpcFn)(
      "is_active_member",
      { _user_id: context.userId },
    );
    if (!isActive) return { ok: false, error: MENSAJES_C2.SIN_PERMISO };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: res, error } = await (supabaseAdmin.rpc as unknown as RpcFn)(
      "crear_solicitud_turno",
      { _actor: context.userId, _payload: data },
    );
    if (error) {
      console.error("crearSolicitudTurno");
      return { ok: false, error: MENSAJES_C2.ERROR_GENERAL };
    }
    const out = (res ?? {}) as { ok?: boolean; id?: string; error?: string };
    if (!out.ok) return { ok: false, error: mensajeC2(out.error) };
    return { ok: true, id: out.id };
  });

const decidirSchema = z
  .object({
    requestId: z.string().uuid(),
    decision: z.enum(["APROBAR", "NEGAR", "DEVOLVER_PARA_AJUSTE"]),
    observacion: z.string().max(1000).nullable().optional(),
    registrarAusentismo: z.boolean().nullable().optional(),
  })
  .strict();

export type DecidirSolicitudResultado = {
  ok: boolean;
  error?: string;
  code?: string;
  /** Resumen serializado (JSON) del resultado por día. */
  dias?: string;
  legacy?: boolean;
};

export const decidirSolicitudTurno = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => decidirSchema.parse(input))
  .handler(async ({ data, context }): Promise<DecidirSolicitudResultado> => {
    const rpc = context.supabase.rpc as unknown as RpcFn;
    const { data: isActive } = await rpc("is_active_member", { _user_id: context.userId });
    if (!isActive) return { ok: false, error: MENSAJES_C2.SIN_PERMISO, code: "SIN_PERMISO" };
    const { data: isAdmin } = await rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) return { ok: false, error: MENSAJES_C2.SIN_PERMISO, code: "SIN_PERMISO" };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: res, error } = await (supabaseAdmin.rpc as unknown as RpcFn)(
      "decidir_solicitud_turno",
      {
        _actor: context.userId,
        _request_id: data.requestId,
        _decision: data.decision,
        _observacion: data.observacion ?? null,
        _registrar_ausentismo: data.registrarAusentismo ?? null,
      },
    );
    if (error) {
      console.error("decidirSolicitudTurno");
      return { ok: false, error: MENSAJES_C2.ERROR_GENERAL, code: "ERROR_GENERAL" };
    }
    const out = (res ?? {}) as {
      ok?: boolean;
      error?: string;
      dias?: unknown;
      legacy?: boolean;
    };
    if (!out.ok) return { ok: false, error: mensajeC2(out.error), code: out.error };
    return {
      ok: true,
      dias: out.dias ? JSON.stringify(out.dias).slice(0, 4000) : undefined,
      legacy: !!out.legacy,
    };
  });
