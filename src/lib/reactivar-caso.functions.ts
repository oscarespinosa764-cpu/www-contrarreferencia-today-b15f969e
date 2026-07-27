// -----------------------------------------------------------------------------
// FASE 2 · Reactivación administrativa de casos cancelados.
// Solo administradores activos pueden invocarla. El userId se toma de la
// sesión validada por requireSupabaseAuth — nunca del cliente. La ejecución
// real es atómica dentro de public.reactivar_caso_cancelado_admin, invocada
// con service_role (única identidad autorizada a ejecutarla).
// -----------------------------------------------------------------------------
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import {
  TIPOS_CASO_REACTIVABLES,
  type TipoCasoReactivable,
} from "@/lib/reactivar-caso";

export { TIPOS_CASO_REACTIVABLES, ESTADOS_CANCEL_POR_TIPO } from "@/lib/reactivar-caso";
export type { TipoCasoReactivable } from "@/lib/reactivar-caso";

const schema = z.object({
  tipoCaso: z.enum(TIPOS_CASO_REACTIVABLES),
  casoId: z.string().uuid(),
  motivoReactivacion: z.string().trim().min(10).max(500),
  updatedAtEsperado: z.string().min(1),
});


type ResultadoRPC = {
  ok: boolean;
  code?: string;
  estado_restaurado?: string;
  estado_cancelado?: string;
  reactivacion_seguimiento_id?: string;
};

const MENSAJES: Record<string, string> = {
  MOTIVO_INVALIDO: "El motivo de reactivación debe tener entre 10 y 500 caracteres.",
  REQUESTER_INVALIDO: "Sesión no válida.",
  USUARIO_NO_ACTIVO: "Su usuario no está activo.",
  NO_ES_ADMIN: "Acción reservada al administrador.",
  TIPO_CASO_INVALIDO: "Tipo de caso no soportado.",
  FLUJO_NO_APLICA:
    "Referencias Internas no tiene reactivación disponible actualmente.",
  CASO_NO_ENCONTRADO: "No se encontró el caso a reactivar.",
  CASE_CONCURRENTLY_UPDATED:
    "El caso fue actualizado por otro usuario. Recarga la información antes de intentar reactivarlo.",
  CASO_NO_ESTA_CANCELADO: "El caso no está en un estado cancelatorio reconocido.",
  NO_ESTADO_PREVIO_CONFIABLE:
    "No fue posible identificar de forma segura el estado anterior del caso. La reactivación automática fue bloqueada para proteger la trazabilidad.",
  CANCELACION_VIGENTE_NO_IDENTIFICABLE:
    "No fue posible identificar de forma segura el evento de cancelación vigente.",
};

export const reactivarCasoCanceladoAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => schema.parse(input))
  .handler(async ({ data, context }) => {
    const { userId, supabase } = context;

    // 1) Verificación rápida de rol admin en la capa del usuario (defensa
    //    en profundidad — la función privada la vuelve a comprobar).
    const { data: esAdmin } = await supabase.rpc("has_role", {
      _user_id: userId,
      _role: "admin",
    });
    if (!esAdmin) {
      return { ok: false, error: MENSAJES.NO_ES_ADMIN, code: "NO_ES_ADMIN" };
    }

    // 2) Delegar en la función privada usando service_role (único con EXECUTE).
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rpcData, error } = await (supabaseAdmin.rpc as unknown as (
      name: string,
      args: Record<string, unknown>,
    ) => Promise<{ data: ResultadoRPC | null; error: { message: string } | null }>)(
      "reactivar_caso_cancelado_admin",
      {
        _requester: userId,
        _tipo_caso: data.tipoCaso,
        _caso_id: data.casoId,
        _motivo_reactivacion: data.motivoReactivacion,
        _updated_at_esperado: data.updatedAtEsperado,
      },
    );

    if (error) {
      return {
        ok: false,
        error: "No se pudo completar la reactivación.",
        code: "ERROR_INTERNO",
      };
    }

    const res = rpcData ?? { ok: false, code: "ERROR_INTERNO" };
    if (!res.ok) {
      return {
        ok: false,
        error: MENSAJES[res.code ?? ""] ?? "No fue posible reactivar el caso.",
        code: res.code ?? "ERROR_INTERNO",
      };
    }

    return {
      ok: true,
      error: null as string | null,
      estadoRestaurado: res.estado_restaurado ?? null,
      estadoCancelado: res.estado_cancelado ?? null,
    };
  });
