import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ---------------------------------------------------------------------------
// Importación masiva de CUADRO DE TURNO → Solicitudes / Permisos / Cambios y
// Control de ausentismo (desde Control de Mando → Históricos).
// `confirmar=false` -> previsualización (resumen), no escribe.
// `confirmar=true`  -> inserta con confirmación explícita.
// Reservado a coordinación (ADMIN). Auditado. No guarda archivos.
// ---------------------------------------------------------------------------

const norm = (v: unknown) =>
  String(v ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "")
    .trim();

const txt = (v: unknown) => {
  const s = String(v ?? "").trim();
  return s === "" ? null : s;
};

/** Devuelve fecha en formato YYYY-MM-DD (acepta serial Excel, dd/mm/yyyy o ISO). */
function parseDate(v: unknown): string | null {
  if (v == null || v === "") return null;
  if (typeof v === "number" && Number.isFinite(v)) {
    const ms = Math.round((v - 25569) * 86400 * 1000);
    const d = new Date(ms);
    if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }
  const s = String(v).trim();
  const m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (m) {
    let [, d, mo, y] = m;
    if (y.length === 2) y = "20" + y;
    const dd = String(Number(d)).padStart(2, "0");
    const mm = String(Number(mo)).padStart(2, "0");
    return `${y}-${mm}-${dd}`;
  }
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return iso[0];
  const dt = new Date(s);
  if (!Number.isNaN(dt.getTime())) return dt.toISOString().slice(0, 10);
  return null;
}

/** Devuelve hora HH:MM:SS o null. */
function parseTime(v: unknown): string | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const m = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return null;
  const hh = String(Number(m[1])).padStart(2, "0");
  return `${hh}:${m[2]}:${m[3] ?? "00"}`;
}

