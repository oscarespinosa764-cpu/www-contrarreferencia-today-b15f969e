// ============================================================================
// Aplicación efectiva de la cobertura en el Cuadro de Turno al APROBAR.
// No borra la programación original: registra la cobertura como nota/origen
// sobre los días existentes (best-effort). Reutiliza shift_schedule_days.
//
// FASE 9 · BLOQUE C.1.2 (D3): la localización de la fila usa EXCLUSIVAMENTE el
// resolver canónico (resolverTurnoProgramadoSeguro), acotado por schedule y
// miembro. Se elimina la búsqueda global por full_name con limit(1).
// DEUDA CONOCIDA (BLOQUE C.2): esta aplicación sigue siendo best-effort desde
// el cliente y no es transaccional; la atomicidad de aprobación se resuelve allí.
// ============================================================================
import { supabase } from "@/lib/backend-client";
import type { ShiftRequest } from "@/lib/cuadro-turno-utils";
import { resolverTurnoProgramadoSeguro } from "@/lib/cuadro-identidad.functions";
import type { ResolverEstado } from "@/lib/identidad-turnos";

interface DayMatch {
  id: string;
  shift_code: string | null;
  notes: string | null;
}

/** Estados en los que NO se autoriza ninguna escritura (fail-closed). */
const ESTADOS_FAIL_CLOSED: ResolverEstado[] = [
  "IDENTIDAD_AMBIGUA",
  "MIEMBRO_NO_VINCULADO",
  "SCHEDULE_AMBIGUO",
  "SCHEDULE_NO_ENCONTRADO",
  "PROGRAMACION_INCONSISTENTE",
  "CODIGO_DESCONOCIDO",
  "USUARIO_INACTIVO",
  "SIN_PERMISO",
];

/**
 * Localiza la fila real del día mediante el resolver canónico.
 * Devuelve null cuando no hay fila o cuando el estado es fail-closed
 * (nunca selecciona una fila alternativa).
 */
async function buscarDia(params: {
  userId?: string | null;
  fullName?: string | null;
  fecha: string;
}): Promise<DayMatch | null> {
  const { userId, fullName, fecha } = params;
  if (!userId && !fullName) return null;
  const turno = await resolverTurnoProgramadoSeguro({
    data: {
      fecha,
      targetUserId: userId ?? null,
      fallbackName: fullName ?? null,
    },
  });
  if (ESTADOS_FAIL_CLOSED.includes(turno.estado)) return null;
  if (!turno.dayId) return null; // SIN_TURNO sin fila real
  return { id: turno.dayId, shift_code: turno.shiftCode, notes: turno.notes };
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
