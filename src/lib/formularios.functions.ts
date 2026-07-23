// ============================================================
// Fase 12 · Etapa 2 — Server functions del piloto de formularios.
// Solo administradores activos pueden escribir/publicar. Runtime devuelve
// únicamente la versión ACTIVA. El código está allowlisted.
// ============================================================

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import {
  RED_OPERATIVA_FORM_CODE,
  redOperativaFormSchema,
  normalizeConfig,
} from "./red-operativa-form-config";
import { registrarAuditoria } from "./auditoria.functions";

// Allowlist de códigos de formulario administrables en esta etapa.
const CODIGOS_ALLOWLIST = new Set<string>([RED_OPERATIVA_FORM_CODE]);

function assertCodigo(codigo: string): asserts codigo is typeof RED_OPERATIVA_FORM_CODE {
  if (!CODIGOS_ALLOWLIST.has(codigo)) {
    throw new Error(`Código de formulario no permitido: ${codigo}`);
  }
}

async function assertAdmin(ctx: { supabase: any; userId: string }) {
  const { data, error } = await ctx.supabase.rpc("has_role", {
    _user_id: ctx.userId,
    _role: "admin",
  });
  if (error || !data) {
    throw new Error("Solo el administrador puede configurar formularios.");
  }
}

// ------------------------------------------------------------------
// LECTURA — Admin: definiciones (con versión activa y borrador)
// ------------------------------------------------------------------

export const listarFormulariosAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { data, error } = await context.supabase
      .from("formularios_definiciones")
      .select("*")
      .order("codigo");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const obtenerFormularioAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { codigo: string }) =>
    z.object({ codigo: z.string().min(1).max(80) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    assertCodigo(data.codigo);
    const { data: def, error } = await context.supabase
      .from("formularios_definiciones")
      .select("*")
      .eq("codigo", data.codigo)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!def) return null;
    const { data: versiones, error: vErr } = await context.supabase
      .from("formularios_versiones")
      .select("*")
      .eq("formulario_id", def.id)
      .order("numero_version", { ascending: false });
    if (vErr) throw new Error(vErr.message);
    return { definicion: def, versiones: versiones ?? [] };
  });

export const obtenerVersionesFormulario = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { codigo: string }) =>
    z.object({ codigo: z.string().min(1).max(80) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    assertCodigo(data.codigo);
    const { data: def, error: dErr } = await context.supabase
      .from("formularios_definiciones")
      .select("id")
      .eq("codigo", data.codigo)
      .maybeSingle();
    if (dErr) throw new Error(dErr.message);
    if (!def) return [];
    const { data: versiones, error } = await context.supabase
      .from("formularios_versiones")
      .select("*")
      .eq("formulario_id", def.id)
      .order("numero_version", { ascending: false });
    if (error) throw new Error(error.message);
    return versiones ?? [];
  });

// ------------------------------------------------------------------
// LECTURA — Runtime: cualquier miembro activo puede leer la ACTIVA
// ------------------------------------------------------------------

export const obtenerFormularioPublicado = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { codigo: string }) =>
    z.object({ codigo: z.string().min(1).max(80) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    assertCodigo(data.codigo);
    const { data: def, error: dErr } = await context.supabase
      .from("formularios_definiciones")
      .select("id, codigo, version_publicada_id")
      .eq("codigo", data.codigo)
      .maybeSingle();
    if (dErr) throw new Error(dErr.message);
    if (!def || !def.version_publicada_id) return null;
    const { data: ver, error } = await context.supabase
      .from("formularios_versiones")
      .select("id, numero_version, estado, schema_config, published_at")
      .eq("id", def.version_publicada_id)
      .eq("estado", "ACTIVA")
      .maybeSingle();
    if (error) throw new Error(error.message);
    return ver;
  });

// ------------------------------------------------------------------
// ESCRITURA — Borrador / Publicar / Restaurar
// ------------------------------------------------------------------

