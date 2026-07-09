// ============================================================================
// Aplicación efectiva de la cobertura en el Cuadro de Turno al APROBAR.
// No borra la programación original: registra la cobertura como nota/origen
// sobre los días existentes (best-effort). Reutiliza shift_schedule_days.
// ============================================================================
import { supabase } from "@/lib/backend-client";
import type { ShiftRequest } from "@/lib/cuadro-turno-utils";

interface DayMatch {
  id: string;
  shift_code: string | null;
  notes: string | null;
}

async function buscarDia(params: {
  userId?: string | null;
  fullName?: string | null;
  fecha: string;
}): Promise<DayMatch | null> {
  const { userId, fullName, fecha } = params;
  let q = supabase
    .from("shift_schedule_days")
    .select("id, shift_code, notes, shift_schedule_members!inner(user_id, full_name)")
    .eq("shift_date", fecha)
    .limit(1);
  if (userId) q = q.eq("shift_schedule_members.user_id", userId);
  else if (fullName) q = q.eq("shift_schedule_members.full_name", fullName);
  else return null;
  const { data } = await q.maybeSingle();
  if (!data) return null;
  const d = data as unknown as DayMatch;
  return { id: d.id, shift_code: d.shift_code, notes: d.notes };
}

/**
 * Marca la cobertura en el cuadro conservando el turno original.
 * - Día original del solicitante: nota "CUBRE: <reemplazo>".
 * - No cambia el shift_code (se conserva la programación original).
 * Devuelve true si aplicó al menos una anotación.
 */
export async function aplicarCoberturaCuadro(r: ShiftRequest, adminId: string): Promise<boolean> {
  let aplicado = false;
  try {
    // Fecha original del solicitante (permiso) o del cambio de turno.
    const fechaOriginal = r.original_shift_date || r.start_date;
    if (fechaOriginal && r.requires_replacement && r.replacement_name) {
      const dia = await buscarDia({
        userId: r.requester_id,
        fullName: r.requester_name,
        fecha: fechaOriginal,
      });
      if (dia) {
        const nota = `CUBRE: ${r.replacement_name}`.slice(0, 200);
        const notes =
          dia.notes && dia.notes.includes(nota)
            ? dia.notes
            : [dia.notes, nota].filter(Boolean).join(" · ");
        await supabase
          .from("shift_schedule_days")
          .update({ notes, origin: "cobertura_solicitud", changed_by: adminId })
          .eq("id", dia.id);
        aplicado = true;
      }
    }
  } catch (e) {
    console.error("aplicarCoberturaCuadro", e);
  }
  return aplicado;
}

/** Revierte la anotación de cobertura (al anular una solicitud aprobada). */
export async function revertirCoberturaCuadro(r: ShiftRequest): Promise<void> {
  try {
    const fechaOriginal = r.original_shift_date || r.start_date;
    if (!fechaOriginal || !r.replacement_name) return;
    const dia = await buscarDia({
      userId: r.requester_id,
      fullName: r.requester_name,
      fecha: fechaOriginal,
    });
    if (!dia?.notes) return;
    const nota = `CUBRE: ${r.replacement_name}`;
    const notes =
      dia.notes
        .split(" · ")
        .filter((n) => n.trim() !== nota)
        .join(" · ") || null;
    await supabase.from("shift_schedule_days").update({ notes }).eq("id", dia.id);
  } catch (e) {
    console.error("revertirCoberturaCuadro", e);
  }
}

/** Crea la alerta de verificación de devolución reutilizando el motor de avisos. */
export async function crearAlertaVerificacion(params: {
  requesterName: string | null;
  receiverName: string | null;
  fecha: string | null;
  horaInicial: string | null;
  horaFinal: string | null;
  minutos: number;
  createdBy: string;
}): Promise<void> {
  const { requesterName, receiverName, fecha, horaInicial, horaFinal, minutos, createdBy } = params;
  const horas = Math.round((minutos / 60) * 10) / 10;
  const mensaje = `VERIFICAR DEVOLUCIÓN DE TIEMPO — ${requesterName || "Funcionario"} debía devolver ${horas} h a ${receiverName || "receptor"} el ${fecha || "—"}${horaInicial && horaFinal ? `, entre ${horaInicial} y ${horaFinal}` : ""}.`;
  try {
    await supabase.from("avisos").insert({
      mensaje,
      estado: "ACTIVO",
      prioridad: "ALTO",
      modulo: "TURNO",
      fecha_inicio: fecha ? `${fecha}T00:00:00` : new Date().toISOString(),
      archivado: false,
      created_by: createdBy,
    });
  } catch (e) {
    console.error("crearAlertaVerificacion", e);
  }
}
