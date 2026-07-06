import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { registrarAuditoria } from "@/lib/auditoria.functions";
import { guardarFirma, eliminarFirma, getFirmaEstado } from "@/lib/firmas-utils";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { PenLine, Trash2, CheckCircle2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { fmtFechaHora } from "@/lib/cuadro-turno-utils";
import { SignaturePad, type SignaturePadHandle } from "@/components/cuadro-turno/signature-pad";

/**
 * Gestión de la FIRMA DEL FUNCIONARIO dentro de Editar usuario.
 * Reemplaza la antigua subventana "Firmas del personal" del Cuadro de Turno.
 * La firma es un dato sensible: se guarda en almacenamiento privado (bucket
 * `firmas`), nunca se audita su contenido, solo el evento.
 */
export function FirmaFuncionarioSection({
  userId,
  nombre,
}: {
  userId: string;
  nombre: string;
}) {
  const { user, isAdmin } = useAuth();
  const qc = useQueryClient();
  const padRef = useRef<SignaturePadHandle>(null);
  const [padOpen, setPadOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);

  const { data: estado } = useQuery({
    queryKey: ["firma-estado", userId],
    queryFn: () => getFirmaEstado(userId),
  });

  const registrada = estado?.registrada ?? false;

  const guardar = async () => {
    if (!user) return;
    if (!padRef.current || padRef.current.isEmpty()) return toast.error("Dibuja o carga la firma primero.");
    setSaving(true);
    try {
      await guardarFirma({ userId, uploadedBy: user.id, dataUrl: padRef.current.toDataURL() });
      registrarAuditoria({ data: { accion: registrada ? "FIRMA_REEMPLAZADA" : "FIRMA_REGISTRADA", modulo: "firmas", tabla: "user_signatures", registroId: userId, resultado: "exito" } }).catch(() => {});
      toast.success("Firma guardada (almacenamiento privado).");
      setPadOpen(false);
      qc.invalidateQueries({ queryKey: ["firma-estado", userId] });
    } catch (e) {
      console.error(e);
      toast.error("No se pudo guardar la firma.");
    } finally {
      setSaving(false);
    }
  };

  const borrar = async () => {
    try {
      const habia = await eliminarFirma(userId);
      if (habia) {
        registrarAuditoria({ data: { accion: "FIRMA_ELIMINADA", modulo: "firmas", tabla: "user_signatures", registroId: userId, resultado: "exito" } }).catch(() => {});
      }
      toast.success("Firma eliminada.");
      setConfirmDel(false);
      qc.invalidateQueries({ queryKey: ["firma-estado", userId] });
    } catch (e) {
      console.error(e);
      toast.error("No se pudo eliminar la firma.");
    }
  };

  return (
    <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-3">
      <Label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
        Firma del funcionario
      </Label>
      <div className="flex items-center gap-2 text-sm">
        {registrada ? (
          <span className="flex items-center gap-1 font-medium text-status-green">
            <CheckCircle2 className="h-4 w-4" /> Registrada
          </span>
        ) : (
          <span className="flex items-center gap-1 font-medium text-status-amber">
            <XCircle className="h-4 w-4" /> Sin firma
          </span>
        )}
        {estado?.updatedAt && (
          <span className="text-xs text-muted-foreground">· {fmtFechaHora(estado.updatedAt)}</span>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => setPadOpen(true)}>
          <PenLine className="mr-1.5 h-3.5 w-3.5" /> {registrada ? "Reemplazar firma" : "Registrar firma"}
        </Button>
        {registrada && isAdmin && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="border-status-red/40 text-status-red hover:bg-status-red/10"
            onClick={() => setConfirmDel(true)}
          >
            <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Eliminar
          </Button>
        )}
      </div>
      <p className="text-[11px] text-muted-foreground">
        Dibuja la firma o sube una imagen (PNG/JPG/JPEG/WEBP). Se guarda en almacenamiento privado.
      </p>

      <Dialog open={padOpen} onOpenChange={(v) => !saving && setPadOpen(v)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Firma de {nombre || "funcionario"}</DialogTitle>
          </DialogHeader>
          <SignaturePad ref={padRef} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setPadOpen(false)} disabled={saving}>Cancelar</Button>
            <Button onClick={guardar} disabled={saving}>{saving ? "Guardando…" : "Guardar firma"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmDel} onOpenChange={setConfirmDel}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Eliminar firma</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            ¿Confirmas eliminar la firma de {nombre || "este funcionario"}? Podrás registrar una nueva
            cuando quieras.
          </p>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmDel(false)}>Cancelar</Button>
            <Button
              className="bg-status-red text-white hover:bg-status-red/90"
              onClick={borrar}
            >
              Eliminar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
