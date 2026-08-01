import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

// -----------------------------------------------------------------------------
// Edición total ADMIN para el Dashboard Operativo Salientes.
// - Solo administradores autenticados.
// - Allowlist estricta por tabla (excluye id, created_at/by, hashes, firmas,
//   QR, campos derivados).
// - Escritura vía cliente de la sesión (RLS del admin) — NO service_role.
// - Auditoría por-campo (antes/después) con registrar_auditoria (auth.uid()).
// -----------------------------------------------------------------------------

const TABLAS = ["remisiones", "domiciliarios", "referencia_interna", "pendientes"] as const;
type Tabla = (typeof TABLAS)[number];

// Allowlist por tabla. Cualquier campo fuera de esta lista se ignora.
const ALLOW: Record<Tabla, readonly string[]> = {
  remisiones: [
    "paciente", "tipo_documento", "documento", "edad", "cie10",
    "servicio", "cama", "asegurador", "eapb", "regimen",
    "remision_por", "alcance_red", "tipo_ambulancia", "prioridad", "estado",
    "tipo_tramite", "fecha_inicio", "fecha_radicado",
    // especialidades_*: fuera de la allowlist — ciclo canónico Novedades → Cambio de Especialidad.
    "codigo_radicacion", "eapb_genera_codigo",
    "contacto_nombre", "contacto_parentesco", "contacto_telefono",
    "observaciones", "especificacion", "evolucion", "evolucion_detalle",
  ],
  domiciliarios: [
    "paciente", "tipo_documento", "documento", "edad", "cie10",
    "eapb", "regimen", "servicio", "cama", "prioridad",
    "tipo_solicitud", "unidad_especial", "tipo_solicitud_detalle",
    "requiere_ambulancia", "tipo_ambulancia",
    "especialidades_tratantes", "contacto_nombre", "contacto_parentesco",
    "contacto_telefono", "observaciones", "estado",
    "fecha_inicio", "fecha_radicado",
    "codigo_radicacion", "eapb_genera_codigo",
    "ips_receptora", "empresa_traslado",
  ],
  referencia_interna: [
    "paciente", "tipo_documento", "documento", "servicio", "tipo_solicitud",
    "tipo_ambulancia", "eapb", "prioridad", "observaciones", "estado",
    "fecha_radicado",
  ],
  pendientes: [
    "paciente_asunto", "tipo_pendiente", "ips_area", "prioridad",
    "observacion_entrega", "estado",
  ],
};

const schema = z.object({
  tabla: z.enum(TABLAS),
  casoId: z.string().uuid(),
  cambios: z.record(z.string(), z.unknown()),
});

function normalizarValor(v: unknown): unknown {
  if (v === undefined) return undefined;
  if (v === null) return null;
  if (typeof v === "string") {
    const t = v.trim();
    return t === "" ? null : t;
  }
  return v;
}

// NO_SE_COMENTA solo válido con EAPB=NUEVA EPS y remision_por=RED NO CONTRATADA.
function validarAlcanceRed(final: Record<string, unknown>): string | null {
  if (final.alcance_red !== "NO_SE_COMENTA") return null;
  const eapb = String(final.eapb ?? "").toUpperCase();
  const remPor = String(final.remision_por ?? "").toUpperCase();
  if (!eapb.includes("NUEVA EPS") || remPor !== "RED NO CONTRATADA") {
    return "\"NO SE COMENTA A LA RED\" solo aplica con EAPB Nueva EPS y Remisión por Red no contratada.";
  }
  return null;
}

export const editarCasoSalienteAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => schema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // 1) Verificación de rol admin.
    const { data: esAdmin, error: errRole } = await supabase.rpc("has_role", {
      _user_id: userId, _role: "admin",
    });
    if (errRole || !esAdmin) {
      return { ok: false, error: "Acción reservada al administrador." as string | null };
    }

    const allow = ALLOW[data.tabla];

    // 1.b) Rechazo estricto: las especialidades canónicas (Remisiones) no se
    // editan por la vía general; deben pasar por Novedades → Cambio de Especialidad.
    if (data.tabla === "remisiones") {
      const bloqueadas = ["especialidades_tratantes", "especialidades_receptoras"];
      if (bloqueadas.some((k) => k in data.cambios)) {
        return {
          ok: false,
          error:
            "Las especialidades deben modificarse desde Seguimientos → Novedades → Cambio de Especialidad." as
              | string
              | null,
        };
      }
    }

    // 2) Filtrado por allowlist + normalización.
    const cambios: Record<string, unknown> = {};
    for (const key of Object.keys(data.cambios)) {
      if (!allow.includes(key)) continue;
      const v = normalizarValor(data.cambios[key]);
      if (v === undefined) continue;
      cambios[key] = v;
    }
    if (Object.keys(cambios).length === 0) {
      return { ok: false, error: "No hay cambios válidos para aplicar." as string | null };
    }

    // 3) Leer estado anterior (para diff de auditoría y validación combinada).
    const { data: antes, error: errRead } = await (supabase.from(data.tabla) as any)
      .select("*")
      .eq("id", data.casoId)
      .maybeSingle();
    if (errRead || !antes) {
      return { ok: false, error: "No se pudo leer el caso a editar." as string | null };
    }

    // 4) Validaciones cruzadas (solo remisiones para NO_SE_COMENTA).
    if (data.tabla === "remisiones") {
      const merge = { ...antes, ...cambios };
      const err = validarAlcanceRed(merge);
      if (err) return { ok: false, error: err as string | null };
    }

    // 5) Diff antes/después limitado a los campos modificados.
    const diff: Record<string, { antes: unknown; despues: unknown }> = {};
    for (const k of Object.keys(cambios)) {
      const a = (antes as any)[k] ?? null;
      const b = cambios[k] ?? null;
      if (a !== b) diff[k] = { antes: a, despues: b };
    }
    if (Object.keys(diff).length === 0) {
      return { ok: true, error: null as string | null, sinCambios: true };
    }

    // 6) Actualizar (RLS de admin permite update).
    const { error: errUpd } = await (supabase.from(data.tabla) as any)
      .update(cambios)
      .eq("id", data.casoId);
    if (errUpd) {
      return { ok: false, error: errUpd.message as string | null };
    }

    // 7) Auditoría por auth.uid() (no falla la operación si falla el log).
    try {
      await (supabase.rpc as any)("registrar_auditoria", {
        _accion: "salientes.edicion_admin",
        _modulo: "remisiones",
        _tabla: data.tabla,
        _registro_id: data.casoId,
        _resultado: "exito",
        _detalles: { campos: Object.keys(diff), diff } as any,
      });
    } catch { /* no interrumpe */ }

    return { ok: true, error: null as string | null };
  });
