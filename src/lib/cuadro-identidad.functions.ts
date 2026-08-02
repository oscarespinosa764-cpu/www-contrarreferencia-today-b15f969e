// ============================================================================
// FASE 9 · BLOQUE C.1 — Identidad de miembros del Cuadro de Turno y resolver
// canónico de turnos programados.
//
// Reglas:
// - Lectura del turno: se ejecuta con el cliente RLS del usuario (permisos
//   actuales del Cuadro/TH-FR-09); no amplía permisos.
// - Vinculación / desvinculación: exclusivas de admin ACTIVO, validadas
//   server-side y ejecutadas por RPC transaccional auditada.
// - El actor SIEMPRE proviene de la sesión (context.userId); nunca del payload.
// ============================================================================
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import {
  normalizarNombre,
  partesFecha,
  siguienteDia,
  type EstadoVinculo,
  type TurnoResuelto,
} from "@/lib/identidad-turnos";

type RpcFn = (
  name: string,
  args: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message: string } | null }>;

const FECHA = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const resolverSchema = z
  .object({
    fecha: FECHA,
    targetUserId: z.string().uuid().nullable().optional(),
    memberId: z.string().uuid().nullable().optional(),
    scheduleId: z.string().uuid().nullable().optional(),
    /** Solo para el fallback temporal NIVEL 3; nunca es autoridad. */
    fallbackName: z.string().max(160).nullable().optional(),
  })
  .strict();

function vacio(estado: TurnoResuelto["estado"], extra: Partial<TurnoResuelto> = {}): TurnoResuelto {
  return {
    estado,
    resolutionMethod: null,
    matchCount: 0,
    scheduleId: null,
    memberId: null,
    userId: null,
    dayId: null,
    dayNumber: null,
    shiftCode: null,
    hours: 0,
    unidadFuncional: null,
    shiftDate: null,
    origin: null,
    notes: null,
    shiftName: null,
    startTime: null,
    endTime: null,
    crossesMidnight: false,
    catalogStatus: "UNKNOWN",
    endDate: null,
    ...extra,
  };
}


