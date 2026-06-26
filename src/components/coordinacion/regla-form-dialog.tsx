import { useEffect, useMemo, useState } from "react";
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
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  REGLA_MODULOS,
  NIVELES,
  CONDICIONES,
  condicionMeta,
  camposPorModulo,
  VARIABLES,
  type Regla,
} from "@/lib/avisos-reglas";

export type ReglaFormValues = {
  nombre: string;
  modulo: string;
  tipo_condicion: string;
  campo: string | null;
  valor: string | null;
  horas: number | null;
  nivel: string;
  mensaje: string;
  accion: string | null;
  activo: boolean;
};

export function ReglaFormDialog({
  open,
  onOpenChange,
  editing,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: Regla | null;
  onSubmit: (values: ReglaFormValues, id?: string) => Promise<boolean>;
}) {
  const [nombre, setNombre] = useState("");
  const [modulo, setModulo] = useState("remisiones");
  const [tipo, setTipo] = useState("HORAS_ABIERTO");
  const [campo, setCampo] = useState("");
  const [valor, setValor] = useState("");
  const [horas, setHoras] = useState("");
  const [nivel, setNivel] = useState("ALTO");
  const [mensaje, setMensaje] = useState("");
  const [accion, setAccion] = useState("");
  const [activo, setActivo] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setNombre(editing?.nombre ?? "");
      setModulo(editing?.modulo ?? "remisiones");
      setTipo(editing?.tipo_condicion ?? "HORAS_ABIERTO");
      setCampo(editing?.campo ?? "");
      setValor(editing?.valor ?? "");
      setHoras(editing?.horas != null ? String(editing.horas) : "");
      setNivel(editing?.nivel ?? "ALTO");
      setMensaje(editing?.mensaje ?? "");
      setAccion(editing?.accion ?? "");
      setActivo(editing?.activo ?? true);
    }
  }, [open, editing]);

  const meta = condicionMeta(tipo);
  const campos = useMemo(() => camposPorModulo(modulo), [modulo]);

  const guardar = async () => {
    if (!nombre.trim()) return toast.error("El nombre de la regla es obligatorio.");
    if (!modulo) return toast.error("El módulo es obligatorio.");
    if (!nivel) return toast.error("El nivel es obligatorio.");
    if (!tipo) return toast.error("El tipo de condición es obligatorio.");
    if (meta?.needsHoras && (!horas || Number(horas) <= 0)) {
      return toast.error("Indica las horas para esta condición.");
    }
    if (meta?.needsCampo && !campo.trim()) {
      return toast.error("Selecciona el campo a evaluar.");
    }
    if (meta?.needsValor && !valor.trim()) {
      return toast.error("Indica el valor esperado.");
    }
    if (!mensaje.trim()) return toast.error("El mensaje del aviso es obligatorio.");

    setSaving(true);
    const ok = await onSubmit(
      {
        nombre: nombre.trim(),
        modulo,
        tipo_condicion: tipo,
        campo: meta?.needsCampo ? campo.trim() : campo.trim() || null,
        valor: meta?.needsValor ? valor.trim() : valor.trim() || null,
        horas: meta?.needsHoras ? Number(horas) : null,
        nivel,
        mensaje: mensaje.trim(),
        accion: accion.trim() || null,
        activo,
      },
      editing?.id,
    );
    setSaving(false);
    if (ok) onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? "Editar regla operativa" : "Nueva regla operativa"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="r-nombre">Nombre de la regla *</Label>
            <Input
              id="r-nombre"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Ej: Remisión sin gestión mayor a 4 horas"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Módulo *</Label>
              <Select value={modulo} onValueChange={setModulo}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {REGLA_MODULOS.map((m) => (
                    <SelectItem key={m.code} value={m.code}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Nivel *</Label>
              <Select value={nivel} onValueChange={setNivel}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {NIVELES.map((n) => (
                    <SelectItem key={n} value={n}>
                      {n}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Tipo de condición *</Label>
              <Select value={tipo} onValueChange={setTipo}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CONDICIONES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {meta?.needsHoras && (
              <div className="space-y-1.5">
                <Label htmlFor="r-horas">Horas *</Label>
                <Input
                  id="r-horas"
                  type="number"
                  min={1}
                  value={horas}
                  onChange={(e) => setHoras(e.target.value)}
                />
              </div>
            )}
          </div>

          {(meta?.needsCampo || meta?.needsValor) && (
            <div className="grid gap-3 sm:grid-cols-2">
              {meta?.needsCampo && (
                <div className="space-y-1.5">
                  <Label>Campo *</Label>
                  <Select value={campo} onValueChange={setCampo}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecciona campo" />
                    </SelectTrigger>
                    <SelectContent>
                      {campos.map((c) => (
                        <SelectItem key={c} value={c}>
                          {c}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {meta?.needsValor && (
                <div className="space-y-1.5">
                  <Label htmlFor="r-valor">Valor *</Label>
                  <Input
                    id="r-valor"
                    value={valor}
                    onChange={(e) => setValor(e.target.value)}
                    placeholder="Ej: PENDIENTE ACEPTACION, ALTA…"
                  />
                </div>
              )}
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="r-mensaje">Mensaje del aviso *</Label>
            <Textarea
              id="r-mensaje"
              rows={2}
              value={mensaje}
              onChange={(e) => setMensaje(e.target.value)}
              placeholder="{PACIENTE} lleva {HORAS} pendiente por aceptación."
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="r-accion">Acción sugerida</Label>
            <Textarea
              id="r-accion"
              rows={2}
              value={accion}
              onChange={(e) => setAccion(e.target.value)}
              placeholder="Revisar respuesta de red y documentar seguimiento."
            />
          </div>

          <div className="rounded-lg border border-border bg-muted/40 p-2 text-[11px] text-muted-foreground">
            <span className="font-semibold text-foreground">Variables:</span> {VARIABLES.join(" ")}
          </div>

          <label className="flex cursor-pointer items-center justify-between rounded-lg border border-border px-3 py-2">
            <span className="text-sm font-medium text-foreground">Regla activa</span>
            <Switch checked={activo} onCheckedChange={setActivo} />
          </label>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={guardar} disabled={saving}>
            {saving ? "Guardando…" : "Guardar regla"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
