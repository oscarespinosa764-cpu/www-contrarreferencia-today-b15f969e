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
import { AlertTriangle, MapPin } from "lucide-react";
import {
  DICTATION_MODULOS,
  DICTATION_IDIOMAS,
  DICTATION_MODOS,
  DICTATION_TIPOS,
  DICTATION_REGISTRY,
  pareceCampoSensible,
  type DictationInsertMode,
  type DictationFieldType,
} from "@/lib/dictation-registry";

export interface PuntoDictadoValues {
  key: string;
  modulo: string;
  ventana: string;
  subventana: string;
  nombre_campo: string;
  selector: string | null;
  tipo_campo: DictationFieldType;
  modo_insercion: DictationInsertMode;
  idioma: string;
  activo: boolean;
  roles_permitidos: string[];
  texto_ayuda: string | null;
}

const ROLES: { value: string; label: string }[] = [
  { value: "admin", label: "Admin" },
  { value: "operativa", label: "Operativa" },
  { value: "temporal", label: "Temporal" },
];

export function DictadoFormDialog({
  open,
  onOpenChange,
  editing,
  isRegistro,
  onSubmit,
  onTest,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: PuntoDictadoValues | null;
  /** True si el punto proviene del registro del sistema (la clave no se edita). */
  isRegistro: boolean;
  onSubmit: (values: PuntoDictadoValues) => Promise<boolean>;
  onTest: (key: string, selector?: string | null) => void;
}) {
  const [v, setV] = useState<PuntoDictadoValues>(empty());
  const [advanced, setAdvanced] = useState(false);
  const [saving, setSaving] = useState(false);

  function empty(): PuntoDictadoValues {
    return {
      key: "",
      modulo: "Remisiones salientes",
      ventana: "",
      subventana: "",
      nombre_campo: "",
      selector: null,
      tipo_campo: "textarea",
      modo_insercion: "append",
      idioma: "es-CO",
      activo: true,
      roles_permitidos: ["admin", "operativa"],
      texto_ayuda: null,
    };
  }

  useEffect(() => {
    if (open) {
      setV(editing ?? empty());
      setAdvanced(!!editing?.selector);
    }
  }, [open, editing]);

  const set = <K extends keyof PuntoDictadoValues>(k: K, val: PuntoDictadoValues[K]) =>
    setV((s) => ({ ...s, [k]: val }));

  const toggleRole = (role: string) =>
    setV((s) => ({
      ...s,
      roles_permitidos: s.roles_permitidos.includes(role)
        ? s.roles_permitidos.filter((r) => r !== role)
        : [...s.roles_permitidos, role],
    }));

  const registryKeysDisponibles = DICTATION_REGISTRY.map((r) => r.key);

  const prefillFromRegistry = (key: string) => {
    const item = DICTATION_REGISTRY.find((r) => r.key === key);
    if (!item) return;
    setV({
      key: item.key,
      modulo: item.modulo,
      ventana: item.ventana,
      subventana: item.subventana,
      nombre_campo: item.nombre_campo,
      selector: item.selector,
      tipo_campo: item.tipo_campo,
      modo_insercion: item.modo_insercion,
      idioma: item.idioma,
      activo: true,
      roles_permitidos: item.roles_permitidos,
      texto_ayuda: null,
    });
  };

  const guardar = async () => {
    if (!v.key.trim()) return toast.error("La clave del campo (key) es obligatoria.");
    if (!v.modulo) return toast.error("El módulo es obligatorio.");
    if (!v.nombre_campo.trim()) return toast.error("El nombre visible del campo es obligatorio.");
    if (v.roles_permitidos.length === 0)
      return toast.error("Seleccione al menos un rol permitido.");

    if (pareceCampoSensible(v.nombre_campo, v.key)) {
      const ok = window.confirm(
        "No se recomienda activar dictado en campos cortos o identificadores (documento, teléfono, código, radicado, fecha…). ¿Desea continuar?",
      );
      if (!ok) return;
    }

    setSaving(true);
    const ok = await onSubmit({
      ...v,
      key: v.key.trim(),
      nombre_campo: v.nombre_campo.trim(),
      selector: advanced ? (v.selector?.trim() || null) : null,
      texto_ayuda: v.texto_ayuda?.trim() || null,
    });
    setSaving(false);
    if (ok) onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Configurar punto de dictado</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {!editing && (
            <div className="space-y-1.5 rounded-lg border border-border bg-muted/40 p-3">
              <Label>Usar campo registrado del sistema (recomendado)</Label>
              <Select onValueChange={prefillFromRegistry}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccione un campo conocido…" />
                </SelectTrigger>
                <SelectContent>
                  {registryKeysDisponibles.map((k) => (
                    <SelectItem key={k} value={k}>
                      {k}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">
                Precarga la ubicación y el selector de un campo ya preparado para dictado.
              </p>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Módulo *</Label>
              <Select value={v.modulo} onValueChange={(x) => set("modulo", x)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DICTATION_MODULOS.map((m) => (
                    <SelectItem key={m} value={m}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Nombre visible del campo *</Label>
              <Input
                value={v.nombre_campo}
                onChange={(e) => set("nombre_campo", e.target.value)}
                placeholder="Observaciones"
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Ventana</Label>
              <Input
                value={v.ventana}
                onChange={(e) => set("ventana", e.target.value)}
                placeholder="Dashboard Operativo Salientes"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Subventana</Label>
              <Input
                value={v.subventana}
                onChange={(e) => set("subventana", e.target.value)}
                placeholder="Seguimiento"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Clave del campo (key) *</Label>
            <Input
              value={v.key}
              onChange={(e) => set("key", e.target.value)}
              disabled={isRegistro || !!editing}
              placeholder="modulo.ventana.campo"
            />
            {(isRegistro || !!editing) && (
              <p className="text-[11px] text-muted-foreground">
                La clave no se puede cambiar en puntos existentes.
              </p>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label>Tipo de campo</Label>
              <Select value={v.tipo_campo} onValueChange={(x) => set("tipo_campo", x as DictationFieldType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DICTATION_TIPOS.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Modo de inserción</Label>
              <Select
                value={v.modo_insercion}
                onValueChange={(x) => set("modo_insercion", x as DictationInsertMode)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DICTATION_MODOS.map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Idioma</Label>
              <Select value={v.idioma} onValueChange={(x) => set("idioma", x)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DICTATION_IDIOMAS.map((i) => (
                    <SelectItem key={i.value} value={i.value}>
                      {i.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2 rounded-lg border border-border p-3">
            <label className="flex cursor-pointer items-center justify-between">
              <span className="text-sm font-medium">Selector CSS avanzado</span>
              <Switch checked={advanced} onCheckedChange={setAdvanced} />
            </label>
            {advanced && (
              <>
                <Input
                  value={v.selector ?? ""}
                  onChange={(e) => set("selector", e.target.value)}
                  placeholder='[data-dictation-key="..."]'
                />
                <p className="flex items-start gap-1.5 text-[11px] text-status-amber">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  Use el selector avanzado solo si conoce el campo exacto. Si el selector cambia,
                  el botón de dictado podría no aparecer.
                </p>
              </>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Roles permitidos</Label>
            <div className="flex flex-wrap gap-4">
              {ROLES.map((r) => (
                <label key={r.value} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={v.roles_permitidos.includes(r.value)}
                    onCheckedChange={() => toggleRole(r.value)}
                  />
                  {r.label}
                </label>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Texto de ayuda al usuario (opcional)</Label>
            <Input
              value={v.texto_ayuda ?? ""}
              onChange={(e) => set("texto_ayuda", e.target.value)}
              placeholder="Revise el texto transcrito antes de guardar."
            />
          </div>

          <label className="flex cursor-pointer items-center justify-between rounded-lg border border-border px-3 py-2">
            <span className="text-sm font-medium">Punto activo</span>
            <Switch checked={v.activo} onCheckedChange={(x) => set("activo", x)} />
          </label>
        </div>

        <DialogFooter className="flex-wrap gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button
            variant="outline"
            onClick={() => onTest(v.key, advanced ? v.selector : null)}
          >
            <MapPin className="mr-1.5 h-4 w-4" /> Probar ubicación
          </Button>
          <Button onClick={guardar} disabled={saving}>
            {saving ? "Guardando…" : "Guardar configuración"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
