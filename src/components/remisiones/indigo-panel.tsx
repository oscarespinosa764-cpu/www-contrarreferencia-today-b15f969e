import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Copy, RotateCcw } from "lucide-react";
import { toast } from "sonner";

/**
 * Ventana de plantilla de trazabilidad ÍNDIGO.
 * Muestra texto PLANO editable y permite copiarlo para pegar en ÍNDIGO.
 * No usa HTML enriquecido, ni formato tipo oficio, ni botón de WhatsApp.
 */
export function IndigoPanel({
  open,
  onOpenChange,
  titulo,
  plantillaBase,
  onCopiado,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  titulo: string;
  /** Texto plano generado automáticamente. */
  plantillaBase: string;
  /** Callback opcional cuando se copia (para auditoría). */
  onCopiado?: () => void;
}) {
  const [texto, setTexto] = useState(plantillaBase);

  useEffect(() => {
    if (open) setTexto(plantillaBase);
  }, [open, plantillaBase]);

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(texto);
      toast.success("Texto copiado para Índigo");
      onCopiado?.();
    } catch {
      toast.error("No se pudo copiar. Selecciona el texto manualmente.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-sm font-bold tracking-wide">{titulo}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Texto plano editable. Ajusta lo que necesites antes de copiar y pegar en ÍNDIGO.
          </p>
          <Textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            rows={10}
            className="font-mono text-xs leading-relaxed"
          />
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
          <Button
            type="button"
            variant="outline"
            className="gap-1.5"
            onClick={() => setTexto(plantillaBase)}
          >
            <RotateCcw className="h-4 w-4" /> Regenerar plantilla
          </Button>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cerrar
            </Button>
            <Button type="button" className="gap-1.5 rounded-full" onClick={copiar}>
              <Copy className="h-4 w-4" /> Copiar para Índigo
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
