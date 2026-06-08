import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AutoComplete } from "@/components/rc/autocomplete";
import { ResultadoCard } from "@/components/rc/resultado-card";
import { Clock, LogIn, Plus, XCircle, Archive, AlertTriangle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  buildMensaje,
  calcHrsReserva,
  calcularVencimiento,
  fechaCasoStr,
  fmtFechaHora,
  fmtMinutos,
  nextCodigo,
  type Caso,
} from "@/lib/rc-utils";
import type { Catalogos } from "@/lib/use-rc-data";
import type { Plantilla } from "@/lib/rc-utils";

type Accion = "ingreso" | "ampliar" | "cancelar" | "archivar";

interface Props {
  casos: Caso[];
  catalogos: Catalogos;
  plantillas: Plantilla[];
  tick: number;
}

export function SeguimientoControl({ casos, catalogos, plantillas, tick }: Props) {
  const { canEdit } = useAuth();
  const [q, setQ] = useState("");
  const [accion, setAccion] = useState<{ tipo: Accion; caso: Caso } | null>(null);

  const activos = useMemo(() => {
    const list = casos
      .filter((c) => (c.tipo === "ACEP" || c.tipo === "CRUE_ACEP") && c.estado === "ACTIVO")
      .map((c) => ({ caso: c, ven: calcularVencimiento(c, casos) }));
    list.sort((a, b) => (a.ven.minRest ?? 1e9) - (b.ven.minRest ?? 1e9));
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [casos, tick]);

  const term = q.trim().toLowerCase();
  const filtrados = term
    ? activos.filter(({ caso: c }) =>
        [c.nombres, c.apellidos, c.documento, c.codigo, c.ips, c.unidad]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(term),
      )
    : activos;

  return (
    <>
      <div className="relative mb-4 mx-auto max-w-md">
        <Input
          className="rounded-full pl-4"
          placeholder="Buscar por documento, código, paciente…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      {filtrados.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">No hay cupos activos en seguimiento.</p>
      ) : (
        <div className="grid gap-3">
          {filtrados.map(({ caso: c, ven }) => {
            const min = ven.minRest;
            const vencido = min === null || min <= 0;
            const proximo = !vencido && min !== null && min <= 120;
            const barColor = vencido ? "border-l-status-red" : proximo ? "border-l-status-amber" : "border-l-status-green";
            return (
              <div key={c.id} className={`rounded-xl border border-border border-l-4 ${barColor} bg-card p-4 shadow-sm`}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="text-sm font-bold text-foreground">
                    {[c.nombres, c.apellidos].filter(Boolean).join(" ") || c.documento || "Sin nombre"}
                  </p>
                  {vencido ? (
                    <span className="flex items-center gap-1.5 rounded-full bg-status-red/15 px-3 py-1 text-xs font-extrabold text-status-red">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      TIEMPO DE INGRESO VENCIDO
                    </span>
                  ) : (
                    <div className="flex flex-col items-end gap-1">
                      <span className="flex items-center gap-1.5 text-xs font-extrabold text-foreground">
                        <Clock className="h-3.5 w-3.5" />
                        {fmtMinutos(min)} restantes
                      </span>
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                          proximo ? "bg-status-amber/15 text-status-amber" : "bg-status-green/15 text-status-green"
                        }`}
                      >
                        {proximo ? "Próximo a vencer" : "Vigente"}
                      </span>
                    </div>
                  )}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Doc: {c.documento || "—"} · {c.unidad || "—"} · {c.especialidad || "—"}
                </p>
                <p className="text-xs text-muted-foreground">
                  IPS: {c.ips || "—"}
                  {ven.amp ? ` · ampliado (${ven.amp.codigo})` : ""}
                </p>
                <p className="text-xs text-muted-foreground">
                  Vence: {ven.fechaVence || "—"} · Registrado: {fechaCasoStr(c)}
                </p>

                <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                  {canEdit ? (
                    <div className="flex flex-wrap gap-2">
                      {!vencido ? (
                        <>
                          <Button size="sm" className="rounded-full" onClick={() => setAccion({ tipo: "ingreso", caso: c })}>
                            <LogIn className="mr-1 h-3.5 w-3.5" /> Confirmar ingreso
                          </Button>
                          <Button size="sm" variant="secondary" className="rounded-full" onClick={() => setAccion({ tipo: "ampliar", caso: c })}>
                            <Plus className="mr-1 h-3.5 w-3.5" /> Ampliar cupo
                          </Button>
                          <Button size="sm" variant="outline" className="rounded-full" onClick={() => setAccion({ tipo: "cancelar", caso: c })}>
                            <XCircle className="mr-1 h-3.5 w-3.5" /> Cancelar cupo
                          </Button>
                        </>
                      ) : (
                        <Button size="sm" variant="destructive" className="rounded-full" onClick={() => setAccion({ tipo: "archivar", caso: c })}>
                          <Archive className="mr-1 h-3.5 w-3.5" /> Archivar caso
                        </Button>
                      )}
                    </div>
                  ) : (
                    <span />
                  )}
                  <Badge variant="secondary" className="ml-auto font-mono text-xs">
                    {c.codigo}
                  </Badge>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {accion && (
        <AccionDialog
          accion={accion.tipo}
          caso={accion.caso}
          casos={casos}
          catalogos={catalogos}
          plantillas={plantillas}
          onClose={() => setAccion(null)}
        />
      )}
    </>
  );
}

function AccionDialog({
  accion,
  caso,
  casos,
  catalogos,
  plantillas,
  onClose,
}: {
  accion: Accion;
  caso: Caso;
  casos: Caso[];
  catalogos: Catalogos;
  plantillas: Plantilla[];
  onClose: () => void;
}) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [resultado, setResultado] = useState<{ tipo: string; codigo: string; mensaje: string } | null>(null);

  // ingreso
  const [empresaTep, setEmpresaTep] = useState("");
  const [profesional, setProfesional] = useState("");
  const [cargo, setCargo] = useState("");
  const [placa, setPlaca] = useState("");
  // cancelar
  const [motivoCan, setMotivoCan] = useState("");
  // común
  const [detalle, setDetalle] = useState("");

  const titulos: Record<Accion, string> = {
    ingreso: "Confirmar ingreso del paciente",
    ampliar: "Ampliar cupo",
    cancelar: "Cancelar cupo",
    archivar: "Archivar cupo vencido",
  };

  const refrescar = () => {
    qc.invalidateQueries({ queryKey: ["rc-casos"] });
    qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
    qc.invalidateQueries({ queryKey: ["seguimientos-pendientes"] });
  };

  const ejecutar = async () => {
    setBusy(true);
    try {
      const ahora = new Date();
      const paciente = {
        documento: caso.documento,
        nombres: caso.nombres,
        apellidos: caso.apellidos,
        eapb: caso.eapb,
        regimen: caso.regimen,
        ips: caso.ips,
        medico: caso.medico,
        especialidad: caso.especialidad,
        unidad: caso.unidad,
      };

      if (accion === "ingreso") {
        const codigo = nextCodigo(casos, "ING", ahora);
        const obs = [
          empresaTep && `Empresa TEP: ${empresaTep}`,
          placa && `Placa: ${placa}`,
          profesional && `Profesional que recibe: ${profesional}${cargo ? ` (${cargo})` : ""}`,
          detalle,
        ]
          .filter(Boolean)
          .join(" · ");
        const { error: e1 } = await supabase.from("casos_entrantes").insert({
          ...paciente,
          codigo,
          tipo: "ING",
          cod_ref: caso.codigo,
          estado: "INGRESADO",
          fecha: ahora.toISOString().slice(0, 10),
          detalle: obs || null,
          created_by: user?.id,
        });
        if (e1) throw e1;
        const { error: e2 } = await supabase
          .from("casos_entrantes")
          .update({ estado: "INGRESADO" })
          .eq("id", caso.id);
        if (e2) throw e2;
        toast.success("Ingreso confirmado");
        refrescar();
        onClose();
        return;
      }

      if (accion === "ampliar") {
        const codigo = nextCodigo(casos, "AMP", ahora);
        const hrs = calcHrsReserva(caso.unidad || "", "AMP", catalogos.unidades);
        const venceD = new Date(ahora.getTime() + hrs * 3600000);
        const mensaje = buildMensaje(
          plantillas,
          catalogos.medicos,
          { codigo, fecha: fmtFechaHora(ahora), fechaVence: fmtFechaHora(venceD), hrsReserva: String(hrs) },
          { tipo: "AMP", ...paciente, codRef: caso.codigo, detalle } as any,
        );
        const { error } = await supabase.from("casos_entrantes").insert({
          ...paciente,
          codigo,
          tipo: "AMP",
          cod_ref: caso.codigo,
          estado: "REGISTRADO",
          fecha: ahora.toISOString().slice(0, 10),
          fecha_vence: venceD.toISOString(),
          hrs_reserva: String(hrs),
          detalle: detalle || null,
          texto_ia: mensaje || null,
          created_by: user?.id,
        });
        if (error) throw error;
        toast.success(`Cupo ampliado ${hrs}h`);
        refrescar();
        setResultado({ tipo: "AMP", codigo, mensaje });
        return;
      }

      if (accion === "cancelar" || accion === "archivar") {
        const motivo = accion === "archivar" ? "NO INGRESO DEL PACIENTE" : motivoCan;
        if (accion === "cancelar" && !motivo) {
          setBusy(false);
          return toast.error("Selecciona el motivo de cancelación");
        }
        const motCat = catalogos.motivosCancelacion.find((m) => m.nombre === motivo);
        const codigo = nextCodigo(casos, "CAN", ahora);
        const mensaje = buildMensaje(
          plantillas,
          catalogos.medicos,
          { codigo, fecha: fmtFechaHora(ahora), fechaVence: "", hrsReserva: "" },
          {
            tipo: "CAN",
            ...paciente,
            codRef: caso.codigo,
            motivoCancelacion: motivo,
            justificacionCancelacion: motCat?.justificacion || "",
            detalle,
          } as any,
        );
        const { error: e1 } = await supabase.from("casos_entrantes").insert({
          ...paciente,
          codigo,
          tipo: "CAN",
          cod_ref: caso.codigo,
          estado: "REGISTRADO",
          fecha: ahora.toISOString().slice(0, 10),
          detalle: motivo + (detalle ? ` · ${detalle}` : ""),
          texto_ia: mensaje || null,
          created_by: user?.id,
        });
        if (e1) throw e1;
        const { error: e2 } = await supabase
          .from("casos_entrantes")
          .update({ estado: accion === "archivar" ? "CANCELADO_VENCIMIENTO" : "CANCELADO" })
          .eq("id", caso.id);
        if (e2) throw e2;
        toast.success(accion === "archivar" ? "Cupo archivado" : "Cupo cancelado");
        refrescar();
        setResultado({ tipo: "CAN", codigo, mensaje });
        return;
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo completar la acción");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{titulos[accion]}</DialogTitle>
          <p className="text-xs text-muted-foreground">
            {[caso.nombres, caso.apellidos].filter(Boolean).join(" ") || caso.documento} · {caso.codigo}
          </p>
        </DialogHeader>

        {resultado ? (
          <ResultadoCard tipo={resultado.tipo} codigo={resultado.codigo} mensaje={resultado.mensaje} onNuevo={onClose} />
        ) : (
          <div className="space-y-4">
            {accion === "ingreso" && (
              <>
                <AutoComplete label="Empresa de transporte (TEP)" value={empresaTep} onChange={setEmpresaTep} options={catalogos.empresasTep} />
                <AutoComplete label="Placa del vehículo" value={placa} onChange={setPlaca} options={catalogos.placas} />
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="prof">Profesional que recibe</Label>
                    <Input id="prof" value={profesional} onChange={(e) => setProfesional(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="cargo">Cargo</Label>
                    <Input id="cargo" value={cargo} onChange={(e) => setCargo(e.target.value)} />
                  </div>
                </div>
              </>
            )}

            {accion === "ampliar" && (
              <p className="rounded-lg border border-status-amber/40 bg-status-amber/10 p-3 text-xs text-foreground">
                Se ampliará el tiempo de reserva según la unidad <strong>{caso.unidad || "—"}</strong>. Se generará un
                nuevo código AMP y el texto de notificación.
              </p>
            )}

            {accion === "cancelar" && (
              <div className="space-y-2">
                <Label>Motivo de cancelación</Label>
                <Select value={motivoCan} onValueChange={setMotivoCan}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar motivo…" />
                  </SelectTrigger>
                  <SelectContent>
                    {catalogos.motivosCancelacion.map((m) => (
                      <SelectItem key={m.nombre} value={m.nombre}>
                        {m.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {accion === "archivar" && (
              <p className="rounded-lg border border-status-red/40 bg-status-red/10 p-3 text-xs text-foreground">
                El cupo está vencido. Se registrará la cancelación por <strong>no ingreso del paciente</strong> y se
                archivará.
              </p>
            )}

            <div className="space-y-2">
              <Label htmlFor="obs">Observaciones</Label>
              <Textarea id="obs" rows={3} value={detalle} onChange={(e) => setDetalle(e.target.value)} placeholder="Información adicional…" />
            </div>

            <DialogFooter>
              <Button type="button" variant="ghost" onClick={onClose}>
                Cerrar
              </Button>
              <Button type="button" disabled={busy} onClick={ejecutar}>
                {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
                Confirmar
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
