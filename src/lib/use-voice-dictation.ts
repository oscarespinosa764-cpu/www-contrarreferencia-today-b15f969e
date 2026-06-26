import { useCallback, useEffect, useRef, useState } from "react";

// Hook de dictado por voz basado en la Web Speech API del navegador.
//
// PRIVACIDAD: no se guarda audio, no se almacenan grabaciones y no se envía
// audio a ningún servidor ni a la IA. El reconocimiento ocurre íntegramente en
// el navegador del usuario. El usuario inicia y detiene el dictado de forma
// manual; el texto resultante queda editable antes de guardar.

export type DictationStatus =
  | "idle"
  | "listening"
  | "processing"
  | "denied"
  | "unsupported"
  | "error";

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: any) => void) | null;
  onerror: ((e: any) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
}

export function getRecognitionCtor(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === "undefined") return null;
  return (
    (window as any).SpeechRecognition ||
    (window as any).webkitSpeechRecognition ||
    null
  );
}

export function isDictationSupported(): boolean {
  return getRecognitionCtor() !== null;
}

export interface UseVoiceDictationOptions {
  lang?: string;
  /** Idiomas de respaldo si el principal falla. */
  fallbackLangs?: string[];
  /** Se llama con el texto final reconocido. */
  onFinalText: (text: string) => void;
  onStatusChange?: (status: DictationStatus) => void;
}

export function useVoiceDictation({
  lang = "es-CO",
  fallbackLangs = ["es-ES", "es"],
  onFinalText,
  onStatusChange,
}: UseVoiceDictationOptions) {
  const supported = isDictationSupported();
  const [status, setStatus] = useState<DictationStatus>(
    supported ? "idle" : "unsupported",
  );
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const langIndexRef = useRef(0);
  const manualStopRef = useRef(false);

  const finalCb = useRef(onFinalText);
  finalCb.current = onFinalText;
  const statusCb = useRef(onStatusChange);
  statusCb.current = onStatusChange;

  const update = useCallback((s: DictationStatus) => {
    setStatus(s);
    statusCb.current?.(s);
  }, []);

  const langs = [lang, ...fallbackLangs].filter(
    (v, i, arr) => v && arr.indexOf(v) === i,
  );

  const stop = useCallback(() => {
    manualStopRef.current = true;
    try {
      recognitionRef.current?.stop();
    } catch {
      /* noop */
    }
  }, []);

  const start = useCallback(() => {
    const Ctor = getRecognitionCtor();
    if (!Ctor) {
      update("unsupported");
      return;
    }
    // Evita instancias duplicadas.
    try {
      recognitionRef.current?.abort();
    } catch {
      /* noop */
    }

    manualStopRef.current = false;
    langIndexRef.current = 0;

    const rec = new Ctor();
    recognitionRef.current = rec;
    rec.lang = langs[0];
    rec.continuous = false;
    rec.interimResults = false;
    rec.maxAlternatives = 1;

    rec.onstart = () => update("listening");

    rec.onresult = (e: any) => {
      let texto = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) texto += res[0].transcript;
      }
      texto = texto.trim();
      if (texto) {
        update("processing");
        finalCb.current(texto);
      }
    };

    rec.onerror = (e: any) => {
      const err = e?.error;
      if (err === "not-allowed" || err === "service-not-allowed") {
        update("denied");
        manualStopRef.current = true;
        return;
      }
      if (err === "no-speech" || err === "aborted") {
        // Silencio o cancelación: simplemente volver a inactivo.
        return;
      }
      // Reintenta con el siguiente idioma de respaldo.
      if (langIndexRef.current < langs.length - 1) {
        langIndexRef.current += 1;
        manualStopRef.current = false;
        try {
          rec.lang = langs[langIndexRef.current];
          rec.start();
          return;
        } catch {
          /* cae a error */
        }
      }
      update("error");
    };

    rec.onend = () => {
      if (manualStopRef.current) {
        update("idle");
        return;
      }
      // Fin natural tras un resultado.
      update("idle");
    };

    try {
      rec.start();
      update("listening");
    } catch {
      update("error");
    }
  }, [langs, update]);

  const toggle = useCallback(() => {
    if (status === "listening") stop();
    else start();
  }, [status, start, stop]);

  useEffect(() => {
    return () => {
      manualStopRef.current = true;
      try {
        recognitionRef.current?.abort();
      } catch {
        /* noop */
      }
    };
  }, []);

  return {
    supported,
    status,
    listening: status === "listening",
    start,
    stop,
    toggle,
  };
}