const VERDADERO = ["true", "si", "sí", "1", "x", "verdadero", "yes"];
const parseBool = (v: unknown) => VERDADERO.includes(norm(v));
const parseNum = (v: unknown) => {
  const n = Number(String(v ?? "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

// --- Columnas de plantilla (encabezados esperados) -------------------------
export const COLUMNAS_SOLICITUDES = [
  "request_type", "requester_name", "requester_identification", "requester_role",
  "requester_sede", "reason_type", "start_date", "end_date", "start_time",
  "end_time", "will_recover_time", "requires_replacement", "replacement_name",
  "status", "observations",
];

export const COLUMNAS_AUSENTISMO = [
  "registration_date", "worker_name", "identification_number", "role_name",
  "start_date", "end_date", "start_time", "end_time", "minutes_number",
  "days_number", "event_code", "event_name", "reason", "eps", "arl",
  "daily_salary", "required_resources", "additional_details", "status",
];

export type ResumenTurno = {
  validos: number;
  omitidos: number;
  errores: { fila: number; error: string }[];
};

const inputSchema = z.object({
  filas: z.array(z.record(z.string(), z.unknown())).min(1).max(5000),
  confirmar: z.boolean().default(false),
});

async function esAdmin(supabase: any, userId: string): Promise<boolean> {
  const { data } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  return !!data;
}

async function auditar(
  userId: string,
  tabla: string,
  resultado: string,
  resumen: ResumenTurno,
) {
  const { registrarAuditoriaServer } = await import("./auditoria.server");
  await registrarAuditoriaServer(userId, {
    accion: "importar",
    modulo: "importacion",
    tabla,
    resultado,
    detalles: { validos: resumen.validos, omitidos: resumen.omitidos, errores: resumen.errores.length },
  });
}

// --- SOLICITUDES / PERMISOS / CAMBIOS DE TURNO -----------------------------
export const procesarImportSolicitudes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => inputSchema.parse(input))
  .handler(async ({ data, context }): Promise<{ ok: boolean; resumen: ResumenTurno; error: string | null }> => {
    const { supabase, userId } = context;
    const vacio: ResumenTurno = { validos: 0, omitidos: 0, errores: [] };
    if (!(await esAdmin(supabase, userId))) {
      return { ok: false, resumen: vacio, error: "Acción reservada a coordinación." };
    }

    const registros: Record<string, unknown>[] = [];
    const errores: ResumenTurno["errores"] = [];
    let omitidos = 0;

    data.filas.forEach((filaCruda, idx) => {
      const f: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(filaCruda)) f[norm(k)] = v;
      const vacia = Object.values(f).every((v) => String(v ?? "").trim() === "");
      if (vacia) return;

      const requester_name = txt(f["requester_name"]);
      const request_type = txt(f["request_type"]);
      if (!requester_name || !request_type) {
        errores.push({ fila: idx + 1, error: "Faltan 'request_type' o 'requester_name'." });
        omitidos++;
        return;
      }
      registros.push({
        request_type,
        requester_id: userId, // carga administrativa (RLS: requester_id = auth.uid())
        requester_name,
        requester_identification: txt(f["requester_identification"]),
        requester_role: txt(f["requester_role"]),
        requester_sede: txt(f["requester_sede"]),
        reason_type: txt(f["reason_type"]),
        start_date: parseDate(f["start_date"]),
        end_date: parseDate(f["end_date"]),
        start_time: parseTime(f["start_time"]),
        end_time: parseTime(f["end_time"]),
        will_recover_time: parseBool(f["will_recover_time"]),
        requires_replacement: parseBool(f["requires_replacement"]),
        replacement_name: txt(f["replacement_name"]),
        status: txt(f["status"]) ?? "pendiente",
        observations: txt(f["observations"]),
      });
    });

    const resumen: ResumenTurno = { validos: registros.length, omitidos, errores: errores.slice(0, 100) };
    if (!data.confirmar) return { ok: true, resumen, error: null };
    if (registros.length === 0) return { ok: false, resumen, error: "No hay filas válidas para importar." };

    const { error } = await (supabase as any).from("shift_requests").insert(registros);
    if (error) {
      console.error("procesarImportSolicitudes: error insertando");
      await auditar(userId, "shift_requests", "fallido", resumen);
      return { ok: false, resumen, error: "No se pudieron guardar las solicitudes." };
    }
    await auditar(userId, "shift_requests", "exito", resumen);
    return { ok: true, resumen, error: null };
  });

// --- CONTROL DE AUSENTISMO -------------------------------------------------
export const procesarImportAusentismo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => inputSchema.parse(input))
  .handler(async ({ data, context }): Promise<{ ok: boolean; resumen: ResumenTurno; error: string | null }> => {
    const { supabase, userId } = context;
    const vacio: ResumenTurno = { validos: 0, omitidos: 0, errores: [] };
    if (!(await esAdmin(supabase, userId))) {
      return { ok: false, resumen: vacio, error: "Acción reservada a coordinación." };
    }

    const registros: Record<string, unknown>[] = [];
    const errores: ResumenTurno["errores"] = [];
    let omitidos = 0;

    data.filas.forEach((filaCruda, idx) => {
      const f: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(filaCruda)) f[norm(k)] = v;
      const vacia = Object.values(f).every((v) => String(v ?? "").trim() === "");
      if (vacia) return;

      const worker_name = txt(f["worker_name"]);
      const registration_date = parseDate(f["registration_date"]) ?? parseDate(f["start_date"]);
      if (!worker_name || !registration_date) {
        errores.push({ fila: idx + 1, error: "Faltan 'worker_name' o 'registration_date'." });
        omitidos++;
        return;
      }
      registros.push({
        registration_date,
        worker_name,
        identification_number: txt(f["identification_number"]),
        role_name: txt(f["role_name"]),
        start_date: parseDate(f["start_date"]),
        end_date: parseDate(f["end_date"]),
        start_time: parseTime(f["start_time"]),
        end_time: parseTime(f["end_time"]),
        minutes_number: Math.round(parseNum(f["minutes_number"])),
        days_number: parseNum(f["days_number"]),
        event_code: txt(f["event_code"]),
        event_name: txt(f["event_name"]),
        reason: txt(f["reason"]),
        eps: txt(f["eps"]),
        arl: txt(f["arl"]),
        daily_salary: f["daily_salary"] != null && String(f["daily_salary"]).trim() !== "" ? parseNum(f["daily_salary"]) : null,
        required_resources: txt(f["required_resources"]),
        additional_details: txt(f["additional_details"]),
        origin: "importacion",
        status: txt(f["status"]) ?? "activo",
        created_by: userId,
      });
    });

    const resumen: ResumenTurno = { validos: registros.length, omitidos, errores: errores.slice(0, 100) };
    if (!data.confirmar) return { ok: true, resumen, error: null };
    if (registros.length === 0) return { ok: false, resumen, error: "No hay filas válidas para importar." };

    const { error } = await (supabase as any).from("shift_absenteeism_records").insert(registros);
    if (error) {
      console.error("procesarImportAusentismo: error insertando");
      await auditar(userId, "shift_absenteeism_records", "fallido", resumen);
      return { ok: false, resumen, error: "No se pudieron guardar los registros de ausentismo." };
    }
    await auditar(userId, "shift_absenteeism_records", "exito", resumen);
    return { ok: true, resumen, error: null };
  });
