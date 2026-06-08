import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Check, Copy, MessageCircle, Mail } from "lucide-react";
import { toast } from "sonner";
import { copiarDual, formatearMensajeHTML, limpiarMarcadores, TIPO_LABEL } from "@/lib/rc-utils";

interface Props {
  tipo: string;
  codigo: string;
  mensaje: string;
  onNuevo: () => void;
}

export function ResultadoCard({ tipo, codigo, mensaje, onNuevo }: Props) {
  const [copied, setCopied] = useState<"" | "rich" | "plain">("");

  const copiarRich = async () => {
    const ok = await copiarDual(mensaje);
    if (ok) {
      setCopied("rich");
      toast.success("Copiado con formato (Gmail / Outlook)");
      setTimeout(() => setCopied(""), 2000);
    } else {
      toast.error("No se pudo copiar");
    }
  };

  const copiarPlain = async () => {
    try {
      await navigator.clipboard.writeText(limpiarMarcadores(mensaje));
      setCopied("plain");
      toast.success("Copiado en texto plano (WhatsApp)");
      setTimeout(() => setCopied(""), 2000);
    } catch {
      toast.error("No se pudo copiar");
    }
  };

  return (
    <div className="space-y-4 rounded-2xl border border-status-green/40 bg-status-green/5 p-5">
      <div className="flex flex-col items-center gap-1 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-status-green/15">
          <Check className="h-7 w-7 text-status-green" />
        </div>
        <h3 className="text-base font-extrabold text-foreground">{TIPO_LABEL[tipo] || "REGISTRO GUARDADO"}</h3>
        <p className="rounded-full border border-border bg-card px-3 py-0.5 text-sm font-bold tracking-wide text-foreground">
          {codigo}
        </p>
      </div>

      {mensaje ? (
        <div
          className="max-h-72 overflow-auto whitespace-pre-wrap rounded-xl border border-border bg-card p-4 text-sm leading-relaxed text-foreground"
          dangerouslySetInnerHTML={{ __html: formatearMensajeHTML(mensaje) }}
        />
      ) : (
        <p className="rounded-xl border border-dashed border-border bg-card p-4 text-center text-xs text-muted-foreground">
          No se encontró una plantilla configurada para este tipo de caso. El registro se guardó igualmente.
        </p>
      )}

      {mensaje && (
        <div className="grid gap-2 sm:grid-cols-2">
          <Button type="button" variant="secondary" className="rounded-full" onClick={copiarRich}>
            {copied === "rich" ? <Check className="mr-1.5 h-4 w-4" /> : <Mail className="mr-1.5 h-4 w-4" />}
            Copiar para correo
          </Button>
          <Button type="button" variant="secondary" className="rounded-full" onClick={copiarPlain}>
            {copied === "plain" ? <Check className="mr-1.5 h-4 w-4" /> : <MessageCircle className="mr-1.5 h-4 w-4" />}
            Copiar para WhatsApp
          </Button>
        </div>
      )}

      <Button type="button" className="w-full rounded-full" onClick={onNuevo}>
        <Copy className="mr-1.5 h-4 w-4" /> Registrar otro caso
      </Button>
    </div>
  );
}
