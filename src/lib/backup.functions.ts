import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ---------------------------------------------------------------------------
// Respaldo total: descarga TODAS las tablas operativas del sistema en un solo
// archivo. Acción reservada a coordinación (ADMIN) y registrada en auditoría.
// Usa el cliente autenticado (RLS como el administrador), por lo que solo
// incluye datos que el administrador tiene permitido leer.
// ---------------------------------------------------------------------------

// Tablas incluidas en el respaldo. No se incluye `audit_logs` por volumen y
// porque ya es el registro inmutable de actividad.
const TABLAS = [
  "remisiones",
  "domiciliarios",
  "referencia_interna",
  "casos_entrantes",
  "seguimientos",
  "pendientes",
  "historicos_casos",
  "red_operativa",
  "reglas_operativas",
  "plantillas",
  "catalogos",
  "indicadores",
  "mediciones_indicadores",
  "control_mando",
  "coordinacion",
  "avisos",
  "turnos",
  "historial_turnos",
  "entregas_turno",
  "consentimientos",
  "profiles",
  "user_roles",
] as const;

type TablaRespaldo = {
  nombre: string;
  columnas: string[];
  filas: Record<string, string>[];
};

export const respaldoTotal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    // Solo coordinación (ADMIN) puede generar el respaldo completo.
    const { data: esAdmin, error: adminErr } = await (supabase as any).rpc("has_role", {
      _user_id: userId,
      _role: "admin",
    });
    if (adminErr || !esAdmin) {
      return {
        ok: false,
        tablas: [] as TablaRespaldo[],
        error: "Acción reservada a coordinación." as string | null,
      };
    }

    const tablas: TablaRespaldo[] = [];

    for (const nombre of TABLAS) {
      const { data: rows, error } = await (supabase as any)
        .from(nombre)
        .select("*")
        .limit(20000);

      if (error) {
        console.error("respaldoTotal: error leyendo tabla");
        continue;
      }

      const registros = (rows ?? []) as Record<string, unknown>[];
      // Determina el conjunto de columnas a partir de las filas presentes.
      const colSet = new Set<string>();
      for (const r of registros) {
        for (const k of Object.keys(r)) colSet.add(k);
      }
      const columnas = [...colSet];

      const filas: Record<string, string>[] = registros.map((r) => {
        const out: Record<string, string> = {};
        for (const col of columnas) {
          const v = r[col];
          out[col] =
            v == null
              ? ""
              : typeof v === "object"
                ? JSON.stringify(v)
                : String(v);
        }
        return out;
      });

      tablas.push({ nombre, columnas, filas });
    }

    const totalFilas = tablas.reduce((acc, t) => acc + t.filas.length, 0);

    const { registrarAuditoriaServer } = await import("./auditoria.server");
    await registrarAuditoriaServer(userId, {
      accion: "respaldo_total",
      modulo: "control_mando",
      detalles: { tablas: tablas.length, filas: totalFilas },
    });

    return { ok: true, tablas, error: null as string | null };
  });
