import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Check, Copy, Mail } from "lucide-react";
import { toast } from "sonner";
import { TIPO_LABEL } from "@/lib/rc-utils";
import { copiarOficio, tituloOficio } from "@/lib/oficio";
import { OficioPreview } from "@/components/rc/oficio-preview";

interface Props {
  tipo: string;
  codigo: string;
  mensaje: string;
  onNuevo: () => void;
  /** Texto del botón de cierre/continuar (por defecto "Registrar otro caso"). */
  nuevoLabel?: string;
}

export function ResultadoCard({ tipo, codigo, mensaje, onNuevo, nuevoLabel }: Props) {
  const [copied, setCopied] = useState(false);

  const copiarCorreo = async () => {
    const ok = await copiarOficio(tipo, codigo, mensaje);
    if (ok) {
      setCopied(true);
      toast.success("Oficio copiado — pégalo en el correo (Gmail / Outlook)");
      setTimeout(() => setCopied(false), 2000);
    } else {
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
        <OficioPreview tipo={tipo} codigo={codigo} mensaje={mensaje} />
      ) : (
        <p className="rounded-xl border border-dashed border-border bg-card p-4 text-center text-xs text-muted-foreground">
          No se encontró una plantilla configurada para este tipo de caso. El registro se guardó igualmente.
        </p>
      )}

      {mensaje && (
        <Button type="button" variant="secondary" className="w-full rounded-full" onClick={copiarCorreo}>
          {copied ? <Check className="mr-1.5 h-4 w-4" /> : <Mail className="mr-1.5 h-4 w-4" />}
          Copiar para correo
        </Button>
      )}

      <Button type="button" className="w-full rounded-full" onClick={onNuevo}>
        <Copy className="mr-1.5 h-4 w-4" /> {nuevoLabel || "Registrar otro caso"}
      </Button>
    </div>
  );
}