// ---------------------------------------------------------------------------
// RESOLVER CANÓNICO
// ---------------------------------------------------------------------------
export const resolverTurnoProgramadoSeguro = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => resolverSchema.parse(input))
  .handler(async ({ data, context }): Promise<TurnoResuelto> => {
    const { supabase, userId } = context;

    const { data: isActive } = await (supabase.rpc as unknown as RpcFn)("is_active_member", {
      _user_id: userId,
    });
    if (!isActive) return vacio("SIN_PERMISO");

    const p = partesFecha(data.fecha);
    if (!p) return vacio("SIN_TURNO");

    // ---- 1. Schedule -------------------------------------------------------
    let scheduleId: string | null = null;
    if (data.scheduleId) {
      const { data: sch } = await supabase
        .from("shift_schedules")
        .select("id, year, month")
        .eq("id", data.scheduleId)
        .maybeSingle();
      if (!sch) return vacio("SCHEDULE_NO_ENCONTRADO");
      if (sch.year !== p.year || sch.month !== p.month) return vacio("SCHEDULE_NO_ENCONTRADO");
      scheduleId = sch.id;
    } else {
      const { data: rows } = await supabase
        .from("shift_schedules")
        .select("id")
        .eq("year", p.year)
        .eq("month", p.month);
      const list = rows ?? [];
      if (list.length === 0) return vacio("SCHEDULE_NO_ENCONTRADO");
      if (list.length > 1) return vacio("SCHEDULE_AMBIGUO", { matchCount: list.length });
      scheduleId = list[0].id;
    }

    // ---- 2. Miembro --------------------------------------------------------
    let memberId: string | null = null;
    let memberUserId: string | null = null;
    let method: TurnoResuelto["resolutionMethod"] = null;
    let matchCount = 0;

    if (data.memberId) {
      const { data: m } = await supabase
        .from("shift_schedule_members")
        .select("id, user_id")
        .eq("id", data.memberId)
        .eq("schedule_id", scheduleId)
        .maybeSingle();
      if (!m) return vacio("MIEMBRO_NO_VINCULADO", { scheduleId });
      memberId = m.id;
      memberUserId = m.user_id ?? null;
      method = "MEMBER_ID";
      matchCount = 1;
    }

    if (!memberId && data.targetUserId) {
      const { data: rows } = await supabase
        .from("shift_schedule_members")
        .select("id, user_id")
        .eq("schedule_id", scheduleId)
        .eq("user_id", data.targetUserId);
      const list = rows ?? [];
      if (list.length > 1)
        return vacio("IDENTIDAD_AMBIGUA", { scheduleId, matchCount: list.length });
      if (list.length === 1) {
        memberId = list[0].id;
        memberUserId = list[0].user_id ?? null;
        method = "USER_ID";
        matchCount = 1;
      }
    }

    if (!memberId) {
      // NIVEL 3 — fallback temporal por nombre normalizado exacto.
      let nombre = normalizarNombre(data.fallbackName);
      if (data.targetUserId) {
        const { data: perfil } = await supabase
          .from("profiles")
          .select("nombre, activo")
          .eq("user_id", data.targetUserId)
          .maybeSingle();
        if (perfil) {
          if (perfil.activo === false) return vacio("USUARIO_INACTIVO", { scheduleId });
          nombre = normalizarNombre(perfil.nombre) || nombre;
        }
      }
      if (!nombre) return vacio("MIEMBRO_NO_VINCULADO", { scheduleId });

      const { data: rows } = await supabase
        .from("shift_schedule_members")
        .select("id, full_name, user_id")
        .eq("schedule_id", scheduleId);
      const iguales = (rows ?? []).filter((r) => normalizarNombre(r.full_name) === nombre);
      if (iguales.length === 0) return vacio("MIEMBRO_NO_VINCULADO", { scheduleId });
      if (iguales.length > 1)
        return vacio("IDENTIDAD_AMBIGUA", { scheduleId, matchCount: iguales.length });
      memberId = iguales[0].id;
      memberUserId = iguales[0].user_id ?? null;
      method = "UNIQUE_NORMALIZED_NAME";
      matchCount = 1;
    }

    // ---- 3. Día ------------------------------------------------------------
    const { data: dias } = await supabase
      .from("shift_schedule_days")
      .select("id, day_number, shift_code, hours, unidad_funcional, shift_date, origin, notes")
      .eq("schedule_id", scheduleId)
      .eq("member_id", memberId)
      .eq("day_number", p.day);
    const filas = dias ?? [];
    const base = {
      scheduleId,
      memberId,
      userId: memberUserId,
      resolutionMethod: method,
      matchCount,
    };
    if (filas.length === 0) return vacio("SIN_TURNO", base);
    if (filas.length > 1)
      return vacio("PROGRAMACION_INCONSISTENTE", { ...base, matchCount: filas.length });

    const dia = filas[0];
    const shiftDate = dia.shift_date ?? data.fecha;
    // origin y notes provienen exclusivamente de la fila real; se conservan tal cual.
    const fila = {
      ...base,
      dayId: dia.id,
      dayNumber: dia.day_number ?? p.day,
      origin: dia.origin ?? null,
      notes: dia.notes ?? null,
      shiftDate,
    };
    if (!dia.shift_code) return vacio("SIN_TURNO", fila);

    // ---- 4. Catálogo -------------------------------------------------------
    const { data: tipo } = await supabase
      .from("shift_types")
      .select("code, name, start_time, end_time, hours, active")
      .eq("code", dia.shift_code)
      .maybeSingle();

    if (!tipo)
      return vacio("CODIGO_DESCONOCIDO", {
        ...fila,
        shiftCode: dia.shift_code,
        hours: Number(dia.hours) || 0,
        unidadFuncional: dia.unidad_funcional,
      });

    const crossesMidnight =
      !!tipo.start_time && !!tipo.end_time && String(tipo.end_time) <= String(tipo.start_time);

    return {
      ...fila,
      estado: "TURNO_ENCONTRADO",
      resolutionMethod: method,
      matchCount,
      shiftCode: tipo.code,
      hours: Number(dia.hours) || Number(tipo.hours) || 0,
      unidadFuncional: dia.unidad_funcional,
      shiftName: tipo.name,
      startTime: tipo.start_time ? String(tipo.start_time).slice(0, 5) : null,
      endTime: tipo.end_time ? String(tipo.end_time).slice(0, 5) : null,
      crossesMidnight,
      catalogStatus: tipo.active ? "ACTIVE" : "INACTIVE",
      endDate: crossesMidnight ? siguienteDia(shiftDate) : shiftDate,
    };

  });

