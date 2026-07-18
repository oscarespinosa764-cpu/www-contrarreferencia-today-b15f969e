import { useEffect, useRef, useState, useCallback, useSyncExternalStore } from "react";
import { calcularVencimiento, fmtMinutos, type Caso } from "@/lib/rc-utils";
import { notifVencimiento } from "@/components/rc/notif-vencimiento-toast";

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

/* ------------------------------------------------------------------ */
/* Estado global reactivo del interruptor de alertas (compartido entre */
/* el botón de la vista de casos y el monitor global del layout).      */
/* ------------------------------------------------------------------ */
let _enabled: boolean = (() => {
  try {
    return localStorage.getItem(LS_ENABLED) !== "0";
  } catch {
    return true;
  }
})();
const _enabledListeners = new Set<() => void>();
function _emit() {
  _enabledListeners.forEach((l) => l());
}
function getEnabled() {
  return _enabled;
}
function setEnabledGlobal(v: boolean) {
  _enabled = v;
  try {
    localStorage.setItem(LS_ENABLED, v ? "1" : "0");
  } catch {
    /* ignore */
  }
  _emit();
}
function subscribeEnabled(cb: () => void) {
  _enabledListeners.add(cb);
  return () => _enabledListeners.delete(cb);
}

/* ------------------------------------------------------------------ */
/* Sonido: se reutiliza un único AudioContext. Se intenta reanudar en  */
/* cada emisión porque los navegadores lo suspenden cuando la pestaña  */
/* pierde el foco.                                                     */
/* ------------------------------------------------------------------ */
let audioCtx: AudioContext | null = null;
function ensureCtx(): AudioContext | null {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    if (audioCtx.state === "suspended") void audioCtx.resume();
    return audioCtx;
  } catch {
    return null;
  }
}
function tone(freq: number, dur: number, type: OscillatorType = "sine") {
  const ctx = ensureCtx();
  if (!ctx) return;
  try {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.value = freq;
    o.type = type;
    o.connect(g);
    g.connect(ctx.destination);
    g.gain.setValueAtTime(0.18, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    o.start();
    o.stop(ctx.currentTime + dur);
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

/* ------------------------------------------------------------------ */
/* Notificaciones del sistema (nativas del navegador). Se muestran y   */
/* suenan aunque el usuario esté en otra ventana/pestaña.              */
/* ------------------------------------------------------------------ */
function notifSupported() {
  return typeof window !== "undefined" && "Notification" in window;
}
function getPerm(): NotificationPermission {
  return notifSupported() ? Notification.permission : "denied";
}
async function requestSystemPermission() {
  if (!notifSupported()) return;
  try {
    if (Notification.permission === "default") await Notification.requestPermission();
  } catch {
    /* ignore */
  }
}
function showSystemNotif(title: string, body: string, tag: string, crit: boolean) {
  if (!notifSupported() || Notification.permission !== "granted") return;
  try {
    const n = new Notification(title, {
      body,
      tag,
      requireInteraction: crit,
      // renotify solo aplica cuando hay tag; refuerza la aparición.
      ...(tag ? { renotify: true } : {}),
    } as NotificationOptions);
    n.onclick = () => {
      try {
        window.focus();
        n.close();
      } catch {
        /* ignore */
      }
    };
  } catch {
    /* ignore */
  }
}

/**
 * Hook de ajustes (para el botón de encendido/apagado de alertas).
 * Comparte el estado global, por lo que apagarlo en una vista lo apaga
 * en el monitor global también.
 */
export function useNotifVencimientos(_casos?: Caso[]) {
  const enabled = useSyncExternalStore(subscribeEnabled, getEnabled, getEnabled);
  const [perm, setPerm] = useState<NotificationPermission>(() => getPerm());

  const setEnabled = useCallback((v: boolean) => {
    setEnabledGlobal(v);
  }, []);

  const requestPermission = useCallback(async () => {
    await requestSystemPermission();
    setPerm(getPerm());
  }, []);

  return { enabled, setEnabled, perm, requestPermission };
}

/* Evita ejecutar el monitor más de una vez aunque se monte en varios sitios. */
let _monitorMounted = false;

/**
 * Monitor GLOBAL de vencimientos. Debe montarse una sola vez, en el layout
 * autenticado, para que las notificaciones del sistema (visuales + sonido)
 * se generen sin importar en qué ventana/módulo esté el usuario.
 */
export function useNotifVencimientosMonitor(casos: Caso[], opts?: { silent?: boolean }) {
  const silent = opts?.silent ?? false;
  const enabledStore = useSyncExternalStore(subscribeEnabled, getEnabled, getEnabled);
  const enabled = enabledStore && !silent;
  const [tick, setTick] = useState(0);
  const doneRef = useRef<Record<string, boolean>>(loadDone());
  const casosRef = useRef(casos);
  casosRef.current = casos;

  // Solicita permiso de notificaciones del sistema al iniciar (si está activo).
  useEffect(() => {
    if (enabled) void requestSystemPermission();
  }, [enabled]);

  // Temporizador de evaluación.
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30000);
    return () => clearInterval(id);
  }, []);

  // Marca de montaje único.
  useEffect(() => {
    if (_monitorMounted) return;
    _monitorMounted = true;
    return () => {
      _monitorMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const all = casosRef.current;
    const activos = all.filter((c) => (c.tipo === "ACEP" || c.tipo === "CRUE_ACEP") && c.estado === "ACTIVO");
    let changed = false;
    for (const c of activos) {
      const ven = calcularVencimiento(c, all);
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
      const paciente = [c.nombres, c.apellidos].filter(Boolean).join(" ") || c.documento || "Sin nombre";
      const crit = nivel === "crit";

      // Sonido
      if (crit) soundCrit();
      else soundWarn();

      // Notificación del sistema (visible en cualquier ventana/pestaña)
      const titulo = crit ? "⛔ Cupo vencido — Entrantes" : "⚡ Cupo próximo a vencer — Entrantes";
      const cuerpo = crit
        ? `${paciente} · ${c.codigo}\nTiempo de ingreso vencido`
        : `${paciente} · ${c.codigo}\nQuedan: ${fmtMinutos(min)}`;
      showSystemNotif(titulo, cuerpo, key, crit);

      // Toast interno (cuando la app está en primer plano)
      notifVencimiento({
        nivel,
        paciente,
        codigo: c.codigo,
        documento: c.documento,
        unidad: c.unidad,
        ips: c.ips,
        tiempo: fmtMinutos(min),
      });
    }
    if (changed) saveDone(doneRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, enabled, casos]);
}
