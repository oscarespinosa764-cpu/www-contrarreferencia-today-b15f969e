// Atención Domiciliaria · cambios de estado históricos (solo lectura).
// Fuente: los eventos PHD_EVENTO_* que registra la propia RPC canónica
// registrar_evento_phd (la lógica que resuelve estado_ciclo) con
// estado_anterior/estado_nuevo. Allowlist cerrada por prefijo de acción; solo
// se devuelven transiciones (anterior ≠ nuevo). No se escribe nada.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export interface CambioPhd {
  caso_id: string;
  estado_anterior: string | null;
  estado_nuevo: string | null;
  actor_nombre: string;
  created_at: string;
}

export const listarCambiosPhd = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({ ids: z.array(z.string().uuid()).max(500) })
      .strict()
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<CambioPhd[]> => {
    const { data: activo } = await context.supabase.rpc("is_active_member", {
      _user_id: context.userId,
    });
    if (!activo) throw new Response("Forbidden", { status: 403 });
    if (!data.ids.length) return [];
    // Solo casos de Atención Domiciliaria que el usuario puede ver (RLS).
    const { data: visibles, error: e1 } = await context.supabase
      .from("domiciliarios")
      .select("id")
      .in("id", data.ids);
    if (e1) throw e1;
    const ids = (visibles ?? []).map((r) => r.id as string);
    if (!ids.length) return [];
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const out: CambioPhd[] = [];
    const LOTE = 100;
    for (let i = 0; i < ids.length; i += LOTE) {
      const { data: rows, error } = await supabaseAdmin
        .from("audit_logs")
        .select("user_id, detalles, created_at")
        .like("accion", "PHD_EVENTO_%")
        .in("detalles->>caso_id", ids.slice(i, i + LOTE))
        .order("created_at", { ascending: true })
        .limit(2000);
      if (error) throw error;
      const uids = Array.from(
        new Set((rows ?? []).map((r) => r.user_id as string | null).filter(Boolean)),
      ) as string[];
      const nombres = new Map<string, string>();
      if (uids.length) {
        const { data: ps } = await supabaseAdmin
          .from("profiles")
          .select("user_id, nombre")
          .in("user_id", uids);
        for (const p of ps ?? []) nombres.set(p.user_id as string, (p.nombre as string) || "");
      }
      for (const r of rows ?? []) {
        const d = (r.detalles ?? {}) as Record<string, unknown>;
        const ant = typeof d.estado_anterior === "string" ? d.estado_anterior : null;
        const nue = typeof d.estado_nuevo === "string" ? d.estado_nuevo : null;
        if (!nue || ant === nue) continue;
        out.push({
          caso_id: String(d.caso_id),
          estado_anterior: ant,
          estado_nuevo: nue,
          actor_nombre: (r.user_id && nombres.get(r.user_id as string)) || "SISTEMA",
          created_at: r.created_at as string,
        });
      }
    }
    return out;
  });