export const crearBorradorFormulario = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { codigo: string }) =>
    z.object({ codigo: z.string().min(1).max(80) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    assertCodigo(data.codigo);
    const { data: def, error: dErr } = await context.supabase
      .from("formularios_definiciones")
      .select("id, version_publicada_id")
      .eq("codigo", data.codigo)
      .maybeSingle();
    if (dErr) throw new Error(dErr.message);
    if (!def) throw new Error("Definición no encontrada");

    // Si ya existe un borrador, se reutiliza (índice único garantiza uno).
    const { data: existente } = await context.supabase
      .from("formularios_versiones")
      .select("*")
      .eq("formulario_id", def.id)
      .eq("estado", "BORRADOR")
      .maybeSingle();
    if (existente) return existente;

    // Semilla: copiar la ACTIVA actual (o vacío si no hay).
    let seed: unknown = { schema_version: 1, sections: [], fields: [] };
    if (def.version_publicada_id) {
      const { data: activa } = await context.supabase
        .from("formularios_versiones")
        .select("schema_config")
        .eq("id", def.version_publicada_id)
        .maybeSingle();
      if (activa?.schema_config) seed = activa.schema_config;
    }

    const { data: maxRow } = await context.supabase
      .from("formularios_versiones")
      .select("numero_version")
      .eq("formulario_id", def.id)
      .order("numero_version", { ascending: false })
      .limit(1)
      .maybeSingle();
    const nextV = (maxRow?.numero_version ?? 0) + 1;

    const { data: nuevo, error } = await context.supabase
      .from("formularios_versiones")
      .insert({
        formulario_id: def.id,
        numero_version: nextV,
        estado: "BORRADOR",
        schema_config: seed as never,
        created_by: context.userId,
        updated_by: context.userId,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);

    await registrarAuditoria({
      data: {
        accion: "form_config_draft_created",
        modulo: "control-mando",
        tabla: "formularios_versiones",
        registroId: nuevo.id,
        detalles: { codigo: data.codigo, version: nextV },
      },
    }).catch(() => {});

    return nuevo;
  });

export const guardarBorradorFormulario = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { codigo: string; versionId: string; schemaConfig: unknown; motivo?: string }) =>
    z
      .object({
        codigo: z.string().min(1).max(80),
        versionId: z.string().uuid(),
        schemaConfig: z.unknown(),
        motivo: z.string().max(400).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    assertCodigo(data.codigo);

    // Validar y normalizar antes de guardar
    const parsed = redOperativaFormSchema.safeParse(data.schemaConfig);
    if (!parsed.success) {
      throw new Error("Configuración inválida: " + parsed.error.message.slice(0, 400));
    }
    const normalized = normalizeConfig(parsed.data);

    const { data: ver, error } = await context.supabase
      .from("formularios_versiones")
      .update({
        schema_config: normalized,
        motivo_cambio: data.motivo ?? null,
        updated_by: context.userId,
      })
      .eq("id", data.versionId)
      .eq("estado", "BORRADOR")
      .select("*")
      .single();
    if (error) throw new Error(error.message);

    await registrarAuditoria({
      data: {
        accion: "form_config_draft_updated",
        modulo: "control-mando",
        tabla: "formularios_versiones",
        registroId: ver.id,
        detalles: { codigo: data.codigo, motivo: data.motivo ?? null },
      },
    }).catch(() => {});

    return ver;
  });

