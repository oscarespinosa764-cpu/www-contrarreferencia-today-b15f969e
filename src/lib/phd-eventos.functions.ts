// ---------------------------------------------------------------------------
// FASE 5D · Bloque B — Registro transaccional de eventos del ciclo
// PHD / PAD / O2 / Especiales.
//
// Envoltura de la RPC SECURITY DEFINER `public.registrar_evento_phd`, cuyo
// EXECUTE está revocado para anon/authenticated. El actor se toma de la sesión
// validada por requireSupabaseAuth — nunca del cliente. La RPC bloquea la fila
// del caso, valida los requisitos del ciclo vigente, inserta el seguimiento,
// recalcula `estado_ciclo` (trigger server-authoritative) y audita.
// ---------------------------------------------------------------------------
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const EVENTOS = [
  "ACEPTACION_PROVEEDOR",
  "RADICACION",
  "EVOLUCION_DIARIA",
  "NOVEDADES",
  "OTRO",
  "CONFIRMACION_ENTREGA_OXIGENO",
  "AMBULANCIA_COORDINADA",
  "CONFIRMACION_LLEGADA_AMBULANCIA",
  "CIERRE_POR_EGRESO",
  "CANCELACION_TRAMITE",
] as const;

const schema = z.object({
  casoId: z.string().uuid(),
  evento: z.enum(EVENTOS),
  tipoSeguimiento: z.string().trim().max(120).optional(),
  detalle: z.string().trim().max(4000).optional(),
  descripcion: z.string().trim().max(4000).optional(),
  servicioCodigo: z
    .enum(["PHD", "PAD", "PAD_CRONICO", "UNIDADES_ESPECIALES", "OXIGENO_DOMICILIARIO"])
    .optional(),
  proveedor: z.string().trim().max(200).optional(),
  canal: z.string().trim().max(80).optional(),
  motivo: z.string().trim().max(500).optional(),
  especialidad: z.string().trim().max(200).optional(),
  responsable: z.string().trim().max(200).optional(),
  numeroRadicado: z.string().trim().max(80).optional(),
  empresaAmbulanciaLabel: z.string().trim().max(200).optional(),
  tipoAmbulanciaCodigo: z.enum(["TAB", "TAM", "TAM_N"]).optional(),
  fechaCoordinacion: z.string().trim().max(40).optional(),
  horaCoordinacion: z.string().trim().max(10).optional(),
  fechaEvento: z.string().trim().max(60).optional(),
  firmaId: z.string().uuid().optional(),
  observaciones: z.string().trim().max(4000).optional(),
});


const MENSAJES: Record<string, string> = {
  NO_AUTENTICADO: "Sesión no válida.",
  CASO_NO_ENCONTRADO: "No se encontró el caso.",
  CASO_CERRADO: "El caso ya está cerrado.",
  SERVICIO_NO_SOLICITADO: "El servicio indicado no fue solicitado en este caso.",
  ACEPTACION_DUPLICADA: "Ese servicio ya tiene aceptación vigente en el ciclo.",
  OXIGENO_NO_SOLICITADO: "El caso no incluye oxígeno domiciliario.",
  OXIGENO_SIN_ACEPTACION: "Primero registre la aceptación del proveedor de oxígeno.",
  ENTREGA_DUPLICADA: "La entrega de oxígeno ya fue confirmada.",
  AMBULANCIA_NO_SOLICITADA: "El caso no incluye ambulancia para egreso.",
  ACEPTACIONES_PENDIENTES: "Aún hay aceptaciones de proveedor pendientes.",
  OXIGENO_PENDIENTE: "Falta confirmar la entrega de oxígeno.",
  COORDINACION_DUPLICADA: "La ambulancia ya fue coordinada.",
  SIN_COORDINACION: "Debe coordinar la ambulancia antes de confirmar la llegada.",
  LLEGADA_DUPLICADA: "La llegada de la ambulancia ya fue confirmada.",
  LLEGADA_PENDIENTE: "Falta confirmar la llegada de la ambulancia.",
  FIRMA_REQUERIDA: "Se requiere la firma QR de llegada.",
  FIRMA_INVALIDA: "La firma no es válida para este caso o ciclo.",
  FIRMA_YA_USADA: "Esa firma ya fue utilizada.",
  RADICACION_NO_REQUERIDA:
    "La aseguradora de este caso no exige radicación según el catálogo de EAPB.",
  RADICACION_DUPLICADA: "El caso ya tiene un radicado registrado en este ciclo.",
  DESCRIPCION_REQUERIDA: "La descripción es obligatoria para este tipo de seguimiento.",
  CANCELACION_DUPLICADA: "El trámite ya fue cancelado.",

  EVENTO_NO_PERMITIDO: "Evento no permitido.",
};

type RpcResult = { ok: boolean; error?: string; estado_ciclo?: string; seguimiento_id?: string };

export const registrarEventoPhd = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => schema.parse(input))
  .handler(async ({ data, context }) => {
    const { data: isActive } = await context.supabase.rpc("is_active_member", {
      _user_id: context.userId,
    });
    if (!isActive) return { ok: false, error: "Usuario no autorizado" };

    const payload: Record<string, unknown> = {
      evento: data.evento,
      tipo_seguimiento: data.tipoSeguimiento ?? null,
      detalle: data.detalle ?? null,
      descripcion: data.descripcion ?? null,
      servicio_codigo: data.servicioCodigo ?? null,
      proveedor: data.proveedor ?? null,
      canal: data.canal ?? null,
      motivo: data.motivo ?? null,
      especialidad: data.especialidad ?? null,
      responsable: data.responsable ?? null,
      numero_radicado: data.numeroRadicado ?? null,
      empresa_ambulancia_label: data.empresaAmbulanciaLabel ?? null,
      tipo_ambulancia_codigo: data.tipoAmbulanciaCodigo ?? null,
      fecha_coordinacion: data.fechaCoordinacion ?? null,
      hora_coordinacion: data.horaCoordinacion ?? null,
      fecha_evento: data.fechaEvento ?? null,
      firma_id: data.firmaId ?? null,
      observaciones: data.observaciones ?? null,
    };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rpcData, error } = await (
      supabaseAdmin.rpc as unknown as (
        name: string,
        args: Record<string, unknown>,
      ) => Promise<{ data: RpcResult | null; error: { message: string } | null }>
    )("registrar_evento_phd", {
      _actor: context.userId,
      _caso_id: data.casoId,
      _payload: payload,
    });

    if (error) return { ok: false, error: error.message };
    const res = rpcData ?? { ok: false, error: "EVENTO_NO_PERMITIDO" };
    if (!res.ok) {
      return { ok: false, error: MENSAJES[res.error ?? ""] ?? res.error ?? "No fue posible registrar el evento." };
    }
    return { ok: true, estadoCiclo: res.estado_ciclo, seguimientoId: res.seguimiento_id };
  });
