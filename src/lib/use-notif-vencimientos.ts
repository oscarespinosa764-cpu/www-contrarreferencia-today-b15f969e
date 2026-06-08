import { useEffect, useRef, useState, useCallback } from "react";
import { toast } from "sonner";
import { calcularVencimiento, fmtMinutos, type Caso } from "@/lib/rc-utils";

const LS_ENABLED = "rc-notif-enabled";
const LS_DONE = "rc-notif-done";

function loadDone(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem(LS_DONE) || "{}");
  } catch {
    return {};
  }
}
function saveDone(d: Record<string, boolean>) {
  try {
    localStorage.setItem(LS_DONE, JSON.stringify(d));
  } catch {
    /* ignore */
  }
}

let audioCtx: AudioContext | null = null;
function tone(freq: number, dur: number, type: OscillatorType = "sine") {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.frequency.value = freq;
    o.type = type;
    o.connect(g);
    g.connect(audioCtx.destination);
    g.gain.setValueAtTime(0.18, audioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
    o.start();
    o.stop(audioCtx.currentTime + dur);
  } catch {
    /* ignore */
  }
}
function soundWarn() {
  tone(660, 0.18, "triangle");
}
function soundCrit() {
  tone(880, 0.22, "square");
  setTimeout(() => tone(660, 0.22, "square"), 240);
}

function nativeNotif(title: string, body: string, tag: string) {
  try {
    if (typeof Notification !== "undefined" && Notification.permission === "granted") {
      new Notification(title, { body, tag });
    }
  } catch {
    /* ignore */
  }
}

export function useNotifVencimientos(casos: Caso[]) {
  const [enabled, setEnabledState] = useState<boolean>(() => {
    try {
      return localStorage.getItem(LS_ENABLED) !== "0";
    } catch {
      return true;
    }
  });
  const [perm, setPerm] = useState<NotificationPermission>(
    typeof Notification !== "undefined" ? Notification.permission : "default",
  );
  const [tick, setTick] = useState(0);
  const doneRef = useRef<Record<string, boolean>>(loadDone());

  const setEnabled = useCallback((v: boolean) => {
    setEnabledState(v);
    try {
      localStorage.setItem(LS_ENABLED, v ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, []);

  const requestPermission = useCallback(async () => {
    if (typeof Notification === "undefined") return;
    try {
      const p = await Notification.requestPermission();
      setPerm(p);
    } catch {
      /* ignore */
    }
  }, []);

  // temporizador
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30000);
    return () => clearInterval(id);
  }, []);

  // evaluación de umbrales
  useEffect(() => {
    if (!enabled) return;
    const activos = casos.filter((c) => (c.tipo === "ACEP" || c.tipo === "CRUE_ACEP") && c.estado === "ACTIVO");
    let changed = false;
    for (const c of activos) {
      const ven = calcularVencimiento(c, casos);
      const min = ven.minRest;
      if (min === null || isNaN(min)) continue;
      let nivel: "warn" | "crit" | null = null;
      if (min <= 0) nivel = "crit";
      else if (min <= 60) nivel = "warn";
      if (!nivel) continue;
      const key = `${c.codigo}:${nivel}`;
      if (doneRef.current[key]) continue;
      doneRef.current[key] = true;
      changed = true;
      const paciente = [c.nombres, c.apellidos].filter(Boolean).join(" ") || c.documento || "";
      if (nivel === "crit") {
        soundCrit();
        toast.error(`⏰ Cupo VENCIDO — ${c.codigo}`, {
          description: `${paciente} · ${c.unidad || ""} · ${c.ips || ""}`,
          duration: 10000,
        });
        nativeNotif("Cupo vencido", `${c.codigo} — ${paciente}`, c.codigo);
      } else {
        soundWarn();
        toast.warning(`⏳ Próximo a vencer — ${c.codigo}`, {
          description: `${paciente} · ${fmtMinutos(min)}`,
          duration: 8000,
        });
        nativeNotif("Cupo próximo a vencer", `${c.codigo} — ${fmtMinutos(min)}`, c.codigo);
      }
    }
    if (changed) saveDone(doneRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, enabled, casos]);

  return { enabled, setEnabled, perm, requestPermission };
}
