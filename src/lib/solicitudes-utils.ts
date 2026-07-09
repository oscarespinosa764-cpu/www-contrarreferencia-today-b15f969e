// ============================================================================
// Solicitudes y Ausentismo — utilidades compartidas (Fase 1-7).
// Resolución de turnos reales desde `shift_types`, cálculo de horas/minutos,
// fracciones de devolución y consumo mensual. Lógica de presentación/cálculo.
// No contiene secretos. Reutilizado por el formulario, revisión y paneles.
// ============================================================================
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/backend-client";
import { minutosEntreHoras } from "@/lib/cuadro-turno-utils";

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------
export interface ShiftTypeRow {
  code: string;
  name: string;
  start_time: string | null;
  end_time: string | null;
  hours: number;
  active: boolean;
}

export interface TurnoInfo {
  code: string;
  name: string;
  start: string | null;
  end: string | null;
  hours: number;
  /** "07:00 A. M. – 01:00 P. M." (o "—" si no hay horario) */
  horario: string;
  /** "MAÑANA · 07:00 A. M. – 01:00 P. M. · 7 h" */
  label: string;
}

export interface ReturnFragment {
  id?: string;
  request_id?: string;
  fragment_no: number;
  return_date: string | null;
  receiver_id: string | null;
  receiver_name: string | null;
  receiver_role: string | null;
  shift_code: string | null;
  start_time: string | null;
  end_time: string | null;
  minutes: number;
  notes: string | null;
  verification_result?: string;
  verified_minutes?: number;
  verified_by?: string | null;
  verified_by_name?: string | null;
  verified_at?: string | null;
  verification_notes?: string | null;
}

// ---------------------------------------------------------------------------
// Catálogo real de turnos (Configuración → shift_types)
// ---------------------------------------------------------------------------
export function useShiftTypes() {
  return useQuery({
    queryKey: ["shift-types-catalogo"],
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<Record<string, ShiftTypeRow>> => {
      const { data } = await supabase
        .from("shift_types")
        .select("code, name, start_time, end_time, hours, active")
        .order("sort_order");
      const map: Record<string, ShiftTypeRow> = {};
      (data ?? []).forEach((r) => {
        map[r.code] = r as ShiftTypeRow;
      });
      return map;
    },
  });
}

// ---------------------------------------------------------------------------
// Formato de horas 12 h institucional ("07:00 A. M.")
// ---------------------------------------------------------------------------
export function formatHora12(t: string | null | undefined): string {
  if (!t) return "";
  const [hStr, mStr] = t.split(":");
  let h = Number(hStr);
  const m = mStr ?? "00";
  const suf = h < 12 ? "A. M." : "P. M.";
  if (h === 0) h = 12;
  else if (h > 12) h -= 12;
  return `${String(h).padStart(2, "0")}:${m} ${suf}`;
}

/** Descripción completa de un código de turno usando el catálogo real. */
export function describeTurno(
  code: string | null | undefined,
  map: Record<string, ShiftTypeRow> | undefined,
): TurnoInfo | null {
  if (!code) return null;
  const st = map?.[code];
  const name = st?.name?.toUpperCase() || code;
  const start = st?.start_time ?? null;
  const end = st?.end_time ?? null;
  const hours = st?.hours ?? 0;
  const horario = start && end ? `${formatHora12(start)} – ${formatHora12(end)}` : "—";
  const partes = [name];
  if (horario !== "—") partes.push(horario);
  if (hours) partes.push(`${hours} h`);
  return { code, name, start, end, hours, horario, label: partes.join(" · ") };
}

// ---------------------------------------------------------------------------
// Consulta del turno programado de un funcionario en una fecha
// ---------------------------------------------------------------------------
export interface TurnoProgramado {
  shift_code: string | null;
  hours: number;
  unidad_funcional: string | null;
}

export async function buscarTurnoProgramado(params: {
  userId?: string | null;
  fullName?: string | null;
  fecha: string;
}): Promise<TurnoProgramado | null> {
  const { userId, fullName, fecha } = params;
  if (!fecha) return null;
  let query = supabase
    .from("shift_schedule_days")
    .select("shift_code, hours, unidad_funcional, shift_schedule_members!inner(user_id, full_name)")
    .eq("shift_date", fecha)
    .limit(1);
  if (userId) query = query.eq("shift_schedule_members.user_id", userId);
  else if (fullName) query = query.eq("shift_schedule_members.full_name", fullName);
  else return null;
  const { data } = await query.maybeSingle();
  if (!data) return null;
  const d = data as {
    shift_code: string | null;
    hours: number | null;
    unidad_funcional: string | null;
  };
  return {
    shift_code: d.shift_code,
    hours: Number(d.hours) || 0,
    unidad_funcional: d.unidad_funcional,
  };
}

// ---------------------------------------------------------------------------
// Cálculo de horas / minutos
// ---------------------------------------------------------------------------
export function minutosFraccion(f: Pick<ReturnFragment, "start_time" | "end_time">): number {
  return minutosEntreHoras(f.start_time, f.end_time);
}

export function totalMinutosFracciones(fracs: ReturnFragment[]): number {
  return fracs.reduce((acc, f) => acc + (Number(f.minutes) || minutosFraccion(f)), 0);
}

export function minutosAHoras(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (m === 0) return `${h} h`;
  return `${h} h ${m} min`;
}

// ---------------------------------------------------------------------------
// Motivos exentos del límite mensual (requieren soporte obligatorio)
// ---------------------------------------------------------------------------
export const MOTIVOS_EXENTOS = ["Cita médica", "Calamidad"] as const;

export function esExento(motivo: string | null | undefined): boolean {
  return !!motivo && (MOTIVOS_EXENTOS as readonly string[]).includes(motivo);
}

export const LIMITE_MENSUAL = 3;

// ---------------------------------------------------------------------------
// Consumo mensual (solicitudes propias + coberturas)
// ---------------------------------------------------------------------------
export interface UsoMensual {
  solicitudes: number; // solicitudes propias que consumen/ reservan cupo
  coberturas: number; // veces que cubre a otro (reemplazo)
  pendientes: number; // en estado PENDIENTE (reserva provisional)
  aprobadas: number;
  exentos: number; // cita médica / calamidad (no suman)
  total: number; // solicitudes + coberturas (sin exentos)
  disponible: number;
}

interface MinReq {
  requester_id: string;
  replacement_user_id?: string | null;
  status: string;
  reason_type?: string | null;
  is_limit_exempt?: boolean | null;
  request_type?: string | null;
  start_date?: string | null;
  original_shift_date?: string | null;
  created_at?: string;
}

/** Estados que reservan/consumen cupo. NEGADA/RECHAZADA/CANCELADA liberan. */
const ESTADOS_CUENTAN = new Set(["PENDIENTE", "DEVUELTA PARA AJUSTE", "APROBADA", "EJECUTADA"]);

function mesDeSolicitud(r: MinReq): { y: number; m: number } | null {
  const iso = r.request_type === "cambio_turno" ? r.original_shift_date : r.start_date;
  const base = iso || (r.created_at ? r.created_at.slice(0, 10) : null);
  if (!base) return null;
  const [y, m] = base.split("-").map(Number);
  return { y, m };
}

export function calcularUsoMensual(
  requests: MinReq[],
  userId: string,
  year: number,
  month: number,
): UsoMensual {
  let solicitudes = 0,
    coberturas = 0,
    pendientes = 0,
    aprobadas = 0,
    exentos = 0;
  for (const r of requests) {
    const mm = mesDeSolicitud(r);
    if (!mm || mm.y !== year || mm.m !== month) continue;
    if (!ESTADOS_CUENTAN.has(r.status)) continue;
    const exento = r.is_limit_exempt || esExento(r.reason_type);
    const esPendiente = r.status === "PENDIENTE" || r.status === "DEVUELTA PARA AJUSTE";
    // Solicitud propia
    if (r.requester_id === userId) {
      if (exento) {
        exentos++;
        continue;
      }
      solicitudes++;
      if (esPendiente) pendientes++;
      else aprobadas++;
    } else if (r.replacement_user_id === userId) {
      // Cobertura: cuenta al reemplazo (los exentos también generan cobertura real,
      // pero el conteo de límite excluye exentos del solicitante; la cobertura sí suma).
      coberturas++;
      if (esPendiente) pendientes++;
      else aprobadas++;
    }
  }
  const total = solicitudes + coberturas;
  return {
    solicitudes,
    coberturas,
    pendientes,
    aprobadas,
    exentos,
    total,
    disponible: Math.max(0, LIMITE_MENSUAL - total),
  };
}

export function semaforoUso(total: number, tieneExcepcion: boolean): string {
  if (tieneExcepcion) return "bg-sky-100 text-sky-700 border-sky-200"; // AZUL
  if (total >= LIMITE_MENSUAL) return "bg-rose-100 text-rose-700 border-rose-200"; // ROJO
  if (total === 2) return "bg-amber-100 text-amber-700 border-amber-200"; // AMARILLO
  return "bg-emerald-100 text-emerald-700 border-emerald-200"; // VERDE
}
