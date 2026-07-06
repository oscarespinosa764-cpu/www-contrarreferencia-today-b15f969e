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

// Frase exacta obligatoria para autorizar el borrado. Larga a propósito para
// evitar borrados accidentales.
export const FRASE_CONFIRMACION_BORRADO = "BORRAR DATOS TRANSACCIONALES DE PRODUCCION";

const inputSchema = z.object({
  grupos: z
    .array(z.enum(Object.keys(GRUPOS_BORRADO) as [GrupoBorradoKey, ...GrupoBorradoKey[]]))
    .min(1, "Selecciona al menos un grupo de datos a vaciar.")
    .max(Object.keys(GRUPOS_BORRADO).length),
  confirmacion: z.string(),
  // El administrador debe confirmar explícitamente que ya descargó un respaldo.
  confirmacionBackup: z.boolean(),
});

const contarSchema = z.object({
  grupos: z
    .array(z.enum(Object.keys(GRUPOS_BORRADO) as [GrupoBorradoKey, ...GrupoBorradoKey[]]))
    .min(1)
    .max(Object.keys(GRUPOS_BORRADO).length),
});

// Devuelve el conteo de registros por grupo ANTES de borrar, para que el
// administrador vea exactamente cuántos datos se eliminarán.
export const contarDatos = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => contarSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: esAdmin, error: adminErr } = await (supabase as any).rpc("has_role", {
      _user_id: userId,
      _role: "admin",
    });
    if (adminErr || !esAdmin) {
      return { ok: false, conteos: [] as { key: string; label: string; total: number }[], error: "Acción reservada a coordinación." as string | null };
    }

    const conteos: { key: string; label: string; total: number }[] = [];
    for (const key of data.grupos) {
      const def = GRUPOS_BORRADO[key];
      const { count, error } = await (supabase as any)
        .from(def.tabla)
        .select("id", { count: "exact", head: true });
      conteos.push({ key, label: def.label, total: error ? -1 : count ?? 0 });
    }

    return { ok: true, conteos, error: null as string | null };
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

    if (data.confirmacion.trim().toUpperCase() !== FRASE_CONFIRMACION_BORRADO) {
      return { ok: false, resultados: [], error: `Escribe exactamente "${FRASE_CONFIRMACION_BORRADO}" para confirmar.` as string | null };
    }

    if (!data.confirmacionBackup) {
      return { ok: false, resultados: [], error: "Debes confirmar que ya descargaste un respaldo antes de borrar." as string | null };
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
        console.error("limpiarDatos error:", def.tabla);
        const { registrarAuditoriaServer } = await import("./auditoria.server");
        await registrarAuditoriaServer(userId, {
          accion: "borrado_masivo",
          modulo: "borrado",
          tabla: def.tabla,
          resultado: "fallido",
        });
        return { ok: false, resultados, error: `Error al vaciar ${def.label}.` as string | null };
      }
      resultados.push({ grupo: def.label, eliminadas: count ?? 0 });
      const { registrarAuditoriaServer } = await import("./auditoria.server");
      await registrarAuditoriaServer(userId, {
        accion: "borrado_masivo",
        modulo: "borrado",
        tabla: def.tabla,
        resultado: "exito",
        detalles: { eliminadas: count ?? 0 },
      });
    }

    return { ok: true, resultados, error: null as string | null };
  });
