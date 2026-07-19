// ============================================================
// Server functions para versionado de plantillas del inventario.
// Solo el administrador puede crear borradores, guardar cambios,
// publicar una versión o restaurar una versión anterior.
// Al publicar, la versión pasa a ACTIVA y su contenido_editable
// se copia a plantillas_inventario para que los generadores lo
// vean sin cambios de contrato.
// ============================================================
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(context: {
  supabase: ReturnType<typeof requireSupabaseAuth extends never ? never : any>;
  userId: string;
}) {
  const { data, error } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Solo un administrador puede realizar esta acción.");
}

// ---------- Listar versiones -------------------------------------------------
export const listarVersionesPlantilla = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { plantilla_codigo: string }) => d)
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("plantillas_versiones")
      .select(
        "id, plantilla_codigo, version, estado, contenido_editable, motivo, creada_por, publicada_por, publicada_at, archivada_at, created_at, updated_at",
      )
      .eq("plantilla_codigo", data.plantilla_codigo)
      .order("version", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

// ---------- Crear borrador ---------------------------------------------------
export const crearBorradorPlantilla = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { plantilla_codigo: string; motivo?: string }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);

    // Toma la última versión como base
    const { data: ult, error: e0 } = await context.supabase
      .from("plantillas_versiones")
      .select("version, contenido_editable")
      .eq("plantilla_codigo", data.plantilla_codigo)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (e0) throw new Error(e0.message);

    const proxima = ((ult?.version as number | undefined) ?? 0) + 1;

    const { data: creada, error } = await context.supabase
      .from("plantillas_versiones")
      .insert({
        plantilla_codigo: data.plantilla_codigo,
        version: proxima,
        estado: "BORRADOR",
        contenido_editable: (ult?.contenido_editable ?? {}) as never,
        motivo: data.motivo ?? null,
        creada_por: context.userId,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return creada;
  });

// ---------- Guardar borrador -------------------------------------------------
export const guardarBorradorPlantilla = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { version_id: string; contenido_editable: Record<string, unknown>; motivo?: string }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);

    const { data: v, error: eGet } = await context.supabase
      .from("plantillas_versiones")
      .select("estado")
      .eq("id", data.version_id)
      .maybeSingle();
    if (eGet) throw new Error(eGet.message);
    if (!v) throw new Error("Versión no encontrada.");
    if (v.estado !== "BORRADOR") {
      throw new Error("Solo se puede editar una versión en estado BORRADOR.");
    }

    const { error } = await context.supabase
      .from("plantillas_versiones")
      .update({
        contenido_editable: data.contenido_editable as never,
        motivo: data.motivo ?? null,
      })
      .eq("id", data.version_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- Publicar versión -------------------------------------------------
export const publicarVersionPlantilla = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { version_id: string; motivo?: string }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);

    const { data: v, error: eGet } = await context.supabase
      .from("plantillas_versiones")
      .select("plantilla_codigo, estado, contenido_editable, version")
      .eq("id", data.version_id)
      .maybeSingle();
    if (eGet) throw new Error(eGet.message);
    if (!v) throw new Error("Versión no encontrada.");
    if (v.estado !== "BORRADOR") {
      throw new Error("Solo se puede publicar un borrador.");
    }

    // Archiva la activa anterior
    const { error: eArch } = await context.supabase
      .from("plantillas_versiones")
      .update({ estado: "ARCHIVADA", archivada_at: new Date().toISOString() })
      .eq("plantilla_codigo", v.plantilla_codigo)
      .eq("estado", "ACTIVA");
    if (eArch) throw new Error(eArch.message);

    // Activa esta
    const { error: eAct } = await context.supabase
      .from("plantillas_versiones")
      .update({
        estado: "ACTIVA",
        publicada_at: new Date().toISOString(),
        publicada_por: context.userId,
        motivo: data.motivo ?? null,
      })
      .eq("id", data.version_id);
    if (eAct) throw new Error(eAct.message);

    // Refleja el contenido en plantillas_inventario (contrato para generadores)
    const { error: eSync } = await context.supabase
      .from("plantillas_inventario")
      .update({
        contenido_editable: (v.contenido_editable ?? {}) as never,
        version: `${v.version}.0`,
      })
      .eq("codigo", v.plantilla_codigo);
    if (eSync) throw new Error(eSync.message);

    return { ok: true };
  });

// ---------- Restaurar versión anterior --------------------------------------
export const restaurarVersionPlantilla = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { version_id: string; motivo?: string }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);

    const { data: v, error: eGet } = await context.supabase
      .from("plantillas_versiones")
      .select("plantilla_codigo, contenido_editable")
      .eq("id", data.version_id)
      .maybeSingle();
    if (eGet) throw new Error(eGet.message);
    if (!v) throw new Error("Versión no encontrada.");

    // Crea un nuevo borrador con el contenido de la versión seleccionada
    const { data: ult, error: e0 } = await context.supabase
      .from("plantillas_versiones")
      .select("version")
      .eq("plantilla_codigo", v.plantilla_codigo)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (e0) throw new Error(e0.message);

    const proxima = ((ult?.version as number | undefined) ?? 0) + 1;

    const { data: creada, error } = await context.supabase
      .from("plantillas_versiones")
      .insert({
        plantilla_codigo: v.plantilla_codigo,
        version: proxima,
        estado: "BORRADOR",
        contenido_editable: (v.contenido_editable ?? {}) as never,
        motivo: data.motivo ?? "Restauración de versión anterior",
        creada_por: context.userId,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return creada;
  });
