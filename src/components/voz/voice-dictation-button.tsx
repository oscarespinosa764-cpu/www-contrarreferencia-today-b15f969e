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

  let label = "Dictar";
  let tooltip = TOOLTIP_BASE;
  let Icon = Mic;

  if (listening) {
    label = "Detener";
    tooltip = "Escuchando… toque para detener.";
    Icon = Square;
  } else if (processing) {
    label = "Procesando";
    Icon = Loader2;
  } else if (denied) {
    label = "Micrófono";
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
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium shadow-sm transition-colors",
        listening
          ? "border-status-red/40 bg-status-red/10 text-status-red animate-pulse"
          : denied
            ? "border-status-amber/40 bg-status-amber/10 text-status-amber"
            : "border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground",
        className,
      )}
    >
      <Icon className={cn("h-3.5 w-3.5", processing && "animate-spin")} />
      <span>{label}</span>
    </button>
  );
}
