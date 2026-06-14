import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ---------------------------------------------------------------------------
// Zona de borrado seguro.
// Vacía SOLO datos transaccionales seleccionados para migrar limpio.
// NUNCA toca catálogos, plantillas, usuarios, roles, reglas, red e indicadores.
// Solo coordinación (ADMIN) puede ejecutarlo.
// ---------------------------------------------------------------------------

// Lista blanca: únicas tablas que se permiten vaciar.
export const GRUPOS_BORRADO = {
  remisiones: { tabla: "remisiones", label: "Remisiones salientes" },
  domiciliarios: { tabla: "domiciliarios", label: "PHD / PAD / Oxígeno y especiales" },
  referencia_interna: { tabla: "referencia_interna", label: "Referencias internas" },
  pendientes: { tabla: "pendientes", label: "Pendientes" },
  casos_entrantes: { tabla: "casos_entrantes", label: "Casos entrantes" },
  seguimientos: { tabla: "seguimientos", label: "Seguimientos / bitácora" },
  historicos_casos: { tabla: "historicos_casos", label: "Históricos (entrantes y salientes)" },
  coordinacion: { tabla: "coordinacion", label: "Alertas de coordinación" },
  avisos: { tabla: "avisos", label: "Avisos" },
  entregas_turno: { tabla: "entregas_turno", label: "Entregas de turno" },
  historial_turnos: { tabla: "historial_turnos", label: "Historial de turnos" },
  turnos: { tabla: "turnos", label: "Turnos" },
  control_mando: { tabla: "control_mando", label: "Registros de control de mando" },
  mediciones_indicadores: { tabla: "mediciones_indicadores", label: "Mediciones de indicadores" },
} satisfies Record<string, { tabla: string; label: string }>;

export type GrupoBorradoKey = keyof typeof GRUPOS_BORRADO;

const inputSchema = z.object({
  grupos: z
    .array(z.enum(Object.keys(GRUPOS_BORRADO) as [GrupoBorradoKey, ...GrupoBorradoKey[]]))
    .min(1, "Selecciona al menos un grupo de datos a vaciar.")
    .max(Object.keys(GRUPOS_BORRADO).length),
  confirmacion: z.string(),
});

export const limpiarDatos = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => inputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Solo coordinación (ADMIN).
    const { data: esAdmin, error: adminErr } = await (supabase as any).rpc("has_role", {
      _user_id: userId,
      _role: "admin",
    });
    if (adminErr || !esAdmin) {
      return { ok: false, resultados: [] as { grupo: string; eliminadas: number }[], error: "Acción reservada a coordinación." as string | null };
    }

    if (data.confirmacion.trim().toUpperCase() !== "BORRAR") {
      return { ok: false, resultados: [], error: 'Escribe "BORRAR" para confirmar.' as string | null };
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const resultados: { grupo: string; eliminadas: number }[] = [];

    for (const key of data.grupos) {
      const def = GRUPOS_BORRADO[key];
      const { count, error } = await (supabaseAdmin as any)
        .from(def.tabla)
        .delete({ count: "exact" })
        .neq("id", "00000000-0000-0000-0000-000000000000");
      if (error) {
        console.error("limpiarDatos error:", def.tabla, error);
        return { ok: false, resultados, error: `Error al vaciar ${def.label}: ${error.message}` as string | null };
      }
      resultados.push({ grupo: def.label, eliminadas: count ?? 0 });
    }

    return { ok: true, resultados, error: null as string | null };
  });