// ---------------------------------------------------------------------------
// ADMINISTRACIÓN — helpers de autorización
// ---------------------------------------------------------------------------
async function exigirAdminActivo(context: {
  supabase: { rpc: unknown };
  userId: string;
}): Promise<string | null> {
  const rpc = context.supabase.rpc as unknown as RpcFn;
  const { data: isActive } = await rpc("is_active_member", { _user_id: context.userId });
  if (!isActive) return "INACTIVO";
  const { data: isAdmin } = await rpc("has_role", { _user_id: context.userId, _role: "admin" });
  if (!isAdmin) return "SIN_PERMISO";
  return null;
}

export interface MiembroVinculo {
  memberId: string;
  scheduleId: string;
  fullName: string;
  roleName: string | null;
  sede: string | null;
  active: boolean;
  userId: string | null;
  linkSource: string | null;
  linkedAt: string | null;
  usuarioNombre: string | null;
  usuarioActivo: boolean | null;
  estado: EstadoVinculo;
  sugerencias: Array<{ userId: string; nombre: string | null; cargo: string | null; sede: string | null }>;
}

const listarSchema = z.object({ scheduleId: z.string().uuid() }).strict();

export const listarVinculacionMiembros = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => listarSchema.parse(input))
  .handler(
    async ({ data, context }): Promise<{ ok: boolean; error?: string; items?: MiembroVinculo[] }> => {
      const err = await exigirAdminActivo(context);
      if (err) return { ok: false, error: err };

      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const [{ data: members }, { data: perfiles }] = await Promise.all([
        supabaseAdmin
          .from("shift_schedule_members")
          .select(
            "id, schedule_id, full_name, role_name, sede, active, user_id, link_source, linked_at",
          )
          .eq("schedule_id", data.scheduleId)
          .order("sort_order"),
        supabaseAdmin
          .from("profiles")
          .select("user_id, nombre, cargo, sede, activo, es_cuenta_prueba, es_cuenta_sistema"),
      ]);

      const usuarios = (perfiles ?? []).filter(
        (p) => !p.es_cuenta_prueba && !p.es_cuenta_sistema,
      );
      const porUsuario = new Map(usuarios.map((u) => [u.user_id, u]));

      const items: MiembroVinculo[] = (members ?? []).map((m) => {
        const vinculado = m.user_id ? porUsuario.get(m.user_id) ?? null : null;
        const norm = normalizarNombre(m.full_name);
        const candidatos = usuarios.filter((u) => normalizarNombre(u.nombre) === norm);
        const activos = candidatos.filter((u) => u.activo);

        let estado: EstadoVinculo;
        if (m.user_id) estado = "VINCULADO";
        else if (candidatos.length === 0) estado = "SIN COINCIDENCIA";
        else if (candidatos.length > 1) estado = "IDENTIDAD AMBIGUA";
        else if (activos.length === 0) estado = "USUARIO INACTIVO";
        else estado = "SUGERENCIA DISPONIBLE";

        return {
          memberId: m.id,
          scheduleId: m.schedule_id,
          fullName: m.full_name,
          roleName: m.role_name,
          sede: m.sede,
          active: m.active !== false,
          userId: m.user_id,
          linkSource: m.link_source,
          linkedAt: m.linked_at,
          usuarioNombre: vinculado?.nombre ?? null,
          usuarioActivo: vinculado ? !!vinculado.activo : null,
          estado,
          sugerencias: activos.map((u) => ({
            userId: u.user_id,
            nombre: u.nombre,
            cargo: u.cargo,
            sede: u.sede,
          })),
        };
      });

      return { ok: true, items };
    },
  );

const buscarSchema = z.object({ q: z.string().trim().max(120).default("") }).strict();

