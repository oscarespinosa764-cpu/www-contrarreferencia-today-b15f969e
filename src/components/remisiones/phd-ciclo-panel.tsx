import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  avanzarEstadoCiclo,
  listarRadicaciones,
  registrarRadicacion,
  type PhdEstadoCiclo,
} from "@/lib/phd-ciclo.functions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { DictationTextarea } from "@/components/voz/dictation-textarea";
import { ChecklistRunner } from "@/components/coordinacion/checklist-runner";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { fmtFechaHora } from "@/lib/remisiones-utils";
import { ChevronRight, FilePlus2, XCircle, CheckCircle2, Truck } from "lucide-react";

const CANALES = ["CORREO", "PLATAFORMA", "TELEFONO", "PRESENCIAL", "OTRO"];

function transicionesPermitidas(estado?: string | null): PhdEstadoCiclo[] {
  const s = (estado ?? "PENDIENTE ACEPTACION") as PhdEstadoCiclo;
  switch (s) {
    case "PENDIENTE ACEPTACION":
      return [
        "ACEPTADO - PENDIENTE EGRESO",
        "ACEPTADO - PENDIENTE COORDINACION DE AMBULANCIA",
      ];
    case "ACEPTADO - PENDIENTE EGRESO":
      return [
        "ACEPTADO - PENDIENTE COORDINACION DE AMBULANCIA",
        "CERRADO POR EGRESO",
      ];
    case "ACEPTADO - PENDIENTE COORDINACION DE AMBULANCIA":
      return ["AMBULANCIA COORDINADA - PENDIENTE EGRESO"];
    case "AMBULANCIA COORDINADA - PENDIENTE EGRESO":
      return ["CERRADO POR EGRESO"];
    default:
      return [];
  }
}

function esTerminal(estado?: string | null) {
  return (estado ?? "").startsWith("CERRADO");
}

function iconoPaso(estado: PhdEstadoCiclo) {
  if (estado === "CERRADO POR EGRESO") return <CheckCircle2 className="h-3.5 w-3.5" />;
  if (estado.startsWith("AMBULANCIA") || estado.includes("AMBULANCIA"))
    return <Truck className="h-3.5 w-3.5" />;
  return <ChevronRight className="h-3.5 w-3.5" />;
}

