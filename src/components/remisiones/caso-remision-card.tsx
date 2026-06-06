import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Eye, Pencil, ClipboardCheck, MapPin } from "lucide-react";
import { Field } from "./form-bits";
import { SeguimientoDialog } from "./seguimiento-dialog";
import {
  evolucionMeta,
  fmtFechaHora,
  fmtTranscurrido,
  normEvolucion,
  prioridadMeta,
  tiempoChip,
} from "@/lib/remisiones-utils";
import { toast } from "sonner";

export type Remision = {
  id: string;
  paciente: string | null;
  documento: string | null;
  edad: string | null;
  servicio: string | null;
  cama: string | null;
  asegurador: string | null;
  prioridad: string | null;
  estado: string | null;
  tipo_tramite: string | null;
  especialidades_tratantes: string | null;
  especialidades_receptoras: string | null;
  codigo_radicacion: string | null;
  contacto_nombre: string | null;
  contacto_parentesco: string | null;
  contacto_telefono: string | null;
  observaciones: string | null;
  especificacion: string | null;
  evolucion: string | null;
  evolucion_detalle: string | null;
  texto_ia: string | null;
  created_at: string | null;
};

function Dato({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-sm text-foreground">{value || "—"}</p>
    </div>
  );
}

/** Reloj que se actualiza cada segundo para el tiempo transcurrido. */
function useTick(active: boolean) {
  const [, setN] = useState(0);
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setN((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [active]);
}

export function CasoRemisionCard({
  r,
  canEdit,
  ultimaGestion,
}: {
  r: Remision;
  canEdit: boolean;
  ultimaGestion?: { fecha: string | null; responsable: string | null } | null;
}) {
  const qc = useQueryClient();
  const [ver, setVer] = useState(false);
  const [editar, setEditar] = useState(false);
  const [seg, setSeg] = useState(false);
  useTick(true);

  const evo = evolucionMeta[normEvolucion(r.evolucion)];
  const pendiente = /PENDIENTE/i.test(r.estado || "");
  const nombre = r.paciente || "Sin nombre";
  const radicado = r.codigo_radicacion?.trim() || "No aplica";
  const prio = prioridadMeta(r.prioridad);

  const handleUpdate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const { error } = await supabase
      .from("remisiones")
      .update({
        paciente: String(f.get("paciente")),
        documento: String(f.get("documento")),
        edad: String(f.get("edad")),
        servicio: String(f.get("servicio")),
        cama: String(f.get("cama")),
        asegurador: String(f.get("asegurador")),
        prioridad: String(f.get("prioridad")),
        estado: String(f.get("estado")),
        especialidades_tratantes: String(f.get("especialidades_tratantes")),
        especialidades_receptoras: String(f.get("especialidades_receptoras")),
        codigo_radicacion: String(f.get("codigo_radicacion")),
        observaciones: String(f.get("observaciones")),
      })
      .eq("id", r.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Remisión actualizada");
    setEditar(false);
    qc.invalidateQueries({ queryKey: ["remisiones"] });
  };

  return (
    <div className="rounded-xl border border-border border-l-4 border-l-status-teal bg-card p-3.5 shadow-sm">
      {/* Encabezado */}
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-bold uppercase text-foreground">{nombre}</p>
          <p className="text-[11px] text-muted-foreground">
            {[r.tipo_tramite, r.documento && `Doc: ${r.documento}`, r.edad && `${r.edad} años`]
              .filter(Boolean)
              .join(" · ") || "—"}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <div className="flex items-center gap-1.5">
            {r.prioridad && (
              <Badge
                variant="outline"
                className={
                  /alta|alto/i.test(r.prioridad) ? "border-status-red/40 text-status-red" : undefined
                }
              >
                {r.prioridad}
              </Badge>
            )}
            <Badge variant="secondary" className="font-mono text-[10px]">
              Rad: {radicado}
            </Badge>
          </div>
          <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-semibold text-secondary-foreground">
            {fmtTranscurrido(r.created_at)}
          </span>
        </div>
      </div>


      {/* Datos compactos */}
      <div className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-1.5 sm:grid-cols-3 lg:grid-cols-5">
        <Dato
          label="Ubicación"
          value={
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3 w-3 text-muted-foreground" />
              {[r.servicio, r.cama].filter(Boolean).join(" · ") || "—"}
            </span>
          }
        />
        <Dato
          label="Estado"
          value={
            <span className={pendiente ? "font-semibold text-status-red" : "font-semibold text-foreground"}>
              {r.estado || "—"}
            </span>
          }
        />
        <Dato label="Especialidad tratante" value={r.especialidades_tratantes} />
        <Dato label="Especialidad destino" value={r.especialidades_receptoras} />
        <Dato
          label="Evolución"
          value={
            <span className="inline-flex items-center gap-1.5">
              <span className={`h-2 w-2 rounded-full ${evo.dot}`} />
              {evo.label}
            </span>
          }
        />
      </div>

      {(r.observaciones || r.especificacion) && (
        <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">
          <span className="font-semibold">Motivo:</span> {r.observaciones || r.especificacion}
        </p>
      )}

      {/* Última gestión */}
      <p className="mt-2 text-[11px] text-muted-foreground">
        <span className="font-semibold">Última gestión:</span>{" "}
        {ultimaGestion
          ? `${fmtFechaHora(ultimaGestion.fecha)} · ${ultimaGestion.responsable || "—"}`
          : "Sin seguimientos registrados"}
      </p>

      {/* Acciones */}
      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="outline" size="sm" className="rounded-full" onClick={() => setVer(true)}>
          <Eye className="mr-1 h-3.5 w-3.5" /> Ver caso
        </Button>
        {canEdit && (
          <Button variant="outline" size="sm" className="rounded-full" onClick={() => setEditar(true)}>
            <Pencil className="mr-1 h-3.5 w-3.5" /> Editar
          </Button>
        )}
        {canEdit && (
          <Button size="sm" className="rounded-full" onClick={() => setSeg(true)}>
            <ClipboardCheck className="mr-1 h-3.5 w-3.5" /> Seguimiento
          </Button>
        )}
      </div>

      {/* Ver caso */}
      <Dialog open={ver} onOpenChange={setVer}>
        <DialogContent className="max-h-[90vh] overflow-auto sm:max-w-xl">
          <DialogHeader>
            <div className="flex items-center justify-between gap-2 pr-6">
              <DialogTitle>Detalle · {nombre}</DialogTitle>
              {canEdit && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 rounded-full"
                  aria-label="Editar"
                  onClick={() => {
                    setVer(false);
                    setEditar(true);
                  }}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
              )}
            </div>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <Dato label="Paciente" value={r.paciente} />
            <Dato label="Documento" value={r.documento} />
            <Dato label="Edad" value={r.edad} />
            <Dato label="Asegurador" value={r.asegurador} />
            <Dato label="Servicio" value={r.servicio} />
            <Dato label="Cama" value={r.cama} />
            <Dato label="Prioridad" value={r.prioridad} />
            <Dato label="N° radicado" value={radicado} />
            <Dato label="Tipo trámite" value={r.tipo_tramite} />
            <Dato label="Estado" value={r.estado} />
            <Dato label="Especialidad tratante" value={r.especialidades_tratantes} />
            <Dato label="Especialidad destino" value={r.especialidades_receptoras} />
            <Dato label="Familiar" value={r.contacto_nombre} />
            <Dato label="Parentesco" value={r.contacto_parentesco} />
            <Dato label="Teléfono familiar" value={r.contacto_telefono} />
          </div>
          {r.observaciones && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Observaciones</p>
              <p className="text-sm text-foreground">{r.observaciones}</p>
            </div>
          )}
        </DialogContent>
      </Dialog>


      {/* Editar */}
      <Dialog open={editar} onOpenChange={setEditar}>
        <DialogContent className="max-h-[90vh] overflow-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Editar remisión · {nombre}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleUpdate} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field name="paciente" label="Paciente" required defaultValue={r.paciente ?? ""} />
              <Field name="documento" label="Documento" defaultValue={r.documento ?? ""} />
              <Field name="edad" label="Edad" defaultValue={r.edad ?? ""} />
              <Field name="asegurador" label="Asegurador" defaultValue={r.asegurador ?? ""} />
              <Field name="servicio" label="Servicio" defaultValue={r.servicio ?? ""} />
              <Field name="cama" label="Cama" defaultValue={r.cama ?? ""} />
              <Field name="prioridad" label="Prioridad" defaultValue={r.prioridad ?? ""} />
              <Field name="estado" label="Estado" defaultValue={r.estado ?? ""} />
              <Field
                name="especialidades_tratantes"
                label="Especialidad tratante"
                defaultValue={r.especialidades_tratantes ?? ""}
              />
              <Field
                name="especialidades_receptoras"
                label="Especialidad destino"
                defaultValue={r.especialidades_receptoras ?? ""}
              />
              <Field
                name="codigo_radicacion"
                label="N° radicado"
                defaultValue={r.codigo_radicacion ?? ""}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="observaciones" className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Observaciones
              </Label>
              <Textarea id="observaciones" name="observaciones" rows={3} defaultValue={r.observaciones ?? ""} />
            </div>
            <DialogFooter>
              <Button type="submit" className="rounded-full">
                Guardar cambios
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Seguimiento */}
      <SeguimientoDialog
        open={seg}
        onOpenChange={setSeg}
        casoId={r.id}
        tipoCaso="remision"
        paciente={nombre}
        evolucionActual={r.evolucion}
        evolucionDetalle={r.evolucion_detalle}
        especialidades={r.especialidades_receptoras}
        radicadoCaso={r.codigo_radicacion}
        tabla="remisiones"
      />
    </div>
  );
}
