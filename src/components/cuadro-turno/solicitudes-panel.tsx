import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/backend-client";
import { useAuth } from "@/lib/auth";
import { registrarAuditoria } from "@/lib/auditoria.functions";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import {
  estadoBadgeClass,
  fmtFecha,
  fmtFechaHora,
  resumenSolicitud,
  defaultRegistrarAusentismo,
  motivoAEvento,
  eventoNombre,
  minutosEntreHoras,
  diasEntreFechas,
  ESTADOS_SOLICITUD,
  type ShiftRequest,
} from "@/lib/cuadro-turno-utils";
import { generarSolicitudPDF } from "@/lib/solicitud-pdf";
import { getFirmaDataUrlById, getFirmaDataUrlByUser } from "@/lib/firmas-utils";
import { aplicarCoberturaCuadro, crearAlertaVerificacion } from "@/lib/cuadro-aplicar";
import { getSoporteSignedUrl } from "@/lib/soportes-utils";
import { minutosAHoras } from "@/lib/solicitudes-utils";
import { FileDown, Paperclip } from "lucide-react";

/** Estados canónicos que representan una solicitud aún sin decisión. */
export const ESTADOS_PENDIENTES = ["PENDIENTE", "DEVUELTA PARA AJUSTE"] as const;
export function isSolicitudPendiente(r: { status?: string | null }) {
  return (ESTADOS_PENDIENTES as readonly string[]).includes((r.status ?? "").trim().toUpperCase());
}

