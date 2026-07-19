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
// Diálogo de creación / edición de una LISTA DE CHEQUEO.
// - Al crear también siembra una versión 1 en BORRADOR sin ítems.
// - El editor de ítems sigue en el panel principal (ChecklistsPanel).
// ============================================================

type Modo = "crear" | "editar";

export interface ChecklistFormValue {
  id?: string;
  codigo: string;
  nombre: string;
  modulo: string;
  activo?: boolean;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  modo: Modo;
  inicial?: ChecklistFormValue | null;
}

const MODULOS = ["SALIENTES", "ENTRANTES", "PHD", "TURNO", "RED", "COORDINACION", "GENERAL"];

export function ChecklistFormDialog({ open, onOpenChange, modo, inicial }: Props) {
  const qc = useQueryClient();
  const [codigo, setCodigo] = useState("");
  const [nombre, setNombre] = useState("");
  const [modulo, setModulo] = useState("GENERAL");
  const [descripcion, setDescripcion] = useState("");
  const [activo, setActivo] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setCodigo(inicial?.codigo ?? "");
    setNombre(inicial?.nombre ?? "");
    setModulo(inicial?.modulo ?? "GENERAL");
    setDescripcion(inicial?.descripcion ?? "");
    setActivo(inicial?.activo ?? true);
  }, [open, inicial]);

  const guardar = async () => {
    if (!codigo.trim() || !nombre.trim()) {
      toast.error("Código y nombre son obligatorios.");
      return;
    }
    setSaving(true);
    try {
      if (modo === "crear") {
        const { data: created, error } = await supabase
          .from("checklists")
          .insert({
            codigo: codigo.trim().toUpperCase(),
            nombre: nombre.trim().toUpperCase(),
            modulo: modulo.toUpperCase(),
            descripcion: descripcion.trim() || null,
            activo,
            estado_revision: "BORRADOR",
          })
          .select("id")
          .single();
        if (error) throw error;
        // Siembra versión 1 vacía
        const { error: eVer } = await supabase.from("checklist_versiones").insert({
          checklist_id: created!.id,
          version: 1,
          estado: "BORRADOR",
          items: [],
        });
        if (eVer) throw eVer;
        toast.success("Lista creada con versión 1 en borrador.");
      } else {
        if (!inicial?.id) throw new Error("Falta identificador.");
        const { error } = await supabase
          .from("checklists")
          .update({
            nombre: nombre.trim().toUpperCase(),
            modulo: modulo.toUpperCase(),
            descripcion: descripcion.trim() || null,
            activo,
          })
          .eq("id", inicial.id);
        if (error) throw error;
        toast.success("Lista actualizada.");
      }
      qc.invalidateQueries({ queryKey: ["cm-checklists"] });
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo guardar.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{modo === "crear" ? "Nueva lista de chequeo" : "Editar lista de chequeo"}</DialogTitle>
          <DialogDescription>
            {modo === "crear"
              ? "Se creará una versión 1 en borrador. Los ítems se editan en el panel principal."
              : "Los ítems y versiones se gestionan en el panel principal."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1">
            <label className="text-xs font-medium">Código *</label>
            <Input
              value={codigo}
              onChange={(e) => setCodigo(e.target.value.toUpperCase())}
              placeholder="EJ. TURNO_CIERRE"
              disabled={modo === "editar"}
              maxLength={64}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium">Nombre *</label>
            <Input value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={140} />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium">Módulo</label>
            <Select value={modulo} onValueChange={setModulo}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {MODULOS.map((m) => (<SelectItem key={m} value={m}>{m}</SelectItem>))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium">Descripción</label>
            <Textarea value={descripcion} onChange={(e) => setDescripcion(e.target.value)} rows={2} />
          </div>
          {modo === "editar" && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={activo} onChange={(e) => setActivo(e.target.checked)} />
              Activa
            </label>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
          <Button onClick={guardar} disabled={saving}>{saving ? "Guardando..." : "Guardar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
