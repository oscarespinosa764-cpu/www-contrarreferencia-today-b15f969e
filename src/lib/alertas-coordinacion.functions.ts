// ---------------------------------------------------------------------------
// Motor server-side de ALERTAS DE COORDINACIÓN (Etapa 2).
// - crearAlertaCoordinacion: genera una alerta persistente de forma idempotente
//   (la dispara un miembro activo por un evento del caso; no requiere ser admin).
// - gestionarAlertaCoordinacion: transición de ciclo de vida (solo admin).
// Reutiliza el catálogo de reglas y la tabla `alertas_coordinacion`.
// ---------------------------------------------------------------------------
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { reglaPorCodigo } from "@/lib/alertas-coordinacion";

const crearSchema = z.object({
  codigo: z.string().min(1),
  mensaje: z.string().optional(),
  prioridad: z.string().optional(),
  modulo: z.string().optional(),
  casoCodigo: z.string().optional(),
  casoDocumento: z.string().optional(),
  /** Clave de idempotencia; por defecto codigo:casoCodigo. */
  idempotencyKey: z.string().optional(),
  eventoAt: z.string().optional(),
  detalles: z.record(z.string(), z.unknown()).optional(),
});

export const crearAlertaCoordinacion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => crearSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Solo miembros activos pueden disparar alertas de coordinación.
    const { data: activo } = await supabase.rpc("is_active_member", { _user_id: userId });
    if (!activo) throw new Error("Forbidden");

    const regla = reglaPorCodigo(data.codigo);
    const idempotencyKey =
      data.idempotencyKey ?? `${data.codigo}:${data.casoCodigo ?? "global"}`;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Idempotente: si ya existe la alerta con esa clave, no se duplica.
    const { data: existente } = await supabaseAdmin
      .from("alertas_coordinacion")
      .select("id")
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();
    if (existente) return { ok: true, id: existente.id, created: false };

    const { data: ins, error } = await supabaseAdmin
      .from("alertas_coordinacion")
      .insert({
        codigo: data.codigo,
        nombre: regla?.nombre ?? null,
        descripcion: regla?.descripcion ?? null,
        modulo: data.modulo ?? regla?.modulo ?? null,
        subventana: regla?.subventana ?? "ENTRANTES",
        prioridad: data.prioridad ?? regla?.prioridad ?? "MEDIO",
        mensaje: data.mensaje ?? null,
        caso_codigo: data.casoCodigo ?? null,
        caso_documento: data.casoDocumento ?? null,
        estado: "ABIERTA",
        idempotency_key: idempotencyKey,
        evento_at: data.eventoAt ?? new Date().toISOString(),
        detalles: (data.detalles ?? null) as never,
        created_by: userId,
      })
      .select("id")
      .single();

    // Carrera: otro proceso creó la misma alerta a la vez → idempotente.
    if (error) {
      if ((error as { code?: string }).code === "23505") {
        return { ok: true, created: false };
      }
      throw error;
    }

    // Despacho a canales externos según la regla de coordinación (si aplica).
    // No bloquea la creación de la alerta: si falla, la alerta ya quedó registrada.
    try {
      const { data: reglaDb } = await supabaseAdmin
        .from("reglas_coordinacion")
        .select("notificar_externo, canales, requiere_crue, nombre, modulo, subventana, prioridad")
        .eq("codigo", data.codigo)
        .eq("archivado", false)
        .maybeSingle();

      if (reglaDb?.notificar_externo && (reglaDb.canales?.length ?? 0) > 0) {
        const { despacharAlertaCoordinacion } = await import("./notifications.server");
        await despacharAlertaCoordinacion(supabaseAdmin, {
          canales: reglaDb.canales as string[],
          requiereCrue: !!reglaDb.requiere_crue,
          referenceId: idempotencyKey,
          module: data.modulo ?? reglaDb.modulo ?? regla?.modulo ?? null,
          prioridad: data.prioridad ?? reglaDb.prioridad ?? regla?.prioridad ?? null,
          subventana: reglaDb.subventana ?? regla?.subventana ?? null,
          userId,
          vars: {
            tipo_alerta: reglaDb.nombre ?? regla?.nombre ?? data.codigo,
            modulo: data.modulo ?? reglaDb.modulo ?? regla?.modulo ?? "",
            codigo: data.casoCodigo ?? "",
            estado: "ABIERTA",
            accion: data.mensaje ?? regla?.condicion ?? "",
            fecha_hora: new Date().toLocaleString("es-CO"),
          },
        });
      }
    } catch {
      // Silencioso: la notificación externa es best-effort.
    }

    return { ok: true, id: ins.id, created: true };
  });


const gestionarSchema = z.object({
  id: z.string().uuid(),
  estado: z.enum([
    "ABIERTA",
    "EN REVISIÓN",
    "GESTIONADA",
    "CERRADA SIN IRREGULARIDAD",
    "CERRADA CON HALLAZGO",
    "DESCARTADA CON JUSTIFICACIÓN",
  ]),
  hallazgo: z.string().optional(),
  justificacion: z.string().optional(),
});

export const gestionarAlertaCoordinacion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => gestionarSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: isAdmin } = await supabase.rpc("has_role", {
      _user_id: userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Forbidden");

    const { data: perfil } = await supabase
      .from("profiles")
      .select("nombre")
      .eq("user_id", userId)
      .maybeSingle();
    const nombre = perfil?.nombre ?? null;
    const ahora = new Date().toISOString();

    const patch: Record<string, unknown> = { estado: data.estado };
    if (data.estado === "EN REVISIÓN") {
      patch.revisado_por = userId;
      patch.revisado_por_nombre = nombre;
      patch.revisado_at = ahora;
    } else if (data.estado === "GESTIONADA") {
      patch.gestionado_por = userId;
      patch.gestionado_por_nombre = nombre;
      patch.gestionado_at = ahora;
    } else if (data.estado.startsWith("CERRADA") || data.estado.startsWith("DESCARTADA")) {
      patch.cerrado_por = userId;
      patch.cerrado_por_nombre = nombre;
      patch.cerrado_at = ahora;
      if (data.hallazgo) patch.hallazgo = data.hallazgo;
      if (data.justificacion) patch.justificacion = data.justificacion;
    }

    const { error } = await supabase
      .from("alertas_coordinacion")
      .update(patch as never)
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });
