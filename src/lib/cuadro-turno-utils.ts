// ============================================================================
// Cuadro de Turno — utilidades, tipos y constantes (Fase 1).
// Lógica de presentación y cálculo de horas. No contiene secretos.
// ============================================================================

export const MESES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
] as const;

export const MESES_ABBR = [
  "ENE",
  "FEB",
  "MAR",
  "ABR",
  "MAY",
  "JUN",
  "JUL",
  "AGO",
  "SEP",
  "OCT",
  "NOV",
  "DIC",
] as const;

/** Iniciales de días de la semana (Lun=0 estilo institucional usa L M X J V S D). */
export const DOW_LETRA = ["D", "L", "M", "X", "J", "V", "S"] as const; // index = getDay()

export function diasDelMes(year: number, month: number): number {
  return new Date(year, month, 0).getDate(); // month 1-12
}

export function letraDiaSemana(year: number, month: number, day: number): string {
  const d = new Date(year, month - 1, day).getDay();
  return DOW_LETRA[d];
}

export function fechaISO(year: number, month: number, day: number): string {
  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${year}-${mm}-${dd}`;
}

/**
 * Devuelve los números de día del mes que coinciden con la frecuencia dada.
 * `weekdays` usa el índice de getDay() (0=Dom … 6=Sáb). Si está vacío o `todos`
 * es true, incluye todos los días dentro del rango [desde, hasta].
 */
export function diasSegunFrecuencia(
  year: number,
  month: number,
  opts: { desde: number; hasta: number; todos: boolean; weekdays: number[] },
): number[] {
  const total = diasDelMes(year, month);
  const desde = Math.max(1, Math.min(opts.desde || 1, total));
  const hasta = Math.min(total, Math.max(opts.hasta || total, desde));
  const set = new Set(opts.weekdays);
  const out: number[] = [];
  for (let d = desde; d <= hasta; d++) {
    if (opts.todos || set.size === 0) {
      out.push(d);
      continue;
    }
    const dow = new Date(year, month - 1, d).getDay();
    if (set.has(dow)) out.push(d);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------
export interface ShiftType {
  id: string;
  code: string;
  name: string;
  start_time: string | null;
  end_time: string | null;
  hours: number;
  color: string;
  active: boolean;
  observation: string | null;
}

export interface ShiftSchedule {
  id: string;
  year: number;
  month: number;
  dependency: string;
  base_hours: number;
  status: string;
  notes: string | null;
  elaborated_by: string | null;
  approved_by_name: string | null;
  created_at: string;
}

export interface ShiftMember {
  id: string;
  schedule_id: string;
  user_id: string | null;
  full_name: string;
  identification_number: string | null;
  role_name: string | null;
  sede: string | null;
  active: boolean;
  base_hours: number | null;
  pending_hours: number;
  notes: string | null;
  sort_order: number;
}

export interface ShiftDay {
  id: string;
  schedule_id: string;
  member_id: string;
  day_number: number;
  shift_date: string | null;
  shift_code: string | null;
  hours: number;
  notes: string | null;
  origin: string;
}

export interface ShiftRequest {
  id: string;
  request_type: string;
  requester_id: string;
  requester_name: string | null;
  requester_identification: string | null;
  requester_role: string | null;
  requester_sede: string | null;
  status: string;
  reason_type: string | null;
  other_reason: string | null;
  start_date: string | null;
  end_date: string | null;
  start_time: string | null;
  end_time: string | null;
  will_recover_time: boolean;
  requires_replacement: boolean;
  replacement_name: string | null;
  replacement_role: string | null;
  paid: boolean | null;
  original_shift_date: string | null;
  original_shift_code: string | null;
  requested_shift_date: string | null;
  requested_shift_code: string | null;
  swap_partner_name: string | null;
  reason_detail: string | null;
  observations: string | null;
  requester_signature_hash: string | null;
  requester_signature_id: string | null;
  register_absenteeism: boolean;
  reason_recoverable?: boolean | null;
  return_person_id?: string | null;
  return_person_name?: string | null;
  return_person_role?: string | null;
  return_date?: string | null;
  return_shift_code?: string | null;
  // Solicitudes y Ausentismo (ampliación aditiva)
  original_shift_name?: string | null;
  original_start_time?: string | null;
  original_end_time?: string | null;
  requested_minutes?: number | null;
  returned_minutes?: number | null;
  pending_minutes?: number | null;
  recovery_status?: string | null;
  return_fractioned?: boolean | null;
  replacement_user_id?: string | null;
  return_receiver_id?: string | null;
  is_limit_exempt?: boolean | null;
  monthly_exception_id?: string | null;
  support_path?: string | null;
  support_metadata?: Record<string, unknown> | null;
  cuadro_applied?: boolean | null;
  approved_by?: string | null;
  approval_observation: string | null;
  rejection_reason: string | null;
  response_observation: string | null;
  approved_at: string | null;
  rejected_at: string | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Motivos de solicitud (TH-FR-09)
// ---------------------------------------------------------------------------
export const MOTIVOS_SOLICITUD = [
  "Cita médica",
  "Estudio",
  "Actividad personal",
  "Actividad laboral",
  "Matrimonio",
  "Calamidad",
  "Cambio de turno",
  "Compensatorio",
  "Licencia",
  "Incapacidad",
  "Llegada tarde",
  "Ausencia",
  "Salida",
  "Otro",
] as const;

export const ESTADOS_SOLICITUD = [
  "PENDIENTE",
  "APROBADA",
  "NEGADA",
  "RECHAZADA",
  "DEVUELTA PARA AJUSTE",
  "CANCELADA",
  "EJECUTADA",
] as const;

export function estadoBadgeClass(estado: string): string {
  switch (estado) {
    case "APROBADA":
    case "EJECUTADA":
      return "bg-emerald-100 text-emerald-700 border-emerald-200";
    case "NEGADA":
    case "RECHAZADA":
      return "bg-rose-100 text-rose-700 border-rose-200";
    case "DEVUELTA PARA AJUSTE":
      return "bg-amber-100 text-amber-700 border-amber-200";
    case "CANCELADA":
      return "bg-slate-100 text-slate-600 border-slate-200";
    default:
      return "bg-sky-100 text-sky-700 border-sky-200";
  }
}

// ---------------------------------------------------------------------------
// Eventos TH-FR-48 (abreviaturas institucionales)
// ---------------------------------------------------------------------------
export const EVENTOS_TH48: { code: string; name: string }[] = [
  { code: "AT", name: "Accidente de trabajo" },
  { code: "EL", name: "Enfermedad laboral" },
  { code: "PTNR", name: "Permiso de trabajo no remunerado" },
  { code: "LM", name: "Licencia de maternidad" },
  { code: "PL", name: "Permiso por luto" },
  { code: "PTR", name: "Permiso de trabajo remunerado" },
  { code: "EG", name: "Enfermedad general" },
  { code: "LP", name: "Licencia de paternidad" },
  { code: "OT", name: "Otros" },
];

export function eventoNombre(code: string | null): string {
  if (!code) return "";
  return EVENTOS_TH48.find((e) => e.code === code)?.name ?? code;
}

/** Motivos que por defecto alimentan el Control de ausentismo TH-FR-48. */
const MOTIVOS_AUSENTISMO = new Set([
  "Cita médica",
  "Estudio",
  "Actividad personal",
  "Matrimonio",
  "Calamidad",
  "Compensatorio",
  "Licencia",
  "Incapacidad",
  "Llegada tarde",
  "Ausencia",
  "Salida",
]);

export function defaultRegistrarAusentismo(motivo: string | null): boolean {
  if (!motivo) return false;
  if (motivo === "Cambio de turno") return false; // opcional
  return MOTIVOS_AUSENTISMO.has(motivo);
}

/** Mapea un motivo TH-FR-09 a un código de evento TH-FR-48 sugerido. */
export function motivoAEvento(motivo: string | null): string {
  switch (motivo) {
    case "Incapacidad":
    case "Cita médica":
      return "EG";
    case "Licencia":
      return "PTR";
    case "Calamidad":
      return "PL";
    case "Ausencia":
      return "PTNR";
    default:
      return "OT";
  }
}

// ---------------------------------------------------------------------------
// Cálculo de horas / minutos
// ---------------------------------------------------------------------------
export function totalHorasMiembro(dias: ShiftDay[]): number {
  return dias.reduce((acc, d) => acc + (Number(d.hours) || 0), 0);
}

export function tiempoExtra(totalHoras: number, baseHoras: number): number {
  return Math.round((totalHoras - baseHoras) * 100) / 100;
}

export function tiempoTotal(extra: number, pendiente: number): number {
  return Math.round((extra + (Number(pendiente) || 0)) * 100) / 100;
}

/** Minutos entre dos horas "HH:MM" o "HH:MM:SS". Soporta cruce de medianoche. */
export function minutosEntreHoras(inicio: string | null, fin: string | null): number {
  if (!inicio || !fin) return 0;
  const toMin = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    return h * 60 + (m || 0);
  };
  let diff = toMin(fin) - toMin(inicio);
  if (diff < 0) diff += 24 * 60;
  return diff;
}

/** Días inclusivos entre dos fechas ISO. */
export function diasEntreFechas(inicio: string | null, fin: string | null): number {
  if (!inicio) return 0;
  if (!fin) return 1;
  const a = new Date(inicio + "T00:00:00");
  const b = new Date(fin + "T00:00:00");
  const ms = b.getTime() - a.getTime();
  if (ms < 0) return 1;
  return Math.floor(ms / 86400000) + 1;
}

export function fmtFecha(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso.length <= 10 ? iso + "T00:00:00" : iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" });
}

export function fmtFechaHora(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("es-CO", { dateStyle: "short", timeStyle: "short" });
}

// ---------------------------------------------------------------------------
// Plantilla editable de solicitud (resumen para coordinación)
// ---------------------------------------------------------------------------
export function resumenSolicitud(r: ShiftRequest): string {
  const motivo = r.reason_type === "Otro" ? r.other_reason || "Otro" : r.reason_type || "—";
  const lineas = [
    `SOLICITUD ${r.request_type === "cambio_turno" ? "DE CAMBIO DE TURNO" : "DE PERMISO / AUSENCIA / SALIDA"}`,
    `Colaborador: ${r.requester_name || "—"}${r.requester_identification ? ` (CC ${r.requester_identification})` : ""}`,
    `Cargo: ${r.requester_role || "—"}`,
    `Motivo: ${motivo}`,
  ];
  if (r.request_type === "cambio_turno") {
    lineas.push(
      `Turno original: ${r.original_shift_code || "—"} (${fmtFecha(r.original_shift_date)})`,
    );
    lineas.push(
      `Turno solicitado: ${r.requested_shift_code || "—"} (${fmtFecha(r.requested_shift_date)})`,
    );
    if (r.swap_partner_name) lineas.push(`Cambia con: ${r.swap_partner_name}`);
  } else {
    lineas.push(`Desde: ${fmtFecha(r.start_date)}${r.start_time ? " " + r.start_time : ""}`);
    lineas.push(`Hasta: ${fmtFecha(r.end_date)}${r.end_time ? " " + r.end_time : ""}`);
  }
  lineas.push(
    `Requiere reemplazo: ${r.requires_replacement ? "Sí" : "No"}${r.replacement_name ? ` (${r.replacement_name})` : ""}`,
  );
  lineas.push(`Recupera tiempo: ${r.will_recover_time ? "Sí" : "No"}`);
  if (r.reason_detail) lineas.push(`Detalle: ${r.reason_detail}`);
  return lineas.join("\n");
}
