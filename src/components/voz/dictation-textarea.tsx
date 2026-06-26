import * as React from "react";
import { toast } from "sonner";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useVoiceDictation, type DictationStatus } from "@/lib/use-voice-dictation";
import { useDictationResolver } from "@/lib/use-dictation-config";
import { VoiceDictationButton } from "@/components/voz/voice-dictation-button";
import type { DictationInsertMode } from "@/lib/dictation-registry";

type TextareaProps = React.ComponentProps<typeof Textarea>;

interface DictationTextareaProps extends TextareaProps {
  /** Clave del punto de dictado registrado (p. ej. salientes.seguimiento.observaciones). */
  dictationKey: string;
}

/** Inserta texto en un textarea controlado y dispara el onChange de React. */
function setTextareaValue(el: HTMLTextAreaElement, value: string) {
  const proto = Object.getPrototypeOf(el);
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  setter?.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

function buildNextValue(
  el: HTMLTextAreaElement,
  texto: string,
  mode: DictationInsertMode,
): { value: string; caret: number } {
  const current = el.value ?? "";
  if (mode === "replace") {
    return { value: texto, caret: texto.length };
  }
  if (mode === "replace-selection") {
    const start = el.selectionStart ?? current.length;
    const end = el.selectionEnd ?? current.length;
    const value = current.slice(0, start) + texto + current.slice(end);
    return { value, caret: start + texto.length };
  }
  // append (por defecto)
  const sep = current && !/\s$/.test(current) ? " " : "";
  const value = current + sep + texto;
  return { value, caret: value.length };
}

/**
 * Reemplazo directo de <Textarea> con botón de dictado por voz integrado.
 * El botón solo aparece si el punto está activo en la configuración y el rol
 * del usuario lo permite. Si el navegador no soporta dictado, se comporta
 * exactamente como un textarea normal.
 */
export const DictationTextarea = React.forwardRef<
  HTMLTextAreaElement,
  DictationTextareaProps
>(({ dictationKey, className, ...props }, forwardedRef) => {
  const innerRef = React.useRef<HTMLTextAreaElement | null>(null);
  const { getConfig, isEnabledForUser } = useDictationResolver();

  const config = getConfig(dictationKey);
  const enabled = isEnabledForUser(dictationKey);
  const mode = config?.modo_insercion ?? "append";
  const lang = config?.idioma ?? "es-CO";
  const ayuda = config?.texto_ayuda;

  const setRefs = (el: HTMLTextAreaElement | null) => {
    innerRef.current = el;
    if (typeof forwardedRef === "function") forwardedRef(el);
    else if (forwardedRef) (forwardedRef as React.MutableRefObject<HTMLTextAreaElement | null>).current = el;
  };

  const handleStatus = React.useCallback((s: DictationStatus) => {
    if (s === "denied") {
      toast.error("Permiso de micrófono denegado. Puede habilitarlo desde la configuración del navegador.");
    } else if (s === "error") {
      toast.error("No se pudo completar el dictado. Puede escribir manualmente.");
    }
  }, []);

  const handleFinalText = React.useCallback(
    (texto: string) => {
      const el = innerRef.current;
      if (!el) return;
      const { value, caret } = buildNextValue(el, texto, mode);
      setTextareaValue(el, value);
      // Reposiciona el cursor y enfoca para edición inmediata.
      requestAnimationFrame(() => {
        try {
          el.focus();
          el.setSelectionRange(caret, caret);
        } catch {
          /* noop */
        }
      });
      toast.success("Texto agregado. Revise antes de guardar.", { duration: 1800 });
    },
    [mode],
  );

  const { supported, status, toggle } = useVoiceDictation({
    lang,
    onFinalText: handleFinalText,
    onStatusChange: handleStatus,
  });

  // Si no está habilitado o no hay soporte, render normal sin botón.
  if (!enabled) {
    return (
      <Textarea
        ref={setRefs}
        className={className}
        data-dictation-key={dictationKey}
        data-dictation-managed="component"
        {...props}
      />
    );
  }

  return (
    <div className="relative">
      <Textarea
        ref={setRefs}
        className={cn("pr-2", className)}
        data-dictation-key={dictationKey}
        data-dictation-managed="component"
        {...props}
      />
      <div className="pointer-events-none absolute right-1.5 top-1.5 flex justify-end">
        <div className="pointer-events-auto">
          <VoiceDictationButton supported={supported} status={status} onToggle={toggle} />
        </div>
      </div>
      {(status === "listening" || ayuda) && (
        <p className="mt-1 text-[10px] text-muted-foreground">
          {status === "listening"
            ? "Escuchando… hable ahora. Revise el texto antes de guardar."
            : ayuda}
        </p>
      )}
    </div>
  );
});
DictationTextarea.displayName = "DictationTextarea";
