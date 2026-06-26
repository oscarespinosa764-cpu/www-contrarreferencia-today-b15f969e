import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/backend-client";
import { useAuth } from "@/lib/auth";
import { registrarAuditoria } from "@/lib/auditoria.functions";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Plus, Pencil } from "lucide-react";
import { toast } from "sonner";
import { minutosEntreHoras, type ShiftType } from "@/lib/cuadro-turno-utils";

export function ConfiguracionPanel() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [edit, setEdit] = useState<Partial<ShiftType> | null>(null);

  const { data: tipos = [] } = useQuery({
    queryKey: ["shift-types"],
    queryFn: async () => {
      const { data, error } = await supabase.from("shift_types").select("*").order("code");
      if (error) throw error;
      return (data ?? []) as unknown as ShiftType[];
    },
  });

  const save = async () => {
    if (!edit?.code?.trim()) return toast.error("El código es obligatorio.");
    const horas = edit.start_time && edit.end_time
      ? Math.round((minutosEntreHoras(edit.start_time, edit.end_time) / 60) * 100) / 100
      : Number(edit.hours) || 0;
    const payload = {
      code: edit.code.trim().toUpperCase(),
      name: edit.name || "",
      start_time: edit.start_time || null,
      end_time: edit.end_time || null,
      hours: horas,
      color: edit.color || "#64748b",
      active: edit.active ?? true,
      observation: edit.observation || null,
    };
    try {
      if (edit.id) {
        const { error } = await supabase.from("shift_types").update(payload).eq("id", edit.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("shift_types").insert({ ...payload, created_by: user!.id });
        if (error) throw error;
      }
      registrarAuditoria({ data: { accion: edit.id ? "CONVENCION_EDITADA" : "CONVENCION_CREADA", modulo: "cuadro_turno", tabla: "shift_types", resultado: "exito" } }).catch(() => {});
      toast.success("Convención guardada.");
      setEdit(null);
      qc.invalidateQueries({ queryKey: ["shift-types"] });
    } catch (e: any) {
      toast.error(e?.message?.includes("duplicate") ? "Ese código ya existe." : "No se pudo guardar.");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Convenciones de turno</h3>
        <Button size="sm" onClick={() => setEdit({ active: true, color: "#64748b" })}>
          <Plus className="mr-1.5 h-4 w-4" /> Nueva convención
        </Button>
      </div>

      <Card className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Código</TableHead><TableHead>Nombre</TableHead>
              <TableHead>Inicio</TableHead><TableHead>Fin</TableHead>
              <TableHead>Horas</TableHead><TableHead>Color</TableHead>
              <TableHead>Estado</TableHead><TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tipos.map((t) => (
              <TableRow key={t.id}>
                <TableCell className="font-semibold">{t.code}</TableCell>
                <TableCell>{t.name}</TableCell>
                <TableCell>{t.start_time ?? "—"}</TableCell>
                <TableCell>{t.end_time ?? "—"}</TableCell>
                <TableCell>{t.hours}</TableCell>
                <TableCell><span className="inline-block h-4 w-4 rounded" style={{ background: t.color }} /></TableCell>
                <TableCell>{t.active ? "Activo" : "Inactivo"}</TableCell>
                <TableCell><Button variant="ghost" size="icon" onClick={() => setEdit(t)}><Pencil className="h-4 w-4" /></Button></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      {edit && (
        <Dialog open onOpenChange={(v) => !v && setEdit(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>{edit.id ? "Editar" : "Nueva"} convención</DialogTitle></DialogHeader>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><Label className="text-xs">Código</Label><Input value={edit.code ?? ""} onChange={(e) => setEdit({ ...edit, code: e.target.value })} /></div>
              <div><Label className="text-xs">Nombre</Label><Input value={edit.name ?? ""} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></div>
              <div><Label className="text-xs">Hora inicio</Label><Input type="time" value={edit.start_time ?? ""} onChange={(e) => setEdit({ ...edit, start_time: e.target.value })} /></div>
              <div><Label className="text-xs">Hora fin</Label><Input type="time" value={edit.end_time ?? ""} onChange={(e) => setEdit({ ...edit, end_time: e.target.value })} /></div>
              <div><Label className="text-xs">Horas (si no hay horario)</Label><Input type="number" value={edit.hours ?? 0} onChange={(e) => setEdit({ ...edit, hours: Number(e.target.value) })} /></div>
              <div><Label className="text-xs">Color</Label><Input type="color" value={edit.color ?? "#64748b"} onChange={(e) => setEdit({ ...edit, color: e.target.value })} /></div>
              <div className="col-span-2"><Label className="text-xs">Observación</Label><Input value={edit.observation ?? ""} onChange={(e) => setEdit({ ...edit, observation: e.target.value })} /></div>
              <label className="col-span-2 flex items-center gap-2 text-xs"><Switch checked={edit.active ?? true} onCheckedChange={(v) => setEdit({ ...edit, active: v })} /> Activo</label>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEdit(null)}>Cancelar</Button>
              <Button onClick={save}>Guardar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
