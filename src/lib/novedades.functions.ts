// FASE 5K · BLOQUE C — Novedades canónicas.
// Cada operación (cambio de unidad, cambio de motivo de remisión y gestión de
// modalidad domiciliaria) se ejecuta en UNA transacción server-side: la RPC
// inserta el seguimiento NOVEDADES, actualiza el caso y audita. Las RPC tienen
// EXECUTE revocado a anon/authenticated: solo service_role las invoca tras
// verificar sesión y membresía activa en este handler.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export type NovedadResultado = {
  ok: boolean;
  error?: string;
  seguimiento_id?: string;
  nueva_unidad?: string;
  nueva_cama?: string;
  motivo_nuevo?: string;
  modalidades_activas?: string[];
  especialidades_antes?: string[];
  especialidades_agregadas?: string[];
  especialidades_cerradas?: string[];
  especialidades_reactivadas?: string[];
  especialidades_despues?: string[];
  estado_ciclo?: string;

};

const canalesSchema = z
  .array(z.record(z.string(), z.unknown()))
  .max(6)
  .nullable()
  .optional();

const unidadSchema = z.object({
  tipoCaso: z.enum(["remision", "domiciliario"]),
  casoId: z.string().uuid(),
  nuevoServicio: z.string().trim().min(1).max(120),
  nuevaCama: z.string().trim().min(1).max(30),
  observaciones: z.string().trim().max(1000).nullable().optional(),
  plantilla: z.string().trim().max(20000).nullable().optional(),
  canales: canalesSchema,
});

const motivoSchema = z.object({
  casoId: z.string().uuid(),
  nuevoMotivo: z.string().trim().min(3).max(120),
  justificacion: z.string().trim().min(3).max(1000),
  observaciones: z.string().trim().max(1000).nullable().optional(),
  plantilla: z.string().trim().max(20000).nullable().optional(),
  canales: canalesSchema,
});

const modalidadSchema = z.object({
  casoId: z.string().uuid(),
  gestion: z.enum(["AGREGAR_MODALIDAD", "CAMBIAR_MODALIDAD"]),
  modalidadOrigen: z.string().trim().max(40).nullable().optional(),
  modalidadNueva: z.string().trim().min(2).max(40),
  justificacion: z.string().trim().min(3).max(1000),
  observaciones: z.string().trim().max(1000).nullable().optional(),
  plantilla: z.string().trim().max(20000).nullable().optional(),
  canales: canalesSchema,
});

// D-1 · CAMBIO DE ESPECIALIDAD: el cliente solo envía intención (qué agregar y
// qué cerrar). El servidor lee las especialidades reales, valida contra el
// catálogo y calcula antes/después. Nunca acepta snapshots del navegador.
const especialidadSchema = z.object({
  casoId: z.string().uuid(),
  agregar: z.array(z.string().trim().min(2).max(120)).max(20).default([]),
  cerrar: z.array(z.string().trim().min(2).max(120)).max(20).default([]),
  observaciones: z.string().trim().max(1000).nullable().optional(),
  plantilla: z.string().trim().max(20000).nullable().optional(),
  canales: canalesSchema,
});


type RpcFn = (
  name: string,
  args: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message: string } | null }>;

async function ejecutarRpc(
  supabase: { rpc: unknown },
  userId: string,
  nombre: string,
  args: Record<string, unknown>,
): Promise<NovedadResultado> {
  const { data: isActive } = await (supabase.rpc as RpcFn)("is_active_member", {
    _user_id: userId,
  });
  if (!isActive) return { ok: false, error: "Usuario no autorizado" };
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await (supabaseAdmin.rpc as unknown as RpcFn)(nombre, args);
  if (error) return { ok: false, error: error.message };
  return (data ?? { ok: false, error: "Sin respuesta del servidor" }) as NovedadResultado;
}

export const novedadCambioUnidad = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => unidadSchema.parse(input))
  .handler(async ({ data, context }) =>
    ejecutarRpc(context.supabase, context.userId, "novedad_cambio_unidad", {
      _actor: context.userId,
      _tipo_caso: data.tipoCaso,
      _caso_id: data.casoId,
      _nuevo_servicio: data.nuevoServicio,
      _nueva_cama: data.nuevaCama,
      _observaciones: data.observaciones ?? null,
      _plantilla: data.plantilla ?? null,
      _canales: data.canales ?? null,
    }),
  );

export const novedadCambioMotivoRemision = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => motivoSchema.parse(input))
  .handler(async ({ data, context }) =>
    ejecutarRpc(context.supabase, context.userId, "novedad_cambio_motivo_remision", {
      _actor: context.userId,
      _caso_id: data.casoId,
      _nuevo_motivo: data.nuevoMotivo,
      _justificacion: data.justificacion,
      _observaciones: data.observaciones ?? null,
      _plantilla: data.plantilla ?? null,
      _canales: data.canales ?? null,
    }),
  );

export const novedadGestionModalidad = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => modalidadSchema.parse(input))
  .handler(async ({ data, context }) =>
    ejecutarRpc(context.supabase, context.userId, "novedad_gestion_modalidad", {
      _actor: context.userId,
      _caso_id: data.casoId,
      _gestion: data.gestion,
      _origen: data.modalidadOrigen ?? null,
      _nueva: data.modalidadNueva,
      _justificacion: data.justificacion,
      _observaciones: data.observaciones ?? null,
      _plantilla: data.plantilla ?? null,
      _canales: data.canales ?? null,
    }),
  );

export const novedadCambioEspecialidad = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => especialidadSchema.parse(input))
  .handler(async ({ data, context }) =>
    ejecutarRpc(context.supabase, context.userId, "novedad_cambio_especialidad", {
      _actor: context.userId,
      _caso_id: data.casoId,
      _agregar: data.agregar,
      _cerrar: data.cerrar,
      _observaciones: data.observaciones ?? null,
      _plantilla: data.plantilla ?? null,
      _canales: data.canales ?? null,
    }),
  );