export function PhdCicloPanel({
  casoId,
  estadoActual,
  canEdit,
}: {
  casoId: string;
  estadoActual: string | null | undefined;
  canEdit: boolean;
}) {
  const qc = useQueryClient();
  const avanzar = useServerFn(avanzarEstadoCiclo);
  const radicar = useServerFn(registrarRadicacion);
  const listar = useServerFn(listarRadicaciones);

  const [obs, setObs] = useState("");
  const [pendiente, setPendiente] = useState<PhdEstadoCiclo | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [radOpen, setRadOpen] = useState(false);

  const { data: radicaciones = [], refetch } = useQuery({
    queryKey: ["phd-radicaciones", casoId],
    queryFn: () => listar({ data: { casoId } }),
    enabled: !!casoId,
  });

  const mAvanzar = useMutation({
    mutationFn: (e: PhdEstadoCiclo) =>
      avanzar({ data: { casoId, nuevoEstado: e, observaciones: obs || undefined } }),
    onSuccess: () => {
      toast.success("Estado del ciclo actualizado");
      setObs("");
      setPendiente(null);
      setCancelOpen(false);
      qc.invalidateQueries({ queryKey: ["domiciliarios"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const mRadicar = useMutation({
    mutationFn: (form: {
      eapb: string;
      canal: string;
      numeroRadicado?: string;
      observaciones?: string;
    }) => radicar({ data: { casoId, ...form } }),
    onSuccess: () => {
      toast.success("Radicación registrada");
      setRadOpen(false);
      refetch();
      qc.invalidateQueries({ queryKey: ["domiciliarios"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const siguientes = transicionesPermitidas(estadoActual);
  const terminal = esTerminal(estadoActual);

  return (
    <div className="rounded-xl border border-border bg-muted/30 p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Ciclo del caso
          </p>
          <Badge variant={terminal ? "secondary" : "default"} className="mt-1">
            {estadoActual || "PENDIENTE ACEPTACION"}
          </Badge>
        </div>
        {canEdit && !terminal && (
          <div className="flex flex-wrap gap-2">
            {siguientes.map((e) => (
              <Button
                key={e}
                size="sm"
                variant="outline"
                className="rounded-full"
                onClick={() => setPendiente(e)}
                disabled={mAvanzar.isPending}
              >
                {iconoPaso(e)} <span className="ml-1">{e}</span>
              </Button>
            ))}
            <Button
              size="sm"
              variant="outline"
              className="rounded-full text-status-red"
              onClick={() => setCancelOpen(true)}
            >
              <XCircle className="mr-1 h-3.5 w-3.5" /> Cancelar
            </Button>
          </div>
        )}
      </div>

      {/* Radicaciones */}
      <div className="mt-3">
        <div className="mb-1.5 flex items-center justify-between">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Radicaciones ({radicaciones.length})
          </p>
          {canEdit && !terminal && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 rounded-full px-2 text-xs"
              onClick={() => setRadOpen(true)}
            >
              <FilePlus2 className="mr-1 h-3.5 w-3.5" /> Nueva radicación
            </Button>
          )}
        </div>
        {radicaciones.length === 0 ? (
          <p className="text-xs text-muted-foreground">Sin radicaciones registradas.</p>
        ) : (
          <ul className="space-y-1">
            {radicaciones.map((r) => (
              <li
                key={r.id}
                className="rounded-md border border-border bg-background px-2 py-1.5 text-xs"
              >
                <div className="flex flex-wrap items-center justify-between gap-1">
                  <span className="font-semibold">{r.eapb}</span>
                  <span className="text-[10px] text-muted-foreground">
                    {fmtFechaHora(r.fecha_radicacion)}
                  </span>
                </div>
                <div className="text-[11px] text-muted-foreground">
                  Canal: {r.canal}
                  {r.numero_radicado ? ` · N° ${r.numero_radicado}` : ""}
                </div>
                {r.observaciones && (
                  <p className="mt-0.5 text-[11px] text-muted-foreground">{r.observaciones}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Confirmación paso simple */}
      <Dialog open={!!pendiente} onOpenChange={(o) => !o && setPendiente(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Avanzar a: {pendiente}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label className="text-xs">Observaciones (opcional)</Label>
            <Textarea rows={3} value={obs} onChange={(e) => setObs(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendiente(null)}>
              Cancelar
            </Button>
            <Button
              onClick={() => pendiente && mAvanzar.mutate(pendiente)}
              disabled={mAvanzar.isPending}
            >
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancelación */}
      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Cancelar caso</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Label className="text-xs">Motivo de cierre</Label>
            <Textarea
              rows={3}
              value={obs}
              onChange={(e) => setObs(e.target.value)}
              placeholder="Motivo obligatorio de cancelación"
            />
            <div className="flex flex-col gap-2">
              <Button
                variant="outline"
                onClick={() =>
                  mAvanzar.mutate("CERRADO POR CANCELACION DEL PROVEEDOR")
                }
                disabled={!obs.trim() || mAvanzar.isPending}
              >
                Cancelado por el PROVEEDOR
              </Button>
              <Button
                variant="outline"
                onClick={() =>
                  mAvanzar.mutate(
                    "CERRADO POR CANCELACION DE LA ESPECIALIDAD SOLICITANTE",
                  )
                }
                disabled={!obs.trim() || mAvanzar.isPending}
              >
                Cancelado por la ESPECIALIDAD solicitante
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Nueva radicación */}
      <Dialog open={radOpen} onOpenChange={setRadOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Registrar radicación</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              const eapb = String(fd.get("eapb") ?? "").trim();
              const canal = String(fd.get("canal") ?? "").trim();
              if (!eapb || !canal) return toast.error("EAPB y canal son obligatorios");
              mRadicar.mutate({
                eapb,
                canal,
                numeroRadicado: String(fd.get("numero") ?? "").trim() || undefined,
                observaciones: String(fd.get("obs") ?? "").trim() || undefined,
              });
            }}
            className="space-y-3"
          >
            <div className="space-y-1.5">
              <Label className="text-xs">EAPB / ERP</Label>
              <Input name="eapb" required />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Canal</Label>
              <select
                name="canal"
                required
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">Seleccione…</option>
                {CANALES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">N° radicado (opcional)</Label>
              <Input name="numero" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Observaciones (opcional)</Label>
              <DictationTextarea dictationKey="phd.radicacion.observaciones" name="obs" rows={2} />
            </div>
            <ChecklistRunner checklistCodigo="PHD_RADICACION_VALIDACION" compact />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setRadOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={mRadicar.isPending}>
                Registrar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
