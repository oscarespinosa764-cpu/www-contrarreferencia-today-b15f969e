import { useEffect, useState } from "react";
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
import { Loader2, ShieldCheck, Trash2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import {
  limpiarDatos,
  contarDatos,
  GRUPOS_BORRADO,
  FRASE_CONFIRMACION_BORRADO,
  type GrupoBorradoKey,
} from "@/lib/borrado.functions";

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
  const [backupOk, setBackupOk] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [conteos, setConteos] = useState<Record<string, number>>({});
  const [contando, setContando] = useState(false);
  const limpiar = useServerFn(limpiarDatos);
  const contar = useServerFn(contarDatos);

  const reset = () => {
    setSel(new Set());
    setConfirmacion("");
    setBackupOk(false);
    setConteos({});
  };

  const cerrar = (v: boolean) => {
    if (!v) reset();
    onOpenChange(v);
  };

  // Recalcula el conteo por grupo cada vez que cambia la selección.
  useEffect(() => {
    if (!open || sel.size === 0) {
      setConteos({});
      return;
    }
    let cancelado = false;
    setContando(true);
    contar({ data: { grupos: Array.from(sel) } })
      .then((res) => {
        if (cancelado) return;
        if (res.ok) {
          const map: Record<string, number> = {};
          for (const c of res.conteos) map[c.key] = c.total;
          setConteos(map);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelado) setContando(false);
      });
    return () => {
      cancelado = true;
    };
  }, [sel, open, contar]);

  const toggle = (k: GrupoBorradoKey) =>
    setSel((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });

  const todos = () => setSel(new Set(GRUPOS.map(([k]) => k)));

  const totalRegistros = Array.from(sel).reduce(
    (a, k) => a + Math.max(0, conteos[k] ?? 0),
    0,
  );

  const fraseOk = confirmacion.trim().toUpperCase() === FRASE_CONFIRMACION_BORRADO;
  const puedeEjecutar = sel.size > 0 && fraseOk && backupOk && !cargando;

  const ejecutar = async () => {
    if (sel.size === 0) return toast.error("Selecciona al menos un grupo de datos.");
    if (!fraseOk) return toast.error(`Escribe exactamente "${FRASE_CONFIRMACION_BORRADO}".`);
    if (!backupOk) return toast.error("Confirma que ya descargaste un respaldo.");
    setCargando(true);
    try {
      const res = await limpiar({
        data: { grupos: Array.from(sel), confirmacion, confirmacionBackup: backupOk },
      });
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

        <div className="max-h-[38vh] space-y-1.5 overflow-y-auto pr-1">
          {GRUPOS.map(([k, def]) => {
            const checked = sel.has(k);
            const n = conteos[k];
            return (
              <label
                key={k}
                className="flex cursor-pointer items-center gap-3 rounded-xl border border-border bg-card px-3 py-2 hover:bg-muted/60"
              >
                <Checkbox checked={checked} onCheckedChange={() => toggle(k)} />
                <span className="flex-1 text-sm text-foreground">{def.label}</span>
                {checked && (
                  <span className="shrink-0 rounded-full bg-status-red/15 px-2 py-0.5 text-[11px] font-bold text-status-red">
                    {contando && n === undefined
                      ? "…"
                      : n === -1
                        ? "error"
                        : `${n ?? 0} registro(s)`}
                  </span>
                )}
              </label>
            );
          })}
        </div>

        {sel.size > 0 && (
          <div className="flex items-center gap-2 rounded-xl border border-status-red/30 bg-status-red/10 px-3 py-2 text-sm text-status-red">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>
              Se eliminarán aproximadamente <strong>{totalRegistros}</strong> registro(s) en{" "}
              {sel.size} grupo(s). Esta acción es irreversible.
            </span>
          </div>
        )}

        <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-card px-3 py-2">
          <Checkbox
            checked={backupOk}
            onCheckedChange={(v) => setBackupOk(v === true)}
            className="mt-0.5"
          />
          <span className="text-sm text-foreground">
            Confirmo que ya <strong>descargué un respaldo total</strong> del sistema y entiendo que
            este borrado no se puede deshacer.
          </span>
        </label>

        <div className="space-y-1.5">
          <Label htmlFor="confirma" className="text-xs">
            Para confirmar, escribe exactamente:
            <br />
            <strong className="text-status-red">{FRASE_CONFIRMACION_BORRADO}</strong>
          </Label>
          <Input
            id="confirma"
            value={confirmacion}
            onChange={(e) => setConfirmacion(e.target.value)}
            placeholder={FRASE_CONFIRMACION_BORRADO}
            autoComplete="off"
          />
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => cerrar(false)} disabled={cargando}>
            Cancelar
          </Button>
          <Button variant="destructive" onClick={ejecutar} disabled={!puedeEjecutar}>
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
