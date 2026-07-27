// Resolver canónico server-side de la ACEPTACIÓN VIGENTE de una remisión
// saliente. Fuente única de verdad. La precarga de entrega documental y las
// validaciones futuras de snapshot deben consumir este resolver.
//
// Fase 5B — Bloque 2A.
//
// Reglas:
// - Autoriza vía requireSupabaseAuth y verifica is_active_member;
// - Consulta seguimientos con el cliente SCOPED por RLS del usuario
//   (context.supabase), por lo que rows fuera de alcance quedan invisibles;
// - Recorre en orden cronológico ASC aplicando allowlists ESTRICTAS de códigos:
//     * ACEPTACIÓN DE IPS RECEPTORA → establece aceptación activa;
//     * NOVEDADES con detalles.novedad_ips ∈ {CANCELA, DESIST_IPS} → invalida;
// - Aceptación posterior sustituye a la anterior (dominio permite solo una
//   aceptación activa; el histórico se conserva);
// - Devuelve estado `vigente` | `sin_aceptacion`.

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  ACEPTACION_TIPO,
  NOVEDADES_TIPO,
  NOVEDADES_IPS_CANCELA_ACEPTACION,
  type ResolverAceptacionResultado,
  type AceptacionVigente,
} from "./salientes-aceptacion";

type SeguimientoRow = {
  id: string;
  tipo_seguimiento: string | null;
  detalles: Record<string, unknown> | null;
  created_at: string;
  created_by: string | null;
  nombre_usuario: string | null;
};

function validarUuid(v: unknown): string {
  if (typeof v !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)) {
    throw new Error("casoId inválido");
  }
  return v;
}

function str(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t : null;
}

export const resolverAceptacionVigente = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { casoId: string }) => ({
    casoId: validarUuid(input?.casoId),
  }))
  .handler(async ({ data, context }): Promise<ResolverAceptacionResultado> => {
    // Verificación explícita de membresía activa. RLS ya restringe alcance,
    // pero cerramos fail-closed también acá.
    const { data: activo, error: memErr } = await context.supabase.rpc(
      "is_active_member",
      { _user_id: context.userId },
    );
    if (memErr || !activo) {
      throw new Error("No autorizado");
    }

    // Cliente SCOPED por RLS: si el usuario no tiene alcance sobre este caso,
    // la consulta devolverá 0 filas y responderemos `sin_aceptacion`.
    const { data: rows, error } = await context.supabase
      .from("seguimientos")
      .select("id, tipo_seguimiento, detalles, created_at, created_by, nombre_usuario")
      .eq("caso_id", data.casoId)
      .eq("tipo_caso", "remision")
      .order("created_at", { ascending: true })
      .order("id", { ascending: true });
    if (error) throw new Error(error.message);

    let activa: AceptacionVigente | null = null;
    for (const r of (rows ?? []) as SeguimientoRow[]) {
      const tipo = (r.tipo_seguimiento ?? "").toString();
      // Coincidencia EXACTA (sin includes / startsWith).
      if (tipo === ACEPTACION_TIPO) {
        const det = (r.detalles ?? {}) as Record<string, unknown>;
        activa = {
          aceptacion_id: r.id,
          ips_receptora: str(det.ips_receptora),
          ips_receptora_sede: str(det.sede),
          nombre_acepta: str(det.nombre_acepta),
          cargo_acepta: str(det.cargo_acepta),
          fecha: r.created_at,
          usuario_creador: r.created_by,
          nombre_usuario_creador: r.nombre_usuario,
        };
        continue;
      }
      if (tipo === NOVEDADES_TIPO) {
        const det = (r.detalles ?? {}) as Record<string, unknown>;
        const cod = typeof det.novedad_ips === "string" ? det.novedad_ips : "";
        if (cod && NOVEDADES_IPS_CANCELA_ACEPTACION.has(cod)) {
          activa = null;
        }
      }
    }

    if (!activa) return { estado: "sin_aceptacion" };
    return { estado: "vigente", aceptacion: activa };
  });
