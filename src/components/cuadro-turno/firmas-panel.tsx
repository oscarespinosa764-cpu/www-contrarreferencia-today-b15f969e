import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/backend-client";
import { useAuth } from "@/lib/auth";
import { registrarAuditoria } from "@/lib/auditoria.functions";
import { guardarFirma } from "@/lib/firmas-utils";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { PenLine } from "lucide-react";
import { toast } from "sonner";
import { fmtFechaHora } from "@/lib/cuadro-turno-utils";
import { SignaturePad, type SignaturePadHandle } from "./signature-pad";

interface Persona {
  user_id: string;
  nombre: string | null;
  cargo: string | null;
  firma_id: string | null;
  firma_at: string | null;
}

export function FirmasPanel() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const padRef = useRef<SignaturePadHandle>(null);
  const [target, setTarget] = useState<Persona | null>(null);
  const [saving, setSaving] = useState(false);

  const { data: personas = [] } = useQuery({
    queryKey: ["firmas-personal"],
    queryFn: async () => {
      const [{ data: profiles }, { data: firmas }] = await Promise.all([
        supabase.from("profiles").select("user_id, nombre, cargo, activo").eq("activo", true),
        supabase.from("user_signatures").select("user_id, id, updated_at").eq("active", true),
      ]);
      const map = new Map((firmas ?? []).map((f) => [f.user_id, f]));
      return (profiles ?? []).map((p) => ({
        user_id: p.user_id, nombre: p.nombre, cargo: p.cargo,
        firma_id: map.get(p.user_id)?.id ?? null,
        firma_at: map.get(p.user_id)?.updated_at ?? null,
      })) as Persona[];
    },
  });

  const guardar = async () => {
    if (!target || !user) return;
    if (!padRef.current || padRef.current.isEmpty()) return toast.error("Dibuja la firma primero.");
    setSaving(true);
    try {
      await guardarFirma({ userId: target.user_id, uploadedBy: user.id, dataUrl: padRef.current.toDataURL() });
      registrarAuditoria({ data: { accion: "FIRMA_REGISTRADA", modulo: "firmas", tabla: "user_signatures", registroId: target.user_id, resultado: "exito" } }).catch(() => {});
      toast.success("Firma registrada (almacenamiento privado).");
      setTarget(null);
      qc.invalidateQueries({ queryKey: ["firmas-personal"] });
    } catch (e) { console.error(e); toast.error("No se pudo guardar la firma."); } finally { setSaving(false); }
  };

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Las firmas se guardan en almacenamiento privado y solo son visibles para el dueño y administradores.
      </p>
      <Card className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Colaborador</TableHead><TableHead>Cargo</TableHead>
              <TableHead>Firma</TableHead><TableHead>Actualizada</TableHead><TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {personas.map((p) => (
              <TableRow key={p.user_id}>
                <TableCell className="font-medium">{p.nombre || "—"}</TableCell>
                <TableCell>{p.cargo || "—"}</TableCell>
                <TableCell>{p.firma_id ? <span className="text-emerald-600">Registrada</span> : <span className="text-amber-600">Sin firma</span>}</TableCell>
                <TableCell>{p.firma_at ? fmtFechaHora(p.firma_at) : "—"}</TableCell>
                <TableCell>
                  <Button variant="ghost" size="sm" onClick={() => setTarget(p)}>
                    <PenLine className="mr-1 h-4 w-4" /> {p.firma_id ? "Reemplazar" : "Registrar"}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      {target && (
        <Dialog open onOpenChange={(v) => !v && setTarget(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>Firma de {target.nombre}</DialogTitle></DialogHeader>
            <SignaturePad ref={padRef} />
            <DialogFooter>
              <Button variant="outline" onClick={() => setTarget(null)}>Cancelar</Button>
              <Button onClick={guardar} disabled={saving}>{saving ? "Guardando…" : "Guardar firma"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
