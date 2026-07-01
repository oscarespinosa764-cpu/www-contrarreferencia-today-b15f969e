import { useEffect, useMemo } from "react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { useDictationConfigRows } from "@/lib/use-dictation-config";
import {
  DICTATION_REGISTRY,
  DICTATION_REGISTRY_BY_KEY,
  type DictationInsertMode,
  type DictationRole,
} from "@/lib/dictation-registry";
import { getRecognitionCtor } from "@/lib/use-voice-dictation";

// ===========================================================================
// INYECTOR GLOBAL DE DICTADO POR VOZ
//
// Este componente se monta una sola vez en la raíz de la app. A partir de la
// configuración (tabla voice_dictation_config + registro por defecto) busca en
// el DOM los campos habilitados y les incrusta un botón de micrófono flotante,
// sin necesidad de modificar cada formulario campo por campo.
//
// Detección de campos (en orden de prioridad por punto):
//   1. [data-dictation-key="<key>"]
//   2. selector CSS avanzado configurado
//   3. #<key>            (id del campo)
//   4. [name="<key>"]    (name del campo)
//
// Privacidad: NO se guarda audio, NO se almacenan grabaciones, NO se envía
// audio a terceros ni a la IA, NO se guardan transcripciones parciales y NO se
// registra el contenido dictado en auditoría. El reconocimiento ocurre
// íntegramente en el navegador y el usuario debe iniciarlo manualmente.
// ===========================================================================

interface InjectSpec {
  key: string;
  selector: string | null;
  modo: DictationInsertMode;
  idioma: string;
  ayuda: string | null;
}

const MANAGED = "data-dictation-managed"; // campos que ya traen su propio botón
const WIRED = "data-dictation-wired"; // campos ya enlazados por el inyector

/** Inserta texto en un input/textarea controlado por React disparando onChange. */
function setNativeValue(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const proto = Object.getPrototypeOf(el);
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  setter?.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

function insertText(el: Element, texto: string, modo: DictationInsertMode) {
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
    const current = el.value ?? "";
    let value = current;
    let caret = current.length;
    if (modo === "replace") {
      value = texto;
      caret = texto.length;
    } else if (modo === "replace-selection") {
      const start = el.selectionStart ?? current.length;
      const end = el.selectionEnd ?? current.length;
      value = current.slice(0, start) + texto + current.slice(end);
      caret = start + texto.length;
    } else {
      const sep = current && !/\s$/.test(current) ? " " : "";
      value = current + sep + texto;
      caret = value.length;
    }
    setNativeValue(el, value);
    requestAnimationFrame(() => {
      try {
        el.focus();
        el.setSelectionRange(caret, caret);
      } catch {
        /* noop */
      }
    });
    return;
  }
  // contenteditable / editores personalizados
  const node = el as HTMLElement;
  node.focus();
  const current = node.textContent ?? "";
  if (modo === "replace") {
    node.textContent = texto;
  } else {
    const sep = current && !/\s$/.test(current) ? " " : "";
    node.textContent = current + sep + texto;
  }
  node.dispatchEvent(new Event("input", { bubbles: true }));
}