export function SolicitudesPanel({ soloPendientes = false }: { soloPendientes?: boolean }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [filtroEstado, setFiltroEstado] = useState<string>("TODAS");
  const [sel, setSel] = useState<ShiftRequest | null>(null);

  const { data: requests = [] } = useQuery({
    queryKey: ["shift-requests", "todas"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shift_requests")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as ShiftRequest[];
    },
  });

  const filtradas = useMemo(
    () =>
      soloPendientes
        ? requests.filter(isSolicitudPendiente)
        : requests.filter((r) => filtroEstado === "TODAS" || r.status === filtroEstado),
    [requests, filtroEstado, soloPendientes],
  );

  return (
    <div className="space-y-4">
      {soloPendientes ? (
        <p className="text-xs text-muted-foreground">
          {filtradas.length} solicitud(es) pendiente(s) de decisión.
        </p>
      ) : (
        <div className="flex items-center gap-3">
          <Label className="text-xs">Estado</Label>
          <Select value={filtroEstado} onValueChange={setFiltroEstado}>
            <SelectTrigger className="w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="TODAS">Todas</SelectItem>
              {ESTADOS_SOLICITUD.map((e) => (
                <SelectItem key={e} value={e}>
                  {e}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-xs text-muted-foreground">{filtradas.length} solicitud(es)</span>
        </div>
      )}

      {filtradas.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {soloPendientes
            ? "No hay solicitudes pendientes de verificación para los filtros seleccionados."
            : "No hay solicitudes."}
        </p>
      ) : (

        <div className="space-y-2">
          {filtradas.map((r) => (
            <Card key={r.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span
                    className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${estadoBadgeClass(r.status)}`}
                  >
                    {r.status}
                  </span>
                  <span className="text-sm font-medium">{r.requester_name || "—"}</span>
                  <span className="text-xs text-muted-foreground">{r.requester_role || ""}</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {r.request_type === "cambio_turno"
                    ? "Cambio de turno"
                    : r.reason_type === "Otro"
                      ? r.other_reason
                      : r.reason_type}
                  {" · "}
                  {r.request_type === "cambio_turno"
                    ? `${fmtFecha(r.original_shift_date)} → ${fmtFecha(r.requested_shift_date)}`
                    : `${fmtFecha(r.start_date)} – ${fmtFecha(r.end_date)}`}
                  {r.requires_replacement ? " · Reemplazo: " + (r.replacement_name || "Sí") : ""}
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={() => setSel(r)}>
                Revisar
              </Button>
            </Card>
          ))}
        </div>
      )}

      {sel && (
        <RevisionDialog
          request={sel}
          adminId={user!.id}
          onClose={() => setSel(null)}
          onDone={() => {
            setSel(null);
            qc.invalidateQueries({ queryKey: ["shift-requests"] });
            qc.invalidateQueries({ queryKey: ["absenteeism"] });
            qc.invalidateQueries({ queryKey: ["audit-aprobados"] });
            qc.invalidateQueries({ queryKey: ["historial-cambios"] });
            qc.invalidateQueries({ queryKey: ["frag-pendientes"] });
            qc.invalidateQueries({ queryKey: ["control-mensual"] });
            qc.invalidateQueries({ queryKey: ["cuadro-mensual"] });
          }}

        />
      )}
    </div>
  );
}

function RevisionDialog({
  request,
  adminId,
  onClose,
  onDone,
}: {
  request: ShiftRequest;
  adminId: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [modo, setModo] = useState<"ver" | "aprobar" | "negar" | "devolver">("ver");
  const [obs, setObs] = useState("");
  const [razon, setRazon] = useState("");
  const [registrarAus, setRegistrarAus] = useState(defaultRegistrarAusentismo(request.reason_type));
  const [saving, setSaving] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const pendiente = request.status === "PENDIENTE" || request.status === "DEVUELTA PARA AJUSTE";

  const descargarPDF = async () => {
    setPdfBusy(true);
    try {
      const firmaDataUrl = request.requester_signature_id
        ? await getFirmaDataUrlById(request.requester_signature_id)
        : null;
      // Firma del jefe inmediato (aprobador) cuando la solicitud está aprobada.
      let jefeFirmaDataUrl: string | null = null;
      let jefeNombre = "";
      if (request.status === "APROBADA" && request.approved_by) {
        jefeFirmaDataUrl = await getFirmaDataUrlByUser(request.approved_by);
        const { data: perf } = await supabase
          .from("profiles")
          .select("nombre")
          .eq("user_id", request.approved_by)
          .maybeSingle();
        jefeNombre = perf?.nombre || "";
      }
      await generarSolicitudPDF(request, { firmaDataUrl, jefeFirmaDataUrl, usuario: jefeNombre });
      registrarAuditoria({
        data: {
          accion: "SOLICITUD_PDF",
          modulo: "cuadro_turno",
          tabla: "shift_requests",
          registroId: request.id,
          resultado: "exito",
        },
      }).catch(() => {});
    } catch (e) {
      console.error(e);
      toast.error("No se pudo generar el PDF.");
    } finally {
      setPdfBusy(false);
    }
  };

  // FASE 9 · BLOQUE C.2 — la decisión es server-authoritative y transaccional:
  // estado, aplicación en el Cuadro, ausentismo, avisos y auditoría ocurren en
  // una sola transacción. El frontend no escribe estos efectos.
  const decidir = async (
    decision: "APROBAR" | "NEGAR" | "DEVOLVER_PARA_AJUSTE",
    observacion: string,
  ) => {
    if (saving) return;
    setSaving(true);
    try {
      const res = await decidirSolicitud({
        data: {
          requestId: request.id,
          decision,
          observacion: observacion || null,
          registrarAusentismo: decision === "APROBAR" ? registrarAus : null,
        },
      });
      if (!res.ok) {
        toast.error(res.error ?? "No fue posible procesar la solicitud.");
        if (res.code === "DOBLE_DECISION" || res.code === "PROGRAMACION_CAMBIADA") onDone();
        return;
      }
      toast.success(
        decision === "APROBAR"
          ? "Solicitud aprobada y aplicada en el Cuadro de Turno."
          : decision === "NEGAR"
            ? "Solicitud negada."
            : "Solicitud devuelta para ajuste.",
      );
      onDone();
    } catch (e) {
      console.error(e);
      toast.error("No fue posible procesar la solicitud.");
    } finally {
      setSaving(false);
    }
  };

  const aprobar = () => decidir("APROBAR", obs);



  const responder = async (nuevoEstado: "NEGADA" | "DEVUELTA PARA AJUSTE") => {
    if (!razon.trim()) return toast.error("La razón es obligatoria.");
    setSaving(true);
    try {
      const { data: upd, error } = await supabase
        .from("shift_requests")
        .update({
          status: nuevoEstado,
          rejected_by: adminId,
          rejected_at: new Date().toISOString(),
          rejection_reason: razon.trim().slice(0, 1000),
          response_observation: obs || null,
        })
        .eq("id", request.id)
        .eq("status", request.status)
        .select("id");
      if (error) throw error;
      if (!upd || upd.length === 0) {
        toast.error("La solicitud ya fue decidida por otro usuario. Actualiza la lista.");
        onDone();
        return;
      }

      await supabase.from("shift_request_audit").insert({
        request_id: request.id,
        action: nuevoEstado === "NEGADA" ? "NEGADA" : "DEVUELTA",
        previous_status: request.status,
        new_status: nuevoEstado,
        user_id: adminId,
        detail: razon,
      });
      registrarAuditoria({
        data: {
          accion: nuevoEstado === "NEGADA" ? "SOLICITUD_NEGADA" : "SOLICITUD_DEVUELTA",
          modulo: "cuadro_turno",
          tabla: "shift_requests",
          registroId: request.id,
          resultado: "exito",
        },
      }).catch(() => {});
      toast.success(
        nuevoEstado === "NEGADA" ? "Solicitud negada." : "Solicitud devuelta para ajuste.",
      );
      onDone();
    } catch (e) {
      console.error(e);
      toast.error("No se pudo procesar.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[92vh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Revisión de solicitud</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          <pre className="whitespace-pre-wrap rounded-md bg-muted/50 p-3 text-xs">
            {resumenSolicitud(request)}
          </pre>
          <p className="text-xs text-muted-foreground">
            Estado actual:{" "}
            <span className={`rounded-full border px-2 py-0.5 ${estadoBadgeClass(request.status)}`}>
              {request.status}
            </span>
            {request.approved_at && ` · Aprobada ${fmtFechaHora(request.approved_at)}`}
            {request.rejected_at && ` · Respondida ${fmtFechaHora(request.rejected_at)}`}
          </p>

          {request.will_recover_time && request.requested_minutes ? (
            <div className="grid grid-cols-3 gap-2 rounded-md bg-muted/50 p-2 text-xs">
              <div>
                <p className="text-muted-foreground">Solicitadas</p>
                <p className="font-bold">{minutosAHoras(request.requested_minutes || 0)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Devueltas</p>
                <p className="font-bold">{minutosAHoras(request.returned_minutes || 0)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Recuperación</p>
                <p className="font-bold">{request.recovery_status || "—"}</p>
              </div>
            </div>
          ) : null}

          {request.support_path && (
            <Button
              size="sm"
              variant="outline"
              onClick={async () => {
                const url = await getSoporteSignedUrl(request.support_path!);
                if (url) window.open(url, "_blank", "noopener");
                else toast.error("No se pudo abrir el soporte.");
              }}
            >
              <Paperclip className="mr-1.5 h-4 w-4" /> Ver soporte adjunto
            </Button>
          )}

          {pendiente && modo === "ver" && (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => setModo("aprobar")}>
                Aprobar
              </Button>
              <Button size="sm" variant="destructive" onClick={() => setModo("negar")}>
                Negar
              </Button>
              <Button size="sm" variant="outline" onClick={() => setModo("devolver")}>
                Devolver para ajuste
              </Button>
            </div>
          )}

          {modo === "aprobar" && (
            <div className="space-y-3 rounded-md border p-3">
              <div>
                <Label className="text-xs">Observación de aprobación</Label>
                <Textarea value={obs} onChange={(e) => setObs(e.target.value)} rows={2} />
              </div>
              <label className="flex items-center gap-2 text-xs">
                <Checkbox checked={registrarAus} onCheckedChange={(v) => setRegistrarAus(!!v)} />
                Registrar en Control de ausentismo (TH-FR-48)
              </label>
              <div className="flex gap-2">
                <Button size="sm" onClick={aprobar} disabled={saving}>
                  Confirmar aprobación
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setModo("ver")}>
                  Volver
                </Button>
              </div>
            </div>
          )}

          {(modo === "negar" || modo === "devolver") && (
            <div className="space-y-3 rounded-md border p-3">
              <div>
                <Label className="text-xs">
                  Razón {modo === "negar" ? "de negación" : "del ajuste"} (obligatoria)
                </Label>
                <Textarea value={razon} onChange={(e) => setRazon(e.target.value)} rows={2} />
              </div>
              <div>
                <Label className="text-xs">Observación</Label>
                <Textarea value={obs} onChange={(e) => setObs(e.target.value)} rows={2} />
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => responder(modo === "negar" ? "NEGADA" : "DEVUELTA PARA AJUSTE")}
                  disabled={saving}
                >
                  {modo === "negar" ? "Confirmar negación" : "Confirmar devolución"}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setModo("ver")}>
                  Volver
                </Button>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="secondary" onClick={descargarPDF} disabled={pdfBusy}>
            <FileDown className="mr-1.5 h-4 w-4" />{" "}
            {pdfBusy ? "Generando…" : "Descargar PDF (TH-FR-09)"}
          </Button>
          <Button variant="outline" onClick={onClose}>
            Cerrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
