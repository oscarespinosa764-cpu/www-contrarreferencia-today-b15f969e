import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { evolucionMeta, fmtFechaHora, normEvolucion, type EvolucionEstado } from "@/lib/remisiones-utils";
import { toast } from "sonner";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  casoId: string;
  tipoCaso: string;
  paciente: string;
  evolucionActual?: string | null;
  /** Tabla a actualizar para la evolución del caso (remisiones, domiciliarios, etc.). */
  tabla?: string;
};

const TIPOS_SEG = [
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
  evolucionActual,
  tabla,
}: Props) {
  const qc = useQueryClient();
  const [nuevoRadicado, setNuevoRadicado] = useState(false);
  const [radicado, setRadicado] = useState("");
  const [tipoSeg, setTipoSeg] = useState("");
  const [detalle, setDetalle] = useState("");
  const [evolucion, setEvolucion] = useState<EvolucionEstado>(normEvolucion(evolucionActual));
  const [busy, setBusy] = useState(false);

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

  const radicadoExistente = (historial ?? []).find((h) => h.radicado)?.radicado ?? "";
  const radicadoEnUso = nuevoRadicado || !radicadoExistente ? radicado : radicadoExistente;

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
      await supabase
        .from(tabla as "remisiones")
        .update({ evolucion })
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
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Seguimiento · {paciente}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Número de radicado
            </Label>
            {radicadoExistente && !nuevoRadicado ? (
              <div className="flex items-center justify-between gap-2 rounded-md border border-border bg-muted/40 px-3 py-2">
                <span className="text-sm font-medium">{radicadoExistente}</span>
                <Button type="button" variant="ghost" size="sm" onClick={() => setNuevoRadicado(true)}>
                  Agregar nuevo radicado
                </Button>
              </div>
            ) : (
              <Input
                value={radicado}
                onChange={(e) => setRadicado(e.target.value)}
                placeholder="Ej. 2026-000123"
              />
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
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
            <div className="space-y-1.5">
              <Label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Evolución diaria
              </Label>
              <Select value={evolucion} onValueChange={(v) => setEvolucion(v as EvolucionEstado)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sin">🔴 Sin evolucionar</SelectItem>
                  <SelectItem value="parcial">🟡 Evolución parcial</SelectItem>
                  <SelectItem value="completo">🟢 Evolucionado</SelectItem>
                </SelectContent>
              </Select>
            </div>
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

          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Historial de seguimientos
            </p>
            {(historial?.length ?? 0) === 0 ? (
              <p className="rounded-md border border-dashed border-border py-6 text-center text-sm italic text-muted-foreground">
                Sin seguimientos registrados.
              </p>
            ) : (
              <div className="space-y-2">
                {historial!.map((h) => {
                  const meta = evolucionMeta[normEvolucion(evolucion)];
                  return (
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
                      <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-bold ${meta.chip}`}>
                        {meta.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