export const buscarUsuariosVinculables = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => buscarSchema.parse(input))
  .handler(async ({ data, context }) => {
    const err = await exigirAdminActivo(context);
    if (err) return { ok: false as const, error: err };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: perfiles } = await supabaseAdmin
      .from("profiles")
      .select("user_id, nombre, cargo, sede, activo, es_cuenta_prueba, es_cuenta_sistema")
      .eq("activo", true)
      .order("nombre");

    const q = normalizarNombre(data.q);
    const items = (perfiles ?? [])
      .filter((p) => !p.es_cuenta_prueba && !p.es_cuenta_sistema)
      .filter((p) => (q ? normalizarNombre(p.nombre).includes(q) : true))
      .slice(0, 50)
      .map((p) => ({
        userId: p.user_id,
        nombre: p.nombre,
        cargo: p.cargo,
        sede: p.sede,
        activo: !!p.activo,
      }));
    return { ok: true as const, items };
  });

// ---------------------------------------------------------------------------
// VINCULAR / DESVINCULAR
// ---------------------------------------------------------------------------
const MENSAJES: Record<string, string> = {
  NO_AUTENTICADO: "No tiene permisos para vincular colaboradores.",
  SIN_PERMISO: "No tiene permisos para vincular colaboradores.",
  INACTIVO: "El usuario no está activo.",
  LINK_SOURCE_NO_VALIDO: "Origen de vinculación no permitido.",
  MIEMBRO_NO_ENCONTRADO: "El colaborador no existe en este Cuadro de Turno.",
  SCHEDULE_NO_ENCONTRADO: "No existe un Cuadro de Turno para este colaborador.",
  USUARIO_NO_ENCONTRADO: "El usuario seleccionado no existe.",
  USUARIO_INACTIVO: "El usuario seleccionado no está activo.",
  VINCULO_DUPLICADO: "Ese usuario ya está vinculado a otro colaborador de este cuadro.",
  SIN_VINCULO: "El colaborador no tiene un vínculo activo.",
};

const vincularSchema = z
  .object({
    memberId: z.string().uuid(),
    targetUserId: z.string().uuid(),
    linkSource: z.enum(["MANUAL_ADMIN", "CONFIRMED_NAME_SUGGESTION"]),
  })
  .strict();

export const vincularMiembroUsuario = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => vincularSchema.parse(input))
  .handler(async ({ data, context }): Promise<{ ok: boolean; error?: string }> => {
    const err = await exigirAdminActivo(context);
    if (err) return { ok: false, error: MENSAJES[err] };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: res, error } = await (supabaseAdmin.rpc as unknown as RpcFn)(
      "vincular_miembro_usuario",
      {
        _actor: context.userId,
        _member_id: data.memberId,
        _target_user_id: data.targetUserId,
        _link_source: data.linkSource,
      },
    );
    if (error) {
      console.error("vincularMiembroUsuario");
      return { ok: false, error: "No fue posible vincular al colaborador." };
    }
    const out = (res ?? {}) as { ok?: boolean; error?: string };
    if (!out.ok)
      return { ok: false, error: MENSAJES[out.error ?? ""] ?? "No fue posible vincular al colaborador." };
    return { ok: true };
  });

const desvincularSchema = z.object({ memberId: z.string().uuid() }).strict();

export const desvincularMiembroUsuario = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => desvincularSchema.parse(input))
  .handler(async ({ data, context }): Promise<{ ok: boolean; error?: string }> => {
    const err = await exigirAdminActivo(context);
    if (err) return { ok: false, error: MENSAJES[err] };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: res, error } = await (supabaseAdmin.rpc as unknown as RpcFn)(
      "desvincular_miembro_usuario",
      { _actor: context.userId, _member_id: data.memberId },
    );
    if (error) {
      console.error("desvincularMiembroUsuario");
      return { ok: false, error: "No fue posible desvincular al colaborador." };
    }
    const out = (res ?? {}) as { ok?: boolean; error?: string };
    if (!out.ok)
      return {
        ok: false,
        error: MENSAJES[out.error ?? ""] ?? "No fue posible desvincular al colaborador.",
      };
    return { ok: true };
  });
