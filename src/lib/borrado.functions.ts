import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ---------------------------------------------------------------------------
// Zona de borrado seguro.
// Vacía SOLO datos transaccionales seleccionados para migrar limpio.
// NUNCA toca catálogos, plantillas, usuarios, roles, reglas, red e indicadores.
// Solo coordinación (ADMIN) puede ejecutarlo.
// ---------------------------------------------------------------------------

// Lista blanca: únicas tablas que se permiten vaciar. SOLO datos
// transaccionales. NUNCA aparecen aquí: usuarios, perfiles, roles, catálogos,
// plantillas, reglas, red/IPS/ambulancias maestras, indicadores base,
// firmas maestras del personal (user_signatures), canales de notificación,
// tipos de turno, audit_logs ni configuración crítica.
export const GRUPOS_BORRADO = {
  // Remisiones entrantes / salientes / domiciliarios / referencias
  casos_entrantes: { tabla: "casos_entrantes", label: "Casos entrantes" },
  remisiones: { tabla: "remisiones", label: "Remisiones salientes" },
  domiciliarios: { tabla: "domiciliarios", label: "PHD / PAD / Oxígeno y especiales" },
  referencia_interna: { tabla: "referencia_interna", label: "Referencias internas" },
  pendientes: { tabla: "pendientes", label: "Pendientes" },
  // Trazabilidad transversal
  seguimientos: { tabla: "seguimientos", label: "Seguimientos / bitácora" },
  historicos_casos: { tabla: "historicos_casos", label: "Históricos (entrantes y salientes)" },
  // Cuadro de turno
  shift_schedules: { tabla: "shift_schedules", label: "Programación mensual de turnos" },
  shift_schedule_days: { tabla: "shift_schedule_days", label: "Turnos asignados por día" },
  shift_schedule_members: { tabla: "shift_schedule_members", label: "Integrantes del cuadro" },
  turnos: { tabla: "turnos", label: "Turnos (registro operativo)" },
  shift_requests: { tabla: "shift_requests", label: "Solicitudes de permisos / cambios de turno" },
  shift_request_audit: { tabla: "shift_request_audit", label: "Historial de cambios de solicitudes" },
  shift_request_recovery_logs: { tabla: "shift_request_recovery_logs", label: "Devoluciones de tiempo" },
  shift_absenteeism_records: { tabla: "shift_absenteeism_records", label: "Control de ausentismo" },
  entregas_turno: { tabla: "entregas_turno", label: "Entregas de turno" },
  historial_turnos: { tabla: "historial_turnos", label: "Historial de turnos" },
  // Entrega documental / QR
  entrega_firmas: { tabla: "entrega_firmas", label: "Firmas y evidencias de entrega documental (QR)" },
  // Alertas y avisos
  coordinacion: { tabla: "coordinacion", label: "Alertas de coordinación" },
  avisos: { tabla: "avisos", label: "Avisos operativos" },
  notification_logs: { tabla: "notification_logs", label: "Historial de notificaciones externas" },
  // Indicadores (solo mediciones transaccionales)
  mediciones_indicadores: { tabla: "mediciones_indicadores", label: "Mediciones de indicadores" },
  // Control de mando / históricos operativos
  control_mando: { tabla: "control_mando", label: "Registros de control de mando" },
} satisfies Record<string, { tabla: string; label: string }>;

export type GrupoBorradoKey = keyof typeof GRUPOS_BORRADO;

// Agrupación por módulo / ventana para la UI (tipo acordeón). Cada módulo
// referencia subgrupos que son claves de GRUPOS_BORRADO. Es SOLO presentación:
// el backend valida siempre contra GRUPOS_BORRADO.
export const MODULOS_BORRADO: {
  id: string;
  label: string;
  descripcion: string;
  subgrupos: GrupoBorradoKey[];
}[] = [
  {
    id: "entrantes",
    label: "Remisiones entrantes",
    descripcion: "Casos y trazabilidad de referencias entrantes.",
    subgrupos: ["casos_entrantes"],
  },
  {
    id: "salientes",
    label: "Remisiones salientes",
    descripcion: "Remisiones salientes y su coordinación.",
    subgrupos: ["remisiones"],
  },
  {
    id: "domiciliarios",
    label: "PHD / PAD / O₂ / Especiales",
    descripcion: "Casos domiciliarios y especiales.",
    subgrupos: ["domiciliarios"],
  },
  {
    id: "referencias",
    label: "Referencias internas",
    descripcion: "Referencias entre servicios internos.",
    subgrupos: ["referencia_interna"],
  },
  {
    id: "pendientes",
    label: "Pendientes",
    descripcion: "Pendientes transversales del sistema.",
    subgrupos: ["pendientes"],
  },
  {
    id: "trazabilidad",
    label: "Seguimientos e históricos",
    descripcion: "Seguimientos, bitácoras e históricos de casos.",
    subgrupos: ["seguimientos", "historicos_casos"],
  },
  {
    id: "cuadro_turno",
    label: "Cuadro de turno",
    descripcion: "Calendario, solicitudes, ausentismo y entregas de turno.",
    subgrupos: [
      "shift_schedules",
      "shift_schedule_days",
      "shift_schedule_members",
      "turnos",
      "shift_requests",
      "shift_request_audit",
      "shift_request_recovery_logs",
      "shift_absenteeism_records",
      "entregas_turno",
      "historial_turnos",
    ],
  },
  {
    id: "entrega_qr",
    label: "Entrega documental / QR",
    descripcion: "Firmas y evidencias de recepción documental por QR.",
    subgrupos: ["entrega_firmas"],
  },
  {
    id: "alertas",
    label: "Alertas y avisos",
    descripcion: "Alertas de coordinación, avisos e historial de notificaciones.",
    subgrupos: ["coordinacion", "avisos", "notification_logs"],
  },
  {
    id: "indicadores",
    label: "Indicadores",
    descripcion: "Mediciones transaccionales de indicadores.",
    subgrupos: ["mediciones_indicadores"],
  },
  {
    id: "control_mando",
    label: "Control de mando / históricos operativos",
    descripcion: "Registros operativos del control de mando.",
    subgrupos: ["control_mando"],
  },
];

// Frase exacta obligatoria para autorizar el borrado. Larga a propósito para
// evitar borrados accidentales.
export const FRASE_CONFIRMACION_BORRADO = "BORRAR DATOS TRANSACCIONALES SELECCIONADOS";

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
