import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DictationTextarea } from "@/components/voz/dictation-textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { AVISO_MODULOS, PRIORIDADES, type Aviso } from "@/lib/avisos-reglas";

export type AvisoFormValues = {
  mensaje: string;
  prioridad: string;
  modulo: string;
  fecha_inicio: string | null;
  fecha_final: string | null;
};

function toInput(v: string | null): string {
  if (!v) return "";
  const d = new Date(v);
  if (isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

export function AvisoFormDialog({
  open,
  onOpenChange,
  editing,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: Aviso | null;
  onSubmit: (values: AvisoFormValues, id?: string) => Promise<boolean>;
}) {
  const [mensaje, setMensaje] = useState("");
  const [prioridad, setPrioridad] = useState("MEDIO");
  const [modulo, setModulo] = useState("General");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setMensaje(editing?.mensaje ?? "");
      setPrioridad(editing?.prioridad ?? "MEDIO");
      setModulo(editing?.modulo ?? "General");
      setDesde(toInput(editing?.fecha_inicio ?? null));
      setHasta(toInput(editing?.fecha_final ?? null));
    }
  }, [open, editing]);

  const guardar = async () => {
    if (!mensaje.trim()) {
      toast.error("El mensaje del aviso es obligatorio.");
      return;
    }
    setSaving(true);
    const ok = await onSubmit(
      {
        mensaje: mensaje.trim(),
        prioridad,
        modulo,
        fecha_inicio: desde ? new Date(desde + "T00:00:00").toISOString() : null,
        fecha_final: hasta ? new Date(hasta + "T23:59:59").toISOString() : null,
      },
      editing?.id,
    );
    setSaving(false);
    if (ok) onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? "Editar aviso operativo" : "Nuevo aviso operativo"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="aviso-msg">Mensaje del aviso *</Label>
            <Textarea
              id="aviso-msg"
              rows={3}
              value={mensaje}
              onChange={(e) => setMensaje(e.target.value)}
              placeholder="Ej: IPS San Rafael sin disponibilidad de UCI hasta nuevo aviso."
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Prioridad</Label>
              <Select value={prioridad} onValueChange={setPrioridad}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRIORIDADES.map((p) => (
                    <SelectItem key={p} value={p}>
                      {p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Módulo</Label>
              <Select value={modulo} onValueChange={setModulo}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {AVISO_MODULOS.map((m) => (
                    <SelectItem key={m} value={m}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="aviso-desde">Vigente desde</Label>
              <Input id="aviso-desde" type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="aviso-hasta">Vigente hasta</Label>
              <Input id="aviso-hasta" type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            Si dejas las fechas vacías, el aviso queda activo de forma indefinida hasta que lo archives.
          </p>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={guardar} disabled={saving}>
            {saving ? "Guardando…" : "Guardar aviso"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
