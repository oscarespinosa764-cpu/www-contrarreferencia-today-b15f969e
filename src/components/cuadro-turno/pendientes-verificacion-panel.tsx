import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/backend-client";
import { useAuth } from "@/lib/auth";
import { registrarAuditoria } from "@/lib/auditoria.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { fmtFecha } from "@/lib/cuadro-turno-utils";
import { minutosAHoras, formatHora12 } from "@/lib/solicitudes-utils";
import { CheckCircle2, ClipboardCheck } from "lucide-react";

interface FragRow {
  id: string;
  request_id: string;
  fragment_no: number;
  return_date: string | null;
  receiver_name: string | null;
  shift_code: string | null;
  start_time: string | null;
  end_time: string | null;
  minutes: number;
  verification_result: string;
  shift_requests: {
    requester_name: string | null;
    requester_id: string;
    requester_identification: string | null;
    requester_role: string | null;
    requested_minutes: number | null;
    reason_type: string | null;
    other_reason: string | null;
  } | null;
}

export function PendientesVerificacionPanel() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [sel, setSel] = useState<FragRow | null>(null);

  const { data: pend = [], isLoading } = useQuery({
    queryKey: ["frag-pendientes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shift_return_fragments")
        .select(
          "id, request_id, fragment_no, return_date, receiver_name, shift_code, start_time, end_time, minutes, verification_result, shift_requests(requester_name, requester_id, requester_identification, requester_role, requested_minutes, reason_type, other_reason)",
        )
        .eq("verification_result", "PENDIENTE")
        .order("return_date", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as FragRow[];
    },
  });

  const hoy = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Devoluciones de tiempo programadas pendientes de verificar. Cada fracción se verifica de
        forma independiente.
      </p>
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Cargando…</p>
      ) : pend.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No hay devoluciones pendientes de verificación.
        </p>
      ) : (
        <div className="space-y-2">
          {pend.map((f) => {
            const vencida = f.return_date && f.return_date <= hoy;
            return (
              <Card key={f.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${vencida ? "border-rose-200 bg-rose-100 text-rose-700" : "border-sky-200 bg-sky-100 text-sky-700"}`}
                    >
                      {vencida ? "PENDIENTE (vencida)" : "PENDIENTE"}
                    </span>
                    <span className="text-sm font-medium">
                      {f.shift_requests?.requester_name || "—"}
                    </span>
                    <span className="text-xs text-muted-foreground">Fracción {f.fragment_no}</span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Devuelve a {f.receiver_name || "—"} · {fmtFecha(f.return_date)}
                    {f.start_time && f.end_time
                      ? ` · ${formatHora12(f.start_time)} – ${formatHora12(f.end_time)}`
                      : ""}
                    {" · "}
                    {minutosAHoras(f.minutes || 0)}
                  </p>
                </div>
                <Button size="sm" variant="outline" onClick={() => setSel(f)}>
                  <ClipboardCheck className="mr-1.5 h-4 w-4" /> Verificar
                </Button>
              </Card>
            );
          })}
        </div>
      )}

      {sel && user && (
        <VerificarDialog
          frag={sel}
          adminId={user.id}
          onClose={() => setSel(null)}
          onDone={() => {
            setSel(null);
            qc.invalidateQueries({ queryKey: ["frag-pendientes"] });
            qc.invalidateQueries({ queryKey: ["shift-requests"] });
            qc.invalidateQueries({ queryKey: ["absenteeism"] });
          }}
        />
      )}
    </div>
  );
}

function VerificarDialog({
  frag,
  adminId,
  onClose,
  onDone,
}: {
  frag: FragRow;
  adminId: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [result, setResult] = useState<"CUMPLIDA" | "PARCIAL" | "NO_CUMPLIDA">("CUMPLIDA");
  const [horasCumplidasMin, setHorasCumplidasMin] = useState<number>(frag.minutes || 0);
  const [notas, setNotas] = useState("");
  const [saving, setSaving] = useState(false);

  const { data: adminName } = useQuery({
    queryKey: ["profile-name", adminId],
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("nombre")
        .eq("user_id", adminId)
        .maybeSingle();
      return data?.nombre || "";
    },
  });

  const verificar = async () => {
    setSaving(true);
    try {
      const verified =
        result === "CUMPLIDA" ? frag.minutes || 0 : result === "PARCIAL" ? horasCumplidasMin : 0;
      const nowIso = new Date().toISOString();

      // 1) Actualizar la fracción
      const { error: fErr } = await supabase
        .from("shift_return_fragments")
        .update({
          verification_result: result,
          verified_minutes: verified,
          verified_by: adminId,
          verified_by_name: adminName || null,
          verified_at: nowIso,
          verification_notes: notas || null,
        })
        .eq("id", frag.id);
      if (fErr) throw fErr;

      // 2) Bitácora institucional de recuperación (horarios reales)
      await supabase.from("shift_request_recovery_logs").insert({
        request_id: frag.request_id,
        recovery_date: frag.return_date,
        start_time: frag.start_time,
        end_time: frag.end_time,
        verified_by: adminName || "Coordinación",
        observation: `${result}${notas ? " · " + notas : ""}`,
      });

      // 3) Recalcular saldo del request
      const { data: allFrags } = await supabase
        .from("shift_return_fragments")
        .select("minutes, verified_minutes, verification_result")
        .eq("request_id", frag.request_id);
      const requestedMin = frag.shift_requests?.requested_minutes || 0;
      const returned = (allFrags ?? []).reduce((a, f) => a + (f.verified_minutes || 0), 0);
      const todasResueltas = (allFrags ?? []).every((f) => f.verification_result !== "PENDIENTE");
      let recovery_status = "PENDIENTE_VERIFICACION";
      if (todasResueltas) {
        if (returned <= 0) recovery_status = "NO_RECUPERADO";
        else if (requestedMin && returned >= requestedMin) recovery_status = "RECUPERADO";
        else recovery_status = "PARCIAL";
      } else if (returned > 0) {
        recovery_status = "PARCIAL";
      }
      const pending = Math.max(0, requestedMin - returned);
      await supabase
        .from("shift_requests")
        .update({
          returned_minutes: returned,
          pending_minutes: pending,
          recovery_status,
        })
        .eq("id", frag.request_id);

      // 4) Alimentar Control de Ausentismo (sin duplicar)
      const req = frag.shift_requests;
      if (req) {
        const estadoAus =
          recovery_status === "RECUPERADO"
            ? "recuperado"
            : recovery_status === "PARCIAL"
              ? "recuperacion_parcial"
              : recovery_status === "NO_RECUPERADO"
                ? "no_recuperado"
                : "pendiente_verificacion";
        const { data: exists } = await supabase
          .from("shift_absenteeism_records")
          .select("id")
          .eq("request_id", frag.request_id)
          .maybeSingle();
        const payload = {
          request_id: frag.request_id,
          user_id: req.requester_id,
          identification_number: req.requester_identification,
          worker_name: req.requester_name,
          role_name: req.requester_role,
          minutes_number: requestedMin,
          reason: req.reason_type === "Otro" ? req.other_reason : req.reason_type,
          origin: "solicitud_aprobada",
          status: estadoAus,
          additional_details: `Recuperadas ${minutosAHoras(returned)} de ${minutosAHoras(requestedMin)} · Saldo ${minutosAHoras(pending)}`,
          updated_by: adminId,
        };
        if (exists?.id)
          await supabase.from("shift_absenteeism_records").update(payload).eq("id", exists.id);
        else
          await supabase
            .from("shift_absenteeism_records")
            .insert({ ...payload, created_by: adminId });
      }

      // 5) Alerta administrativa si no se cumplió
      if (result === "NO_CUMPLIDA") {
        await supabase
          .from("avisos")
          .insert({
            mensaje: `DEVOLUCIÓN NO CUMPLIDA — ${req?.requester_name || "Funcionario"} no devolvió ${minutosAHoras(frag.minutes || 0)} programadas el ${fmtFecha(frag.return_date)}. Reprogramar recuperación.`,
            estado: "ACTIVO",
            prioridad: "CRITICO",
            modulo: "TURNO",
            archivado: false,
            created_by: adminId,
          })
          .then(
            () => {},
            () => {},
          );
      }

      registrarAuditoria({
        data: {
          accion: "DEVOLUCION_VERIFICADA",
          modulo: "cuadro_turno",
          tabla: "shift_return_fragments",
          registroId: frag.id,
          resultado: "exito",
          detalles: { result },
        },
      }).catch(() => {});
      toast.success("Verificación registrada.");
      onDone();
    } catch (e) {
      console.error(e);
      toast.error("No se pudo registrar la verificación.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Verificar devolución de tiempo</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <div className="rounded-md bg-muted/50 p-3 text-xs">
            <p>
              <strong>{frag.shift_requests?.requester_name}</strong> debía devolver{" "}
              {minutosAHoras(frag.minutes || 0)} a {frag.receiver_name} el{" "}
              {fmtFecha(frag.return_date)}
              {frag.start_time && frag.end_time
                ? `, entre ${formatHora12(frag.start_time)} y ${formatHora12(frag.end_time)}`
                : ""}
              .
            </p>
          </div>
          <div>
            <Label className="text-xs">Resultado</Label>
            <div className="mt-1 flex flex-wrap gap-2">
              {(["CUMPLIDA", "PARCIAL", "NO_CUMPLIDA"] as const).map((r) => (
                <Button
                  key={r}
                  type="button"
                  size="sm"
                  variant={result === r ? "default" : "outline"}
                  onClick={() => setResult(r)}
                >
                  {r === "CUMPLIDA" ? "Cumplida" : r === "PARCIAL" ? "Parcial" : "No cumplida"}
                </Button>
              ))}
            </div>
          </div>
          {result === "PARCIAL" && (
            <div>
              <Label className="text-xs">Horas efectivamente cumplidas (minutos)</Label>
              <input
                type="number"
                min={0}
                max={frag.minutes || 0}
                className="mt-1 h-9 w-full rounded-md border px-2 text-sm"
                value={horasCumplidasMin}
                onChange={(e) => setHorasCumplidasMin(Number(e.target.value))}
              />
              <p className="mt-1 text-[11px] text-muted-foreground">
                {minutosAHoras(horasCumplidasMin || 0)} de {minutosAHoras(frag.minutes || 0)}. El
                saldo puede reprogramarse en una nueva fracción.
              </p>
            </div>
          )}
          <div>
            <Label className="text-xs">Observaciones</Label>
            <Textarea value={notas} onChange={(e) => setNotas(e.target.value)} rows={2} />
          </div>
          <p className="text-[11px] text-muted-foreground">
            Verificado por: {adminName || "—"} · {new Date().toLocaleString("es-CO")}
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={verificar} disabled={saving}>
            <CheckCircle2 className="mr-1.5 h-4 w-4" />{" "}
            {saving ? "Guardando…" : "Registrar verificación"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
