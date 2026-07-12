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
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import type { ReglaCoordDB } from "@/lib/reglas-coordinacion-db";
import { CANALES } from "@/lib/notifications-utils";

export type ReglaCoordFormValues = {
  codigo: string;
  nombre: string;
  descripcion: string | null;
  modulo: string;
  subventana: string;
  evento: string | null;
  condicion: string | null;
  umbral: number | null;
  unidad: string | null;
  prioridad: string;
  activo: boolean;
  notificar_externo: boolean;
  canales: string[];
  requiere_crue: boolean;
};

const SUBVENTANAS = ["ENTRANTES", "SALIENTES"];
const PRIORIDADES = ["MEDIO", "ALTO", "CRITICO"];
const UNIDADES = ["min", "horas", "turnos"];
const CANALES_ACTIVOS = CANALES.filter((c) => c.activo);

function normalizarCodigo(v: string) {
  return v
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, "-")
    .replace(/-+/g, "-");
}

export function ReglaCoordinacionFormDialog({
  open,
  onOpenChange,
  editing,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: ReglaCoordDB | null;
  onSubmit: (values: ReglaCoordFormValues, id?: string) => Promise<boolean>;
}) {
  const [codigo, setCodigo] = useState("");
  const [nombre, setNombre] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [modulo, setModulo] = useState("REMISIONES");
  const [subventana, setSubventana] = useState("ENTRANTES");
  const [evento, setEvento] = useState("");
  const [condicion, setCondicion] = useState("");
  const [tieneUmbral, setTieneUmbral] = useState(false);
  const [umbral, setUmbral] = useState("");
  const [unidad, setUnidad] = useState("horas");
  const [prioridad, setPrioridad] = useState("MEDIO");
  const [activo, setActivo] = useState(true);
  const [notificarExterno, setNotificarExterno] = useState(false);
  const [canales, setCanales] = useState<string[]>([]);
  const [requiereCrue, setRequiereCrue] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setCodigo(editing?.codigo ?? "");
    setNombre(editing?.nombre ?? "");
    setDescripcion(editing?.descripcion ?? "");
    setModulo(editing?.modulo ?? "REMISIONES");
    setSubventana(editing?.subventana ?? "ENTRANTES");
    setEvento(editing?.evento ?? "");
    setCondicion(editing?.condicion ?? "");
    const hasU = editing?.umbral != null && editing?.unidad != null;
    setTieneUmbral(hasU);
    setUmbral(editing?.umbral != null ? String(editing.umbral) : "");
    setUnidad(editing?.unidad ?? "horas");
    setPrioridad(editing?.prioridad ?? "MEDIO");
    setActivo(editing?.activo ?? true);
    setNotificarExterno(editing?.notificar_externo ?? false);
    setCanales(editing?.canales ?? []);
    setRequiereCrue(editing?.requiere_crue ?? false);
  }, [open, editing]);

  const esBase = editing?.es_base ?? false;

  const toggleCanal = (type: string) =>
    setCanales((prev) => (prev.includes(type) ? prev.filter((c) => c !== type) : [...prev, type]));


  const guardar = async () => {
    if (!nombre.trim()) return toast.error("El nombre de la regla es obligatorio.");
    const cod = normalizarCodigo(codigo.trim());
    if (!cod || cod.length < 3) return toast.error("Indica un código válido (ej: ALT-ENT-...).");
    if (tieneUmbral && (umbral === "" || Number.isNaN(Number(umbral)))) {
      return toast.error("Indica un umbral numérico válido.");
    }
    if (notificarExterno && canales.length === 0) {
      return toast.error("Selecciona al menos un canal externo o desactiva la notificación.");
    }


    setSaving(true);
    const ok = await onSubmit(
      {
        codigo: cod,
        nombre: nombre.trim(),
        descripcion: descripcion.trim() || null,
        modulo: modulo.trim() || "REMISIONES",
        subventana,
        evento: evento.trim() || null,
        condicion: condicion.trim() || null,
        umbral: tieneUmbral ? Number(umbral) : null,
        unidad: tieneUmbral ? unidad : null,
        prioridad,
        activo,
        notificar_externo: notificarExterno,
        canales: notificarExterno ? canales : [],
        requiere_crue: requiereCrue,
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
          <DialogTitle>
            {editing ? "Editar regla de coordinación" : "Nueva regla de coordinación"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="rc-codigo">Código *</Label>
              <Input
                id="rc-codigo"
                value={codigo}
                onChange={(e) => setCodigo(e.target.value)}
                onBlur={(e) => setCodigo(normalizarCodigo(e.target.value))}
                placeholder="ALT-ENT-EJEMPLO"
                disabled={esBase}
              />
              {esBase && (
                <p className="text-[10px] text-muted-foreground">
                  Regla base: el código no se puede cambiar.
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Subventana *</Label>
              <Select value={subventana} onValueChange={setSubventana}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SUBVENTANAS.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s === "ENTRANTES" ? "Entrantes" : "Salientes"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="rc-nombre">Nombre de la regla *</Label>
            <Input
              id="rc-nombre"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Ej: Ingreso tardío posterior a cancelación"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="rc-desc">Descripción</Label>
            <Textarea
              id="rc-desc"
              rows={2}
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              placeholder="Qué situación de coordinación detecta esta alerta."
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="rc-modulo">Módulo</Label>
              <Input
                id="rc-modulo"
                value={modulo}
                onChange={(e) => setModulo(e.target.value)}
                placeholder="REMISIONES"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Prioridad *</Label>
              <Select value={prioridad} onValueChange={setPrioridad}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRIORIDADES.map((p) => (
                    <SelectItem key={p} value={p}>
                      {p === "MEDIO" ? "MEDIA" : p === "ALTO" ? "ALTA" : "CRÍTICA"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="rc-evento">Evento disparador</Label>
              <Input
                id="rc-evento"
                value={evento}
                onChange={(e) => setEvento(e.target.value)}
                placeholder="Ej: Confirmación de ingreso"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rc-cond">Condición</Label>
              <Input
                id="rc-cond"
                value={condicion}
                onChange={(e) => setCondicion(e.target.value)}
                placeholder="Ej: Ingreso posterior a negación"
              />
            </div>
          </div>

          <div className="rounded-lg border border-border p-3">
            <label className="flex cursor-pointer items-center justify-between">
              <span className="text-sm font-medium text-foreground">Umbral temporal</span>
              <Switch checked={tieneUmbral} onCheckedChange={setTieneUmbral} />
            </label>
            {tieneUmbral ? (
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="rc-umbral">Valor *</Label>
                  <Input
                    id="rc-umbral"
                    type="number"
                    min={0}
                    value={umbral}
                    onChange={(e) => setUmbral(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Unidad</Label>
                  <Select value={unidad} onValueChange={setUnidad}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {UNIDADES.map((u) => (
                        <SelectItem key={u} value={u}>
                          {u === "min" ? "Minutos" : u === "horas" ? "Horas" : "Turnos"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            ) : (
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                Sin umbral: la alerta se dispara por el evento inmediato.
              </p>
            )}
          </div>

          <label className="flex cursor-pointer items-center justify-between rounded-lg border border-border px-3 py-2">
            <span className="text-sm font-medium text-foreground">Regla activa</span>
            <Switch checked={activo} onCheckedChange={setActivo} />
          </label>

          <div className="rounded-lg border border-border p-3">
            <label className="flex cursor-pointer items-center justify-between">
              <span className="text-sm font-medium text-foreground">
                Notificar por canales externos
              </span>
              <Switch checked={notificarExterno} onCheckedChange={setNotificarExterno} />
            </label>
            {notificarExterno ? (
              <div className="mt-3 space-y-2">
                <p className="text-[11px] text-muted-foreground">
                  Al generarse la alerta se enviará a los canales seleccionados (configurados en
                  Notificaciones externas). No se duplican credenciales.
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {CANALES_ACTIVOS.map((c) => (
                    <label
                      key={c.type}
                      className="flex cursor-pointer items-center gap-2 rounded-lg border border-border px-3 py-2"
                    >
                      <Checkbox
                        checked={canales.includes(c.type)}
                        onCheckedChange={() => toggleCanal(c.type)}
                      />
                      <span className="text-sm text-foreground">{c.label}</span>
                    </label>
                  ))}
                </div>
                {canales.length === 0 && (
                  <p className="text-[11px] text-status-amber">
                    Selecciona al menos un canal o desactiva la notificación externa.
                  </p>
                )}
              </div>
            ) : (
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                Sin notificación externa: la alerta solo se registra internamente.
              </p>
            )}
          </div>

          <label className="flex cursor-pointer items-center justify-between rounded-lg border border-status-red/30 bg-status-red/5 px-3 py-2">
            <span className="text-sm font-medium text-foreground">Requiere notificación al CRUE</span>
            <Switch checked={requiereCrue} onCheckedChange={setRequiereCrue} />
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
