import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  evolucionFromDetalle,
  evolucionMeta,
  fmtFechaHora,
  parseEvolucionDetalle,
  splitEspecialidades,
  type EvoEspecialidad,
} from "@/lib/remisiones-utils";
import { toast } from "sonner";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  casoId: string;
  tipoCaso: string;
  paciente: string;
  evolucionActual?: string | null;
  /** JSON con el detalle de evolución por especialidad. */
  evolucionDetalle?: string | null;
  /** Especialidades receptoras (texto separado por comas). */
  especialidades?: string | null;
  /** Radicado guardado en el caso. */
  radicadoCaso?: string | null;
  /** Tabla a actualizar para la evolución del caso (remisiones, domiciliarios, etc.). */
  tabla?: string;
};

const TIPOS_SEG = [
  "Radicado de trámite de remisión",
  "Llamada a IPS receptora",
  "Respuesta de IPS",
  "Gestión ambulancia",
  "Actualización clínica",
  "Contacto familiar",
  "Otro",
];

export function SeguimientoDialog({
  open,
  onOpenChange,
  casoId,
  tipoCaso,
  paciente,
  
  evolucionDetalle,
  especialidades,
  radicadoCaso,
  tabla,
}: Props) {
  const qc = useQueryClient();
  const especialidadesList = useMemo(() => splitEspecialidades(especialidades), [especialidades]);

  const [nuevoRadicado, setNuevoRadicado] = useState(false);
  const [noAplicaRadicado, setNoAplicaRadicado] = useState(false);
  const [radicado, setRadicado] = useState("");
  const [tipoSeg, setTipoSeg] = useState("");
  const [detalle, setDetalle] = useState("");
  const [evoDetalle, setEvoDetalle] = useState<Record<string, EvoEspecialidad>>({});
  const [busy, setBusy] = useState(false);
  const [busyEvo, setBusyEvo] = useState(false);

  // Inicializar el checklist por especialidad al abrir.
  useEffect(() => {
    if (open) setEvoDetalle(parseEvolucionDetalle(evolucionDetalle, especialidadesList));
  }, [open, evolucionDetalle, especialidadesList]);

  const { data: historial } = useQuery({
    queryKey: ["seguimientos-caso", casoId],
    enabled: open,
    queryFn: async () => {
      const { data } = await supabase
        .from("seguimientos")
        .select("*")
        .eq("caso_id", casoId)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const radicadoExistente =
    radicadoCaso?.trim() || (historial ?? []).find((h) => h.radicado)?.radicado || "";
  const radicadoEnUso = noAplicaRadicado
    ? "No aplica"
    : nuevoRadicado || !radicadoExistente
      ? radicado
      : radicadoExistente;

  const toggleEvo = (esp: string, key: keyof EvoEspecialidad) =>
    setEvoDetalle((prev) => ({
      ...prev,
      [esp]: { ...prev[esp], [key]: !prev[esp]?.[key] },
    }));

  const evolucionCalc = evolucionFromDetalle(evoDetalle);
  const metaCalc = evolucionMeta[evolucionCalc];

  const guardar = async () => {
    if (!tipoSeg) {
      toast.error("Selecciona el tipo de seguimiento");
      return;
    }
    setBusy(true);
    const { data: u } = await supabase.auth.getUser();
    const { data: perfil } = await supabase
      .from("profiles")
      .select("nombre")
      .eq("user_id", u.user?.id ?? "")
      .maybeSingle();

    const { error } = await supabase.from("seguimientos").insert({
      caso_id: casoId,
      tipo_caso: tipoCaso,
      radicado: radicadoEnUso || null,
      tipo_seguimiento: tipoSeg,
      detalle: detalle || null,
      nombre_usuario: perfil?.nombre || u.user?.email || null,
      created_by: u.user?.id,
    });
    if (error) {
      toast.error(error.message);
      setBusy(false);
      return;
    }

    if (tabla) {
      const update: {
        evolucion: string;
        evolucion_detalle?: string;
        codigo_radicacion?: string;
      } = { evolucion: evolucionCalc };
      if (especialidadesList.length > 0) update.evolucion_detalle = JSON.stringify(evoDetalle);
      if (radicadoEnUso) update.codigo_radicacion = radicadoEnUso;
      await supabase
        .from(tabla as "remisiones")
        .update(update)
        .eq("id", casoId);
    }

    toast.success("Seguimiento registrado");
    setDetalle("");
    setTipoSeg("");
    setNuevoRadicado(false);
    setBusy(false);
    qc.invalidateQueries({ queryKey: ["seguimientos-caso", casoId] });
    qc.invalidateQueries({ queryKey: ["remisiones"] });
    qc.invalidateQueries({ queryKey: ["domiciliarios"] });
    qc.invalidateQueries({ queryKey: ["referencia-interna"] });
    qc.invalidateQueries({ queryKey: ["pendientes-rem"] });
    qc.invalidateQueries({ queryKey: ["seguimientos-ult"] });
  };

  // Guarda únicamente la evolución por especialidad, sin exigir tipo de seguimiento.
  const guardarEvolucion = async () => {
    if (!tabla) return;
    if (especialidadesList.length === 0) {
      toast.error("No hay especialidades tratantes registradas en este caso.");
      return;
    }
    setBusyEvo(true);
    const { error } = await supabase
      .from(tabla as "remisiones")
      .update({ evolucion: evolucionCalc, evolucion_detalle: JSON.stringify(evoDetalle) })
      .eq("id", casoId);
    if (error) {
      toast.error(error.message);
      setBusyEvo(false);
      return;
    }
    toast.success("Evolución guardada");
    setBusyEvo(false);
    qc.invalidateQueries({ queryKey: ["remisiones"] });
    qc.invalidateQueries({ queryKey: ["domiciliarios"] });
    qc.invalidateQueries({ queryKey: ["referencia-interna"] });
    qc.invalidateQueries({ queryKey: ["pendientes-rem"] });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Seguimiento · {paciente}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Número de radicado */}
          <div className="space-y-1.5">
            <Label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Número de radicado
            </Label>
            {radicadoExistente && !nuevoRadicado && !noAplicaRadicado ? (
              <div className="flex items-center justify-between gap-2 rounded-md border border-border bg-muted/40 px-3 py-2">
                <span className="text-sm font-medium">{radicadoExistente}</span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="rounded-full"
                  onClick={() => setNuevoRadicado(true)}
                >
                  Agregar nuevo radicado
                </Button>
              </div>
            ) : (
              <Input
                value={radicado}
                onChange={(e) => setRadicado(e.target.value)}
                placeholder="Ej. 2026-000123"
                disabled={noAplicaRadicado}
              />
            )}
            {/* "No aplica" solo cuando aún no hay radicado generado/guardado. */}
            {!radicadoExistente && (
              <label className="flex items-center gap-2 pt-1 text-xs text-muted-foreground">
                <Checkbox
                  checked={noAplicaRadicado}
                  onCheckedChange={(v) => setNoAplicaRadicado(!!v)}
                />
                No aplica (esta EPS no genera radicado)
              </label>
            )}
          </div>

          <div className="space-y-1.5">
            <Label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Tipo de seguimiento
            </Label>
            <Select value={tipoSeg} onValueChange={setTipoSeg}>
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar…" />
              </SelectTrigger>
              <SelectContent>
                {TIPOS_SEG.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Evolución diaria por especialidad */}
          <div className="space-y-2 rounded-lg border border-border p-3">
            <div className="flex items-center justify-between">
              <Label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Evolución diaria
              </Label>
              <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold ${metaCalc.chip}`}>
                <span className={`h-2 w-2 rounded-full ${metaCalc.dot}`} />
                {metaCalc.label}
              </span>
            </div>
            {especialidadesList.length === 0 ? (
              <p className="py-2 text-center text-xs italic text-muted-foreground">
                No hay especialidades destino registradas en este caso.
              </p>
            ) : (
              <div className="space-y-2">
                <div className="grid grid-cols-[1fr_auto_auto] items-center gap-x-3 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  <span>Especialidad</span>
                  <span className="text-center">Índigo</span>
                  <span className="text-center">EAPB</span>
                </div>
                {especialidadesList.map((esp) => (
                  <div key={esp} className="grid grid-cols-[1fr_auto_auto] items-center gap-x-3">
                    <span className="truncate text-sm text-foreground">{esp}</span>
                    <div className="flex w-12 justify-center">
                      <Checkbox
                        checked={!!evoDetalle[esp]?.indigo}
                        onCheckedChange={() => toggleEvo(esp, "indigo")}
                      />
                    </div>
                    <div className="flex w-12 justify-center">
                      <Checkbox
                        checked={!!evoDetalle[esp]?.eapb}
                        onCheckedChange={() => toggleEvo(esp, "eapb")}
                      />
                    </div>
                  </div>
                ))}
                <p className="pt-1 text-[10px] text-muted-foreground">
                  Índigo = evolucionada en el sistema · EAPB = enviada a la aseguradora por correo/plataforma.
                </p>
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Detalle del seguimiento
            </Label>
            <Textarea value={detalle} onChange={(e) => setDetalle(e.target.value)} rows={3} />
          </div>

          <Button className="w-full rounded-full" disabled={busy} onClick={guardar}>
            {busy ? "Guardando…" : "Registrar seguimiento"}
          </Button>

          {/* Historial: solo los 2 últimos seguimientos */}
          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Últimos seguimientos
            </p>
            {(historial?.length ?? 0) === 0 ? (
              <p className="rounded-md border border-dashed border-border py-6 text-center text-sm italic text-muted-foreground">
                Sin seguimientos registrados.
              </p>
            ) : (
              <div className="space-y-2">
                {historial!.slice(0, 2).map((h) => (
                  <div key={h.id} className="rounded-lg border border-border bg-card p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-foreground">{h.tipo_seguimiento || "Seguimiento"}</span>
                      <span className="text-[11px] text-muted-foreground">{fmtFechaHora(h.created_at)}</span>
                    </div>
                    {h.detalle && <p className="mt-1 text-xs text-muted-foreground">{h.detalle}</p>}
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {h.radicado ? `Radicado ${h.radicado} · ` : ""}
                      {h.nombre_usuario || "—"}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
