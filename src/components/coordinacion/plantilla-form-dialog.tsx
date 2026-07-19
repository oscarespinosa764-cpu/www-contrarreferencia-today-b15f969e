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
// CRUD de PLANTILLAS del inventario del sistema.
// Crea/edita metadatos. El contenido editable y las versiones
// se gestionan en el detalle del panel.
// ============================================================

type Modo = "crear" | "editar";

export interface PlantillaFormValue {
  id?: string;
  codigo: string;
  nombre: string;
  modulo: string;
  formato: string;
  origen: string;
  generador?: string | null;
  estado: string;
  version: string;
  dependencia?: string | null;
  editable_nivel: "SOLO_LECTURA" | "PARCIAL" | "COMPLETA";
  notas?: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  modo: Modo;
  inicial?: PlantillaFormValue | null;
}

const MODULOS = ["SALIENTES", "ENTRANTES", "PHD", "TURNO", "RED", "COORDINACION", "GENERAL"];
const FORMATOS = ["PDF", "XLSX", "DOCX", "HTML", "TEXTO", "MENSAJE"];
const ORIGENES = ["CODIGO", "TH", "ADMINISTRATIVO", "OPERATIVO", "REGULATORIO"];
const NIVELES: Array<PlantillaFormValue["editable_nivel"]> = ["SOLO_LECTURA", "PARCIAL", "COMPLETA"];
const ESTADOS = ["ACTIVA", "INACTIVA", "EN_REVISION", "BORRADOR"];

export function PlantillaFormDialog({ open, onOpenChange, modo, inicial }: Props) {
  const qc = useQueryClient();
  const [v, setV] = useState<PlantillaFormValue>({
    codigo: "", nombre: "", modulo: "GENERAL", formato: "PDF", origen: "CODIGO",
    generador: "", estado: "ACTIVA", version: "1.0", dependencia: "",
    editable_nivel: "PARCIAL", notas: "",
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setV({
      codigo: inicial?.codigo ?? "",
      nombre: inicial?.nombre ?? "",
      modulo: inicial?.modulo ?? "GENERAL",
      formato: inicial?.formato ?? "PDF",
      origen: inicial?.origen ?? "CODIGO",
      generador: inicial?.generador ?? "",
      estado: inicial?.estado ?? "ACTIVA",
      version: inicial?.version ?? "1.0",
      dependencia: inicial?.dependencia ?? "",
      editable_nivel: inicial?.editable_nivel ?? "PARCIAL",
      notas: inicial?.notas ?? "",
      id: inicial?.id,
    });
  }, [open, inicial]);

  const set = <K extends keyof PlantillaFormValue>(k: K, val: PlantillaFormValue[K]) =>
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
        nombre: v.nombre.trim().toUpperCase(),
        modulo: v.modulo,
        formato: v.formato,
        origen: v.origen,
        generador: (v.generador ?? "").trim() || null,
        estado: v.estado,
        version: v.version.trim() || "1.0",
        dependencia: (v.dependencia ?? "").trim() || null,
        editable_nivel: v.editable_nivel,
        notas: (v.notas ?? "").trim() || null,
      };
      if (modo === "crear") {
        const { error } = await supabase.from("plantillas_inventario").insert({
          ...payload,
          contenido_editable: {},
          variables_declaradas: [],
          puntos_uso_codigos: [],
        });
        if (error) throw error;
        toast.success("Plantilla registrada.");
      } else {
        if (!inicial?.id) throw new Error("Falta identificador.");
        const { error } = await supabase
          .from("plantillas_inventario")
          .update(payload)
          .eq("id", inicial.id);
        if (error) throw error;
        toast.success("Plantilla actualizada.");
      }
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
          <DialogTitle>{modo === "crear" ? "Nueva plantilla" : "Editar plantilla"}</DialogTitle>
          <DialogDescription>
            Metadatos e integración. El contenido editable y las variables se gestionan en el detalle.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Código *">
            <Input value={v.codigo} onChange={(e) => set("codigo", e.target.value.toUpperCase())}
              placeholder="EJ. SALIENTES_ENTREGA_PDF" disabled={modo === "editar"} />
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
          <Field label="Formato">
            <Select value={v.formato} onValueChange={(x) => set("formato", x)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{FORMATOS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Origen">
            <Select value={v.origen} onValueChange={(x) => set("origen", x)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{ORIGENES.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Nivel editable">
            <Select value={v.editable_nivel} onValueChange={(x) => set("editable_nivel", x as PlantillaFormValue["editable_nivel"])}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{NIVELES.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Estado">
            <Select value={v.estado} onValueChange={(x) => set("estado", x)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{ESTADOS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Versión">
            <Input value={v.version} onChange={(e) => set("version", e.target.value)} placeholder="1.0" />
          </Field>
          <Field label="Generador" className="sm:col-span-2">
            <Input value={v.generador ?? ""} onChange={(e) => set("generador", e.target.value)}
              placeholder="Código o etiqueta del generador (p. ej. generarPDFSalientes)" />
          </Field>
          <Field label="Dependencia" className="sm:col-span-2">
            <Input value={v.dependencia ?? ""} onChange={(e) => set("dependencia", e.target.value)} />
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
