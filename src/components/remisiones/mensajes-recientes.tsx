import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { MessageSquare, ChevronDown, X, Copy } from "lucide-react";

export type MensajeColor = "green" | "red" | "amber" | "sky" | "blue" | "teal";

export type MensajeItem = {
  id: string;
  documento: string;
  nombre: string;
  ips: string;
  estado: string;
  color: MensajeColor;
  fecha: string;
  mensaje: string;
};

const BADGE: Record<MensajeColor, string> = {
  green: "bg-status-green/15 text-status-green",
  red: "bg-status-red/15 text-status-red",
  amber: "bg-status-amber/15 text-status-amber",
  sky: "bg-status-sky/15 text-status-sky",
  blue: "bg-status-blue/15 text-status-blue",
  teal: "bg-status-teal/15 text-status-teal",
};

export function MensajesRecientesButton({
  mensajes,
  titulo = "Últimos mensajes de gestión",
  compact = false,
}: {
  mensajes: MensajeItem[];
  titulo?: string;
  compact?: boolean;
}) {
  const [abierto, setAbierto] = useState<string | null>(null);

  const copiar = async (texto: string) => {
    try {
      await navigator.clipboard.writeText(texto);
      toast.success("Mensaje copiado");
    } catch {
      toast.error("No se pudo copiar");
    }
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="relative h-9 rounded-full border-status-teal/40 bg-status-teal/10 text-[11px] font-semibold text-status-teal hover:bg-status-teal/20"
          title="MENSAJES RECIENTES"
          aria-label="MENSAJES RECIENTES"
        >
          <MessageSquare className={compact ? "h-4 w-4" : "mr-1.5 h-3.5 w-3.5"} />
          {!compact && "Mensajes recientes"}
          {mensajes.length > 0 && (
            <span className="ml-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-status-teal px-1 text-[9px] font-bold text-white">
              {mensajes.length}
            </span>
          )}
          {!compact && <ChevronDown className="ml-1 h-3.5 w-3.5 opacity-70" />}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[22rem] p-0">
        <div className="border-b px-3 py-2">
          <p className="text-xs font-bold uppercase tracking-wide text-foreground">{titulo}</p>
          <p className="text-[10px] text-muted-foreground">
            Recupera el mensaje en caso de haberlo cerrado por accidente.
          </p>
        </div>
        <div className="max-h-[24rem] overflow-y-auto p-2">
          {mensajes.length === 0 ? (
            <p className="py-6 text-center text-xs text-muted-foreground">
              No hay mensajes recientes.
            </p>
          ) : (
            <div className="grid gap-1.5">
              {mensajes.map((m) => {
                const open = abierto === m.id;
                return (
                  <div key={m.id} className="rounded-lg border border-border bg-card">
                    <button
                      onClick={() => setAbierto(open ? null : m.id)}
                      className="flex w-full items-start justify-between gap-2 px-2.5 py-2 text-left"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-xs font-bold text-status-blue">{m.documento}</p>
                        <p className="truncate text-[10px] font-semibold uppercase text-muted-foreground">
                          {m.nombre}
                        </p>
                        {m.ips && (
                          <p className="truncate text-[10px] text-muted-foreground">{m.ips}</p>
                        )}
                      </div>
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase ${BADGE[m.color]}`}
                      >
                        {m.estado}
                      </span>
                    </button>
                    {open && (
                      <div className="border-t px-2.5 py-2">
                        <pre className="max-h-48 overflow-y-auto whitespace-pre-wrap break-words rounded-md bg-muted/60 p-2 text-[11px] leading-snug text-foreground">
                          {m.mensaje}
                        </pre>
                        <div className="mt-2 flex items-center justify-end gap-1.5">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-[11px]"
                            onClick={() => setAbierto(null)}
                          >
                            <X className="mr-1 h-3.5 w-3.5" /> Cerrar
                          </Button>
                          <Button
                            size="sm"
                            className="h-7 bg-status-teal text-[11px] text-white hover:bg-status-teal/90"
                            onClick={() => copiar(m.mensaje)}
                          >
                            <Copy className="mr-1 h-3.5 w-3.5" /> Copiar
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
