import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/backend-client";
import { useAuth } from "@/lib/auth";
import { registrarAuditoria } from "@/lib/auditoria.functions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CalendarPlus, XCircle, FileDown } from "lucide-react";
import { toast } from "sonner";
import { SolicitudFormDialog } from "./solicitud-form-dialog";
import {
  estadoBadgeClass,
  fmtFecha,
  fmtFechaHora,
  type ShiftRequest,
} from "@/lib/cuadro-turno-utils";
import { generarSolicitudPDF } from "@/lib/solicitud-pdf";
import { getFirmaDataUrlById } from "@/lib/firmas-utils";
import { ControlMensualPanel } from "./control-mensual-panel";

export function MiTurnoPanel() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [openSolicitud, setOpenSolicitud] = useState(false);

  const { data: requests = [] } = useQuery({
    queryKey: ["shift-requests", "mias", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shift_requests")
        .select("*")
        .eq("requester_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as ShiftRequest[];
    },
  });

  const cancelar = async (r: ShiftRequest) => {
    if (r.status !== "PENDIENTE") return;
    const { error } = await supabase
      .from("shift_requests")
      .update({ status: "CANCELADA" })
      .eq("id", r.id);
    if (error) return toast.error("No se pudo cancelar.");
    await supabase.from("shift_request_audit").insert({
      request_id: r.id,
      action: "CANCELADA",
      previous_status: "PENDIENTE",
      new_status: "CANCELADA",
      user_id: user!.id,
    });
    registrarAuditoria({
      data: {
        accion: "SOLICITUD_CANCELADA",
        modulo: "cuadro_turno",
        tabla: "shift_requests",
        registroId: r.id,
        resultado: "exito",
      },
    }).catch(() => {});
    toast.success("Solicitud cancelada.");
    qc.invalidateQueries({ queryKey: ["shift-requests"] });
  };

  const descargarPDF = async (r: ShiftRequest) => {
    try {
      const firmaDataUrl = r.requester_signature_id
        ? await getFirmaDataUrlById(r.requester_signature_id)
        : null;
      await generarSolicitudPDF(r, { firmaDataUrl });
    } catch (e) {
      console.error(e);
      toast.error("No se pudo generar el PDF.");
    }
  };

  const pendientes = requests.filter((r) => r.status === "PENDIENTE");
  const aprobadas = requests.filter((r) => r.status === "APROBADA" || r.status === "EJECUTADA");
  const rechazadas = requests.filter((r) => ["NEGADA", "RECHAZADA"].includes(r.status));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => setOpenSolicitud(true)}>
          <CalendarPlus className="mr-1.5 h-4 w-4" /> Solicitar permiso / cambio de turno
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">Pendientes</p>
          <p className="text-2xl font-bold">{pendientes.length}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">Aprobadas</p>
          <p className="text-2xl font-bold text-emerald-600">{aprobadas.length}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">Negadas / rechazadas</p>
          <p className="text-2xl font-bold text-rose-600">{rechazadas.length}</p>
        </Card>
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold">Mi consumo mensual</h3>
        <ControlMensualPanel soloUsuario />
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold">Mis solicitudes</h3>
        {requests.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aún no tienes solicitudes.</p>
        ) : (
          <div className="space-y-2">
            {requests.map((r) => (
              <Card key={r.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${estadoBadgeClass(r.status)}`}
                    >
                      {r.status}
                    </span>
                    <span className="text-sm font-medium">
                      {r.request_type === "cambio_turno"
                        ? "Cambio de turno"
                        : r.reason_type === "Otro"
                          ? r.other_reason
                          : r.reason_type}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {r.request_type === "cambio_turno"
                      ? `${r.original_shift_code || "—"} (${fmtFecha(r.original_shift_date)}) → ${r.requested_shift_code || "—"} (${fmtFecha(r.requested_shift_date)})`
                      : `${fmtFecha(r.start_date)} – ${fmtFecha(r.end_date)}`}
                    {" · "}Enviada {fmtFechaHora(r.created_at)}
                  </p>
                  {["NEGADA", "RECHAZADA"].includes(r.status) && r.rejection_reason && (
                    <p className="mt-1 text-xs text-rose-600">Motivo: {r.rejection_reason}</p>
                  )}
                  {r.status === "APROBADA" && r.approval_observation && (
                    <p className="mt-1 text-xs text-emerald-600">
                      Coordinación: {r.approval_observation}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="sm" onClick={() => descargarPDF(r)}>
                    <FileDown className="mr-1 h-4 w-4" /> PDF
                  </Button>
                  {r.status === "PENDIENTE" && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-rose-600"
                      onClick={() => cancelar(r)}
                    >
                      <XCircle className="mr-1 h-4 w-4" /> Cancelar
                    </Button>
                  )}
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      <SolicitudFormDialog open={openSolicitud} onOpenChange={setOpenSolicitud} />
    </div>
  );
}
