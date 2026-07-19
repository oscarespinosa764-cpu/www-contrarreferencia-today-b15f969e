import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/lib/backend-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

// ============================================================
// CRUD de PUNTOS DE USO — dónde vive cada plantilla/salida.
// Permite vincular una plantilla del inventario.
// ============================================================

type Modo = "crear" | "editar";

export interface PuntoUsoFormValue {
  id?: string;
  codigo: string;
  nombre: string;
  modulo: string;
  ruta?: string | null;
  ventana?: string | null;
  paso?: string | null;
  evento?: string | null;
  tipo_salida: string;
  plantilla_codigo?: string | null;
  componente_responsable?: string | null;
  estado: string;
  notas?: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  modo: Modo;
  inicial?: PuntoUsoFormValue | null;
  plantillas: Array<{ codigo: string; nombre: string }>;
}

const MODULOS = ["SALIENTES", "ENTRANTES", "PHD", "TURNO", "RED", "COORDINACION", "GENERAL"];
const TIPOS_SALIDA = ["PDF", "XLSX", "DOCX", "HTML", "MENSAJE", "CHECKLIST", "NOTIFICACION"];
const ESTADOS = ["ACTIVO", "INACTIVO", "EN_REVISION"];

const NONE = "__none__";

export function PuntoUsoFormDialog({ open, onOpenChange, modo, inicial, plantillas }: Props) {
  const qc = useQueryClient();
  const [v, setV] = useState<PuntoUsoFormValue>({
    codigo: "", nombre: "", modulo: "GENERAL", ruta: "", ventana: "", paso: "",
    evento: "", tipo_salida: "PDF", plantilla_codigo: null, componente_responsable: "",
    estado: "ACTIVO", notas: "",
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setV({
      codigo: inicial?.codigo ?? "",
      nombre: inicial?.nombre ?? "",
      modulo: inicial?.modulo ?? "GENERAL",
      ruta: inicial?.ruta ?? "",
      ventana: inicial?.ventana ?? "",
      paso: inicial?.paso ?? "",
      evento: inicial?.evento ?? "",
      tipo_salida: inicial?.tipo_salida ?? "PDF",
      plantilla_codigo: inicial?.plantilla_codigo ?? null,
      componente_responsable: inicial?.componente_responsable ?? "",
      estado: inicial?.estado ?? "ACTIVO",
      notas: inicial?.notas ?? "",
      id: inicial?.id,
    });
  }, [open, inicial]);

  const set = <K extends keyof PuntoUsoFormValue>(k: K, val: PuntoUsoFormValue[K]) =>
    setV((prev) => ({ ...prev, [k]: val }));

  const guardar = async () => {
    if (!v.codigo.trim() || !v.nombre.trim()) {
      toast.error("Código y nombre son obligatorios.");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        codigo: v.codigo.trim().toUpperCase(),
        nombre: v.nombre.trim(),
        modulo: v.modulo,
        ruta: (v.ruta ?? "").trim() || null,
        ventana: (v.ventana ?? "").trim() || null,
        paso: (v.paso ?? "").trim() || null,
        evento: (v.evento ?? "").trim() || null,
        tipo_salida: v.tipo_salida,
        plantilla_codigo: v.plantilla_codigo,
        componente_responsable: (v.componente_responsable ?? "").trim() || null,
        estado: v.estado,
        notas: (v.notas ?? "").trim() || null,
      };
      if (modo === "crear") {
        const { error } = await supabase.from("puntos_de_uso").insert({
          ...payload,
          variables_disponibles: [],
        });
        if (error) throw error;
        toast.success("Punto de uso creado.");
      } else {
        if (!inicial?.id) throw new Error("Falta identificador.");
        const { error } = await supabase.from("puntos_de_uso").update(payload).eq("id", inicial.id);
        if (error) throw error;
        toast.success("Punto de uso actualizado.");
      }
      qc.invalidateQueries({ queryKey: ["cm-puntos-uso"] });
      qc.invalidateQueries({ queryKey: ["cm-plantillas-inv"] });
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo guardar.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{modo === "crear" ? "Nuevo punto de uso" : "Editar punto de uso"}</DialogTitle>
          <DialogDescription>Dónde y cuándo se ejecuta esta plantilla dentro del sistema.</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Código *">
            <Input value={v.codigo} onChange={(e) => set("codigo", e.target.value.toUpperCase())}
              disabled={modo === "editar"} placeholder="EJ. SALIENTES_ENTREGA_DOCUMENTAL" />
          </Field>
          <Field label="Nombre *">
            <Input value={v.nombre} onChange={(e) => set("nombre", e.target.value)} />
          </Field>
          <Field label="Módulo">
            <Select value={v.modulo} onValueChange={(x) => set("modulo", x)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{MODULOS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Tipo de salida">
            <Select value={v.tipo_salida} onValueChange={(x) => set("tipo_salida", x)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{TIPOS_SALIDA.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Ruta">
            <Input value={v.ruta ?? ""} onChange={(e) => set("ruta", e.target.value)} placeholder="/salientes" />
          </Field>
          <Field label="Ventana">
            <Input value={v.ventana ?? ""} onChange={(e) => set("ventana", e.target.value)} />
          </Field>
          <Field label="Paso">
            <Input value={v.paso ?? ""} onChange={(e) => set("paso", e.target.value)} />
          </Field>
          <Field label="Evento">
            <Input value={v.evento ?? ""} onChange={(e) => set("evento", e.target.value)} placeholder="onClick, onSubmit..." />
          </Field>
          <Field label="Plantilla vinculada" className="sm:col-span-2">
            <Select
              value={v.plantilla_codigo ?? NONE}
              onValueChange={(x) => set("plantilla_codigo", x === NONE ? null : x)}
            >
              <SelectTrigger><SelectValue placeholder="Sin vincular" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Sin vincular</SelectItem>
                {plantillas.map((p) => (
                  <SelectItem key={p.codigo} value={p.codigo}>{p.codigo} — {p.nombre}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Componente responsable" className="sm:col-span-2">
            <Input value={v.componente_responsable ?? ""} onChange={(e) => set("componente_responsable", e.target.value)} />
          </Field>
          <Field label="Estado">
            <Select value={v.estado} onValueChange={(x) => set("estado", x)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{ESTADOS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Notas" className="sm:col-span-2">
            <Textarea value={v.notas ?? ""} onChange={(e) => set("notas", e.target.value)} rows={2} />
          </Field>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
          <Button onClick={guardar} disabled={saving}>{saving ? "Guardando..." : "Guardar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`space-y-1 ${className ?? ""}`}>
      <label className="text-xs font-medium">{label}</label>
      {children}
    </div>
  );
}
