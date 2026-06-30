import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/backend-client";
import { useAuth } from "@/lib/auth";
import { registrarAuditoria } from "@/lib/auditoria.functions";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import {
  estadoBadgeClass, fmtFecha, fmtFechaHora, resumenSolicitud,
  defaultRegistrarAusentismo, motivoAEvento, eventoNombre,
  minutosEntreHoras, diasEntreFechas, ESTADOS_SOLICITUD, type ShiftRequest,
} from "@/lib/cuadro-turno-utils";
import { generarSolicitudPDF } from "@/lib/solicitud-pdf";
import { getFirmaDataUrlById } from "@/lib/firmas-utils";
import { FileDown } from "lucide-react";

export function SolicitudesPanel() {
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
    () => requests.filter((r) => filtroEstado === "TODAS" || r.status === filtroEstado),
    [requests, filtroEstado],
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Label className="text-xs">Estado</Label>
        <Select value={filtroEstado} onValueChange={setFiltroEstado}>
          <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="TODAS">Todas</SelectItem>
            {ESTADOS_SOLICITUD.map((e) => <SelectItem key={e} value={e}>{e}</SelectItem>)}
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground">{filtradas.length} solicitud(es)</span>
      </div>

      {filtradas.length === 0 ? (
        <p className="text-sm text-muted-foreground">No hay solicitudes.</p>
      ) : (
        <div className="space-y-2">
          {filtradas.map((r) => (
            <Card key={r.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${estadoBadgeClass(r.status)}`}>{r.status}</span>
                  <span className="text-sm font-medium">{r.requester_name || "—"}</span>
                  <span className="text-xs text-muted-foreground">{r.requester_role || ""}</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {r.request_type === "cambio_turno" ? "Cambio de turno" : (r.reason_type === "Otro" ? r.other_reason : r.reason_type)}
                  {" · "}
                  {r.request_type === "cambio_turno"
                    ? `${fmtFecha(r.original_shift_date)} → ${fmtFecha(r.requested_shift_date)}`
                    : `${fmtFecha(r.start_date)} – ${fmtFecha(r.end_date)}`}
                  {r.requires_replacement ? " · Reemplazo: " + (r.replacement_name || "Sí") : ""}
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={() => setSel(r)}>Revisar</Button>
            </Card>
          ))}
        </div>
      )}

      {sel && (
        <RevisionDialog
          request={sel}
          adminId={user!.id}
          onClose={() => setSel(null)}
          onDone={() => { setSel(null); qc.invalidateQueries({ queryKey: ["shift-requests"] }); qc.invalidateQueries({ queryKey: ["absenteeism"] }); }}
        />
      )}
    </div>
  );
}

function RevisionDialog({
  request, adminId, onClose, onDone,
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
      await generarSolicitudPDF(request, { firmaDataUrl });
      registrarAuditoria({ data: { accion: "SOLICITUD_PDF", modulo: "cuadro_turno", tabla: "shift_requests", registroId: request.id, resultado: "exito" } }).catch(() => {});
    } catch (e) {
      console.error(e);
      toast.error("No se pudo generar el PDF.");
    } finally {
      setPdfBusy(false);
    }
  };

  const aprobar = async () => {
    setSaving(true);
    try {
      const { error } = await supabase.from("shift_requests").update({
        status: "APROBADA", approved_by: adminId, approved_at: new Date().toISOString(),
        approval_observation: obs || null, register_absenteeism: registrarAus,
      }).eq("id", request.id);
      if (error) throw error;

      // Alimentar TH-FR-48 si corresponde
      if (registrarAus) {
        const minutos = minutosEntreHoras(request.start_time, request.end_time);
        const dias = diasEntreFechas(request.start_date, request.end_date);
        const evento = motivoAEvento(request.reason_type);
        await supabase.from("shift_absenteeism_records").insert({
          request_id: request.id, user_id: request.requester_id,
          identification_number: request.requester_identification,
          worker_name: request.requester_name, role_name: request.requester_role,
          start_date: request.start_date, end_date: request.end_date,
          start_time: request.start_time, end_time: request.end_time,
          minutes_number: minutos, days_number: dias,
          event_code: evento, event_name: eventoNombre(evento),
          reason: request.reason_type === "Otro" ? request.other_reason : request.reason_type,
          origin: "solicitud_aprobada", approved_by: adminId, approved_at: new Date().toISOString(),
          created_by: adminId,
        });
      }

      await supabase.from("shift_request_audit").insert({
        request_id: request.id, action: "APROBADA", previous_status: request.status,
        new_status: "APROBADA", user_id: adminId, detail: obs || null,
      });
      registrarAuditoria({ data: { accion: "SOLICITUD_APROBADA", modulo: "cuadro_turno", tabla: "shift_requests", registroId: request.id, resultado: "exito" } }).catch(() => {});
      toast.success("Solicitud aprobada.");
      onDone();
    } catch (e) { console.error(e); toast.error("No se pudo aprobar."); } finally { setSaving(false); }
  };

  const responder = async (nuevoEstado: "NEGADA" | "DEVUELTA PARA AJUSTE") => {
    if (!razon.trim()) return toast.error("La razón es obligatoria.");
    setSaving(true);
    try {
      const { error } = await supabase.from("shift_requests").update({
        status: nuevoEstado, rejected_by: adminId, rejected_at: new Date().toISOString(),
        rejection_reason: razon, response_observation: obs || null,
      }).eq("id", request.id);
      if (error) throw error;
      await supabase.from("shift_request_audit").insert({
        request_id: request.id, action: nuevoEstado === "NEGADA" ? "NEGADA" : "DEVUELTA",
        previous_status: request.status, new_status: nuevoEstado, user_id: adminId, detail: razon,
      });
      registrarAuditoria({ data: { accion: nuevoEstado === "NEGADA" ? "SOLICITUD_NEGADA" : "SOLICITUD_DEVUELTA", modulo: "cuadro_turno", tabla: "shift_requests", registroId: request.id, resultado: "exito" } }).catch(() => {});
      toast.success(nuevoEstado === "NEGADA" ? "Solicitud negada." : "Solicitud devuelta para ajuste.");
      onDone();
    } catch (e) { console.error(e); toast.error("No se pudo procesar."); } finally { setSaving(false); }
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[92vh] max-w-xl overflow-y-auto">
        <DialogHeader><DialogTitle>Revisión de solicitud</DialogTitle></DialogHeader>

        <div className="space-y-4 text-sm">
          <pre className="whitespace-pre-wrap rounded-md bg-muted/50 p-3 text-xs">{resumenSolicitud(request)}</pre>
          <p className="text-xs text-muted-foreground">
            Estado actual: <span className={`rounded-full border px-2 py-0.5 ${estadoBadgeClass(request.status)}`}>{request.status}</span>
            {request.approved_at && ` · Aprobada ${fmtFechaHora(request.approved_at)}`}
            {request.rejected_at && ` · Respondida ${fmtFechaHora(request.rejected_at)}`}
          </p>

          {pendiente && modo === "ver" && (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => setModo("aprobar")}>Aprobar</Button>
              <Button size="sm" variant="destructive" onClick={() => setModo("negar")}>Negar</Button>
              <Button size="sm" variant="outline" onClick={() => setModo("devolver")}>Devolver para ajuste</Button>
            </div>
          )}

          {modo === "aprobar" && (
            <div className="space-y-3 rounded-md border p-3">
              <div><Label className="text-xs">Observación de aprobación</Label><Textarea value={obs} onChange={(e) => setObs(e.target.value)} rows={2} /></div>
              <label className="flex items-center gap-2 text-xs">
                <Checkbox checked={registrarAus} onCheckedChange={(v) => setRegistrarAus(!!v)} />
                Registrar en Control de ausentismo (TH-FR-48)
              </label>
              <div className="flex gap-2">
                <Button size="sm" onClick={aprobar} disabled={saving}>Confirmar aprobación</Button>
                <Button size="sm" variant="ghost" onClick={() => setModo("ver")}>Volver</Button>
              </div>
            </div>
          )}

          {(modo === "negar" || modo === "devolver") && (
            <div className="space-y-3 rounded-md border p-3">
              <div><Label className="text-xs">Razón {modo === "negar" ? "de negación" : "del ajuste"} (obligatoria)</Label><Textarea value={razon} onChange={(e) => setRazon(e.target.value)} rows={2} /></div>
              <div><Label className="text-xs">Observación</Label><Textarea value={obs} onChange={(e) => setObs(e.target.value)} rows={2} /></div>
              <div className="flex gap-2">
                <Button size="sm" variant="destructive" onClick={() => responder(modo === "negar" ? "NEGADA" : "DEVUELTA PARA AJUSTE")} disabled={saving}>
                  {modo === "negar" ? "Confirmar negación" : "Confirmar devolución"}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setModo("ver")}>Volver</Button>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="secondary" onClick={descargarPDF} disabled={pdfBusy}>
            <FileDown className="mr-1.5 h-4 w-4" /> {pdfBusy ? "Generando…" : "Descargar PDF (TH-FR-09)"}
          </Button>
          <Button variant="outline" onClick={onClose}>Cerrar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
