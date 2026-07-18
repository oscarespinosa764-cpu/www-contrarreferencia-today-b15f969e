// ---------------------------------------------------------------------------
// F7 · Etapa 2 — Motor server-side del ciclo de vida PHD / PAD / O2 / Especiales.
// - avanzarEstadoCiclo: transiciones sobre `domiciliarios.estado_ciclo`
//   (validadas también por el trigger `public.domi_estado_gating`).
// - registrarRadicacion / listarRadicaciones: historial en
//   `public.phd_pad_o2_radicaciones`.
// Ambas quedan cubiertas por RLS + el usuario autenticado.
// ---------------------------------------------------------------------------
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

// Estados alineados con el trigger `public.domi_estado_gating`.
export const PHD_ESTADOS = [
  "PENDIENTE ACEPTACION",
  "ACEPTADO - PENDIENTE EGRESO",
  "ACEPTADO - PENDIENTE COORDINACION DE AMBULANCIA",
  "AMBULANCIA COORDINADA - PENDIENTE EGRESO",
  "CERRADO POR EGRESO",
  "CERRADO POR CANCELACION DEL PROVEEDOR",
  "CERRADO POR CANCELACION DE LA ESPECIALIDAD SOLICITANTE",
] as const;

export type PhdEstadoCiclo = (typeof PHD_ESTADOS)[number];

const avanzarSchema = z.object({
  casoId: z.string().uuid(),
  nuevoEstado: z.enum(PHD_ESTADOS),
  observaciones: z.string().optional(),
  fechaEvento: z.string().optional(),
});

export const avanzarEstadoCiclo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => avanzarSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const patch: {
      estado_ciclo: PhdEstadoCiclo;
      fecha_aceptacion?: string;
      fecha_coordinacion_ambulancia?: string;
      fecha_cierre?: string;
      fecha_egreso?: string;
      motivo_cierre?: string;
      observaciones?: string;
    } = { estado_ciclo: data.nuevoEstado };
    const now = data.fechaEvento ?? new Date().toISOString();

    if (data.nuevoEstado.startsWith("ACEPTADO")) {
      patch.fecha_aceptacion = now;
    }
    if (data.nuevoEstado === "AMBULANCIA COORDINADA - PENDIENTE EGRESO") {
      patch.fecha_coordinacion_ambulancia = now;
    }
    if (data.nuevoEstado.startsWith("CERRADO")) {
      patch.fecha_cierre = now;
      if (data.nuevoEstado === "CERRADO POR EGRESO") {
        patch.fecha_egreso = now;
      } else {
        patch.motivo_cierre = data.nuevoEstado;
      }
    }
    if (data.observaciones && data.observaciones.trim()) {
      patch.observaciones = data.observaciones.trim();
    }

    const { error } = await supabase
      .from("domiciliarios")
      .update(patch)
      .eq("id", data.casoId);
    if (error) throw new Error(error.message);
    return { ok: true, estado_ciclo: data.nuevoEstado };
  });

const radicarSchema = z.object({
  casoId: z.string().uuid(),
  eapb: z.string().min(1),
  canal: z.string().min(1),
  numeroRadicado: z.string().optional(),
  observaciones: z.string().optional(),
  fechaRadicacion: z.string().optional(),
  soporteUrl: z.string().optional(),
});

export const registrarRadicacion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => radicarSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const payload = {
      domiciliario_id: data.casoId,
      eapb: data.eapb.trim().toUpperCase(),
      canal: data.canal.trim().toUpperCase(),
      numero_radicado: data.numeroRadicado?.trim() || null,
      observaciones: data.observaciones?.trim() || null,
      fecha_radicacion: data.fechaRadicacion ?? new Date().toISOString(),
      soporte_url: data.soporteUrl?.trim() || null,
      created_by: userId,
    };
    const { data: ins, error } = await supabase
      .from("phd_pad_o2_radicaciones")
      .insert(payload)
      .select("id, fecha_radicacion, eapb, canal, numero_radicado")
      .single();
    if (error) throw new Error(error.message);

    // Refleja última radicación en el caso (compatibilidad UI).
    await supabase
      .from("domiciliarios")
      .update({
        eapb: payload.eapb,
        codigo_radicacion: payload.numero_radicado ?? undefined,
        fecha_radicado: payload.fecha_radicacion,
        radicacion_estado: "RADICADO",
      })
      .eq("id", data.casoId);

    return ins;
  });

const listarSchema = z.object({ casoId: z.string().uuid() });

export const listarRadicaciones = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => listarSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("phd_pad_o2_radicaciones")
      .select(
        "id, fecha_radicacion, eapb, canal, numero_radicado, observaciones, soporte_url, created_at",
      )
      .eq("domiciliario_id", data.casoId)
      .order("fecha_radicacion", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });
