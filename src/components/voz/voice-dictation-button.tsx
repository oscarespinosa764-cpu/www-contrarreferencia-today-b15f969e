import { Mic, Square, Loader2, MicOff } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DictationStatus } from "@/lib/use-voice-dictation";

interface Props {
  status: DictationStatus;
  supported: boolean;
  onToggle: () => void;
  className?: string;
}

const TOOLTIP_BASE = "Dictar por voz. Revise el texto antes de guardar.";

export function VoiceDictationButton({ status, supported, onToggle, className }: Props) {
  if (!supported) return null;

  const listening = status === "listening";
  const processing = status === "processing";
  const denied = status === "denied";

  let tooltip = TOOLTIP_BASE;
  let Icon = Mic;

  if (listening) {
    tooltip = "Escuchando… toque para detener. Revise el texto antes de guardar.";
    Icon = Square;
  } else if (processing) {
    tooltip = "Procesando dictado…";
    Icon = Loader2;
  } else if (denied) {
    tooltip = "No se pudo acceder al micrófono. Verifique permisos del navegador.";
    Icon = MicOff;
  }

  return (
    <button
      type="button"
      onClick={onToggle}
      title={tooltip}
      aria-label={tooltip}
      className={cn(
        // Solo ícono de micrófono, discreto, sin texto "Dictar".
        "inline-flex h-7 w-7 items-center justify-center rounded-full border shadow-sm transition-colors",
        listening
          ? "border-status-red/40 bg-status-red/10 text-status-red animate-pulse"
          : denied
            ? "border-status-amber/40 bg-status-amber/10 text-status-amber"
            : "border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground",
        className,
      )}
    >
      <Icon className={cn("h-3.5 w-3.5", processing && "animate-spin")} />
    </button>
  );
}