export function DictationInjector() {
  const { roles, isAdmin } = useAuth();
  const { data: rows } = useDictationConfigRows();

  // Construye la lista de puntos activos para el rol del usuario.
  const specs = useMemo<InjectSpec[]>(() => {
    const byKey = new Map<
      string,
      {
        activo: boolean;
        modo: DictationInsertMode;
        idioma: string;
        roles: string[];
        selector: string | null;
        ayuda: string | null;
      }
    >();

    // 1) Valores por defecto del registro.
    for (const item of DICTATION_REGISTRY) {
      byKey.set(item.key, {
        activo: item.activo,
        modo: item.modo_insercion,
        idioma: item.idioma,
        roles: item.roles_permitidos,
        selector: item.selector,
        ayuda: null,
      });
    }
    // 2) Sobrescribe / agrega con la base de datos.
    for (const r of rows ?? []) {
      byKey.set(r.key, {
        activo: r.activo,
        modo: (r.modo_insercion as DictationInsertMode) ?? "append",
        idioma: r.idioma || "es-CO",
        roles: r.roles_permitidos ?? ["admin", "operativa"],
        selector: r.selector,
        ayuda: r.texto_ayuda,
      });
    }

    const out: InjectSpec[] = [];
    for (const [key, cfg] of byKey) {
      if (!cfg.activo) continue;
      const permitido =
        isAdmin || (roles as DictationRole[]).some((r) => cfg.roles.includes(r));
      if (!permitido) continue;
      out.push({ key, selector: cfg.selector, modo: cfg.modo, idioma: cfg.idioma, ayuda: cfg.ayuda });
    }
    return out;
  }, [rows, roles, isAdmin]);

  // Clave de dependencia estable para el efecto.
  const specKey = useMemo(
    () => specs.map((s) => `${s.key}|${s.selector ?? ""}|${s.modo}|${s.idioma}`).join("~"),
    [specs],
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!getRecognitionCtor()) return; // navegador sin soporte: no se rompe nada
    if (specs.length === 0) return;

    // Capa flotante para los botones (no intercepta clics del fondo).
    const layer = document.createElement("div");
    layer.style.cssText =
      "position:fixed;inset:0;pointer-events:none;z-index:60;";
    document.body.appendChild(layer);

    const buttons = new Map<Element, HTMLButtonElement>();
    let active: { el: Element; btn: HTMLButtonElement; rec: any } | null = null;
    const warned = new Set<string>();

    const stopActive = () => {
      if (active) {
        try {
          active.rec.abort();
        } catch {
          /* noop */
        }
        setIdle(active.btn);
        active = null;
      }
    };

    // Iconos SVG (Parte 10): micrófono en reposo, cuadro "detener" al escuchar.
    const ICON_MIC =
      '<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/></svg>';
    const ICON_STOP =
      '<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="currentColor" stroke="none"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>';

    const setListening = (btn: HTMLButtonElement) => {
      btn.dataset.state = "listening";
      btn.innerHTML = ICON_STOP;
      btn.style.color = "#dc2626";
      btn.style.borderColor = "rgba(220,38,38,.45)";
      btn.style.background = "rgba(220,38,38,.12)";
      btn.style.boxShadow = "0 0 0 3px rgba(220,38,38,.15)";
      btn.title = "Escuchando… toque para detener. Revise el texto antes de guardar.";
    };
    const setIdle = (btn: HTMLButtonElement) => {
      btn.dataset.state = "idle";
      btn.innerHTML = ICON_MIC;
      btn.style.color = "var(--muted-foreground,#6b7280)";
      btn.style.borderColor = "var(--border,#d4d4d8)";
      btn.style.background = "var(--card,#fff)";
      btn.style.boxShadow = "0 1px 3px rgba(0,0,0,.15)";
    };

    const startFor = (el: Element, spec: InjectSpec, btn: HTMLButtonElement) => {
      const Ctor = getRecognitionCtor();
      if (!Ctor) return;
      if (active) {
        const wasSame = active.el === el;
        stopActive();
        if (wasSame) return; // toggle off
      }
      const rec = new Ctor();
      const langs = [spec.idioma, "es-ES", "es"].filter(
        (v, i, a) => v && a.indexOf(v) === i,
      );
      let li = 0;
      rec.lang = langs[0];
      rec.continuous = false;
      rec.interimResults = false;
      rec.maxAlternatives = 1;
      rec.onstart = () => setListening(btn);
      rec.onresult = (e: any) => {
        let texto = "";
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const res = e.results[i];
          if (res.isFinal) texto += res[0].transcript;
        }
        texto = texto.trim();
        if (texto) {
          insertText(el, texto, spec.modo);
          toast.success("Texto agregado. Revise antes de guardar.", { duration: 1800 });
        }
      };
      rec.onerror = (e: any) => {
        const err = e?.error;
        if (err === "not-allowed" || err === "service-not-allowed") {
          toast.error("Permiso de micrófono denegado. Habilítelo desde el navegador.");
          stopActive();
          return;
        }
        if (err === "no-speech" || err === "aborted") return;
        if (li < langs.length - 1) {
          li += 1;
          try {
            rec.lang = langs[li];
            rec.start();
            return;
          } catch {
            /* cae a fin */
          }
        }
      };
      rec.onend = () => {
        if (active?.el === el) {
          setIdle(btn);
          active = null;
        }
      };
      active = { el, btn, rec };
      try {
        rec.start();
        setListening(btn);
      } catch {
        setIdle(btn);
        active = null;
      }
    };

    const makeButton = (el: Element, spec: InjectSpec) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.dataset.state = "idle";
      btn.textContent = "🎤";
      btn.title = spec.ayuda
        ? spec.ayuda
        : "Dictar por voz. El dictado depende del navegador. Revise el texto antes de guardar.";
      btn.style.cssText =
        "pointer-events:auto;position:fixed;display:none;width:26px;height:26px;line-height:1;" +
        "border-radius:9999px;border:1px solid var(--border,#d4d4d8);background:var(--card,#fff);" +
        "font-size:13px;cursor:pointer;box-shadow:0 1px 3px rgba(0,0,0,.15);z-index:61;padding:0;";
      btn.addEventListener("click", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        startFor(el, spec, btn);
      });
      layer.appendChild(btn);
      return btn;
    };

    const resolve = (spec: InjectSpec): Element[] => {
      const candidates = [
        `[data-dictation-key="${spec.key}"]`,
        spec.selector || "",
        `#${cssEscape(spec.key)}`,
        `[name="${cssEscape(spec.key)}"]`,
      ].filter(Boolean);
      for (const sel of candidates) {
        try {
          const found = Array.from(document.querySelectorAll(sel)).filter(
            (e) => !e.hasAttribute(MANAGED),
          );
          if (found.length) return found;
        } catch {
          /* selector inválido: se ignora sin romper la pantalla */
        }
      }
      return [];
    };

    const cssEscape = (s: string) =>
      typeof CSS !== "undefined" && CSS.escape ? CSS.escape(s) : s.replace(/["\\#.:[\]]/g, "\\$&");

    const scan = () => {
      const live = new Set<Element>();
      for (const spec of specs) {
        const els = resolve(spec);
        if (els.length === 0) {
          // Aviso técnico controlado (sin datos sensibles), una sola vez.
          if (!warned.has(spec.key)) {
            warned.add(spec.key);
            // eslint-disable-next-line no-console
            console.debug(`[dictado] punto sin campo visible en esta pantalla: ${spec.key}`);
          }
          continue;
        }
        for (const el of els) {
          live.add(el);
          if (!buttons.has(el)) {
            el.setAttribute(WIRED, "1");
            buttons.set(el, makeButton(el, spec));
          }
        }
      }
      // Limpia botones de campos que ya no existen.
      for (const [el, btn] of buttons) {
        if (!live.has(el) || !document.body.contains(el)) {
          if (active?.el === el) stopActive();
          btn.remove();
          buttons.delete(el);
        }
      }
    };

    const reposition = () => {
      for (const [el, btn] of buttons) {
        const rect = (el as HTMLElement).getBoundingClientRect();
        const visible =
          rect.width > 0 &&
          rect.height > 0 &&
          rect.bottom > 0 &&
          rect.top < window.innerHeight;
        if (!visible) {
          btn.style.display = "none";
          continue;
        }
        btn.style.display = "block";
        btn.style.top = `${rect.top + 6}px`;
        btn.style.left = `${rect.right - 32}px`;
      }
    };

    const tick = () => {
      scan();
      reposition();
    };

    tick();
    const observer = new MutationObserver(() => tick());
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    const interval = window.setInterval(tick, 1200);

    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
      window.clearInterval(interval);
      stopActive();
      for (const [el, btn] of buttons) {
        el.removeAttribute(WIRED);
        btn.remove();
      }
      buttons.clear();
      layer.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [specKey]);

  return null;
}

export { DICTATION_REGISTRY_BY_KEY };