export const publicarVersionFormulario = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { codigo: string; versionId: string }) =>
    z
      .object({ codigo: z.string().min(1).max(80), versionId: z.string().uuid() })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    assertCodigo(data.codigo);

    const { data: def, error: dErr } = await context.supabase
      .from("formularios_definiciones")
      .select("id, version_publicada_id")
      .eq("codigo", data.codigo)
      .maybeSingle();
    if (dErr) throw new Error(dErr.message);
    if (!def) throw new Error("Definición no encontrada");

    const { data: ver, error: vErr } = await context.supabase
      .from("formularios_versiones")
      .select("id, formulario_id, estado, schema_config")
      .eq("id", data.versionId)
      .eq("formulario_id", def.id)
      .maybeSingle();
    if (vErr) throw new Error(vErr.message);
    if (!ver) throw new Error("Versión no encontrada");
    if (ver.estado !== "BORRADOR") throw new Error("Solo se puede publicar un borrador");

    // Validar nuevamente en servidor
    const parsed = redOperativaFormSchema.safeParse(ver.schema_config);
    if (!parsed.success) throw new Error("La configuración no es válida");

    // Archivar la ACTIVA actual (si existe)
    if (def.version_publicada_id) {
      const { error: aErr } = await context.supabase
        .from("formularios_versiones")
        .update({ estado: "ARCHIVADA", archived_at: new Date().toISOString(), archived_by: context.userId })
        .eq("id", def.version_publicada_id)
        .eq("estado", "ACTIVA");
      if (aErr) throw new Error(aErr.message);
    }

    // Activar el borrador
    const { error: pErr } = await context.supabase
      .from("formularios_versiones")
      .update({
        estado: "ACTIVA",
        published_at: new Date().toISOString(),
        published_by: context.userId,
      })
      .eq("id", ver.id);
    if (pErr) throw new Error(pErr.message);

    // Actualizar puntero de definición
    const { error: uErr } = await context.supabase
      .from("formularios_definiciones")
      .update({ version_publicada_id: ver.id, updated_by: context.userId })
      .eq("id", def.id);
    if (uErr) throw new Error(uErr.message);

    await registrarAuditoria({
      data: {
        accion: "form_config_published",
        modulo: "control-mando",
        tabla: "formularios_versiones",
        registroId: ver.id,
        detalles: { codigo: data.codigo },
      },
    }).catch(() => {});

    return { ok: true, versionId: ver.id };
  });

export const restaurarVersionFormulario = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { codigo: string; versionId: string }) =>
    z
      .object({ codigo: z.string().min(1).max(80), versionId: z.string().uuid() })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    assertCodigo(data.codigo);

    const { data: def } = await context.supabase
      .from("formularios_definiciones")
      .select("id")
      .eq("codigo", data.codigo)
      .maybeSingle();
    if (!def) throw new Error("Definición no encontrada");

    const { data: origen } = await context.supabase
      .from("formularios_versiones")
      .select("id, formulario_id, schema_config, numero_version")
      .eq("id", data.versionId)
      .eq("formulario_id", def.id)
      .maybeSingle();
    if (!origen) throw new Error("Versión origen no encontrada");

    // Bloquear si ya hay un borrador (índice único lo garantiza también)
    const { data: existente } = await context.supabase
      .from("formularios_versiones")
      .select("id")
      .eq("formulario_id", def.id)
      .eq("estado", "BORRADOR")
      .maybeSingle();
    if (existente) throw new Error("Ya existe un borrador. Descártelo o publíquelo antes de restaurar.");

    const { data: maxRow } = await context.supabase
      .from("formularios_versiones")
      .select("numero_version")
      .eq("formulario_id", def.id)
      .order("numero_version", { ascending: false })
      .limit(1)
      .maybeSingle();
    const nextV = (maxRow?.numero_version ?? 0) + 1;

    const { data: nuevo, error } = await context.supabase
      .from("formularios_versiones")
      .insert({
        formulario_id: def.id,
        numero_version: nextV,
        estado: "BORRADOR",
        schema_config: origen.schema_config,
        motivo_cambio: `Restaurado desde v${origen.numero_version}`,
        created_by: context.userId,
        updated_by: context.userId,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);

    await registrarAuditoria({
      data: {
        accion: "form_config_restored",
        modulo: "control-mando",
        tabla: "formularios_versiones",
        registroId: nuevo.id,
        detalles: { codigo: data.codigo, desde_version: origen.numero_version },
      },
    }).catch(() => {});

    return nuevo;
  });
