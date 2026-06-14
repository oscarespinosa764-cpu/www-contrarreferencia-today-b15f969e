import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Loader2, ShieldCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { limpiarDatos, GRUPOS_BORRADO, type GrupoBorradoKey } from "@/lib/borrado.functions";

const GRUPOS = Object.entries(GRUPOS_BORRADO) as [GrupoBorradoKey, { tabla: string; label: string }][];

export function BorradoSeguroDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [sel, setSel] = useState<Set<GrupoBorradoKey>>(new Set());
  const [confirmacion, setConfirmacion] = useState("");
  const [cargando, setCargando] = useState(false);
  const limpiar = useServerFn(limpiarDatos);

  const reset = () => {
    setSel(new Set());
    setConfirmacion("");
  };

  const cerrar = (v: boolean) => {
    if (!v) reset();
    onOpenChange(v);
  };

  const toggle = (k: GrupoBorradoKey) =>
    setSel((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });

  const todos = () => setSel(new Set(GRUPOS.map(([k]) => k)));

  const ejecutar = async () => {
    if (sel.size === 0) return toast.error("Selecciona al menos un grupo de datos.");
    if (confirmacion.trim().toUpperCase() !== "BORRAR") {
      return toast.error('Escribe "BORRAR" para confirmar.');
    }
    setCargando(true);
    try {
      const res = await limpiar({ data: { grupos: Array.from(sel), confirmacion } });
      if (!res.ok) {
        toast.error(res.error ?? "No se pudo completar el borrado.");
        return;
      }
      const total = res.resultados.reduce((a, r) => a + r.eliminadas, 0);
      toast.success(`Borrado completado: ${total} registro(s) eliminado(s).`);
      cerrar(false);
    } catch (e) {
      console.error(e);
      toast.error("Error al ejecutar el borrado.");
    } finally {
      setCargando(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={cerrar}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-status-red">
            <Trash2 className="h-5 w-5" /> Zona de borrado seguro
          </DialogTitle>
          <DialogDescription>
            Vacía solo los datos transaccionales seleccionados. Esta acción no se puede deshacer.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-start gap-2 rounded-xl border border-status-green/30 bg-status-green/10 px-3 py-2 text-xs text-foreground">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-status-green" />
          <span>
            <strong>Se preservan siempre</strong> catálogos, plantillas, usuarios, roles, reglas,
            red e indicadores. Nunca se tocan.
          </span>
        </div>

        <div className="flex items-center justify-between">
          <Label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
            Datos a vaciar ({sel.size})
          </Label>
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={todos}>
            Seleccionar todos
          </Button>
        </div>

        <div className="max-h-[42vh] space-y-1.5 overflow-y-auto pr-1">
          {GRUPOS.map(([k, def]) => (
            <label
              key={k}
              className="flex cursor-pointer items-center gap-3 rounded-xl border border-border bg-card px-3 py-2 hover:bg-muted/60"
            >
              <Checkbox checked={sel.has(k)} onCheckedChange={() => toggle(k)} />
              <span className="text-sm text-foreground">{def.label}</span>
            </label>
          ))}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="confirma" className="text-xs">
            Para confirmar, escribe <strong>BORRAR</strong>
          </Label>
          <Input
            id="confirma"
            value={confirmacion}
            onChange={(e) => setConfirmacion(e.target.value)}
            placeholder="BORRAR"
          />
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => cerrar(false)} disabled={cargando}>
            Cancelar
          </Button>
          <Button
            variant="destructive"
            onClick={ejecutar}
            disabled={cargando || sel.size === 0 || confirmacion.trim().toUpperCase() !== "BORRAR"}
          >
            {cargando ? (
              <>
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> Borrando…
              </>
            ) : (
              <>Vaciar {sel.size > 0 ? `${sel.size} grupo(s)` : ""}</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
