import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/backend-client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

/** Inactividad permitida antes de mostrar el aviso: 3 horas. */
const INACTIVIDAD_MS = 3 * 60 * 60 * 1000;
/** Tiempo de gracia tras mostrar el aviso antes del cierre automático: 1 hora. */
const GRACIA_MS = 60 * 60 * 1000;

const ACTIVIDAD = ["mousemove", "mousedown", "keydown", "scroll", "touchstart", "click"] as const;

/**
 * Controla el cierre de sesión por inactividad.
 * - Tras 3 h sin actividad muestra el aviso de "Sesión expirada".
 * - Si pasa 1 h más sin renovar, cierra la sesión automáticamente.
 * El cierre por cierre de pestaña/navegador se maneja en AuthProvider (marca en sessionStorage).
 */
export function SessionTimeout() {
  const { user, signOut } = useAuth();
  const [aviso, setAviso] = useState(false);
  const [renovando, setRenovando] = useState(false);
  const ultimaActividad = useRef<number>(Date.now());
  const avisoDesde = useRef<number | null>(null);

  useEffect(() => {
    if (!user) return;

    const registrar = () => {
      // Mientras el aviso está abierto, la actividad no lo descarta.
      if (avisoDesde.current === null) ultimaActividad.current = Date.now();
    };
    ACTIVIDAD.forEach((ev) => window.addEventListener(ev, registrar, { passive: true }));

    const intervalo = setInterval(() => {
      const ahora = Date.now();
      if (avisoDesde.current === null) {
        if (ahora - ultimaActividad.current >= INACTIVIDAD_MS) {
          avisoDesde.current = ahora;
          setAviso(true);
        }
      } else if (ahora - avisoDesde.current >= GRACIA_MS) {
        signOut();
      }
    }, 30_000);

    return () => {
      ACTIVIDAD.forEach((ev) => window.removeEventListener(ev, registrar));
      clearInterval(intervalo);
    };
  }, [user, signOut]);

  const renovar = async () => {
    setRenovando(true);
    await supabase.auth.refreshSession();
    ultimaActividad.current = Date.now();
    avisoDesde.current = null;
    setAviso(false);
    setRenovando(false);
  };

  const cerrar = async () => {
    avisoDesde.current = null;
    setAviso(false);
    await signOut();
  };

  if (!user) return null;

  return (
    <Dialog open={aviso}>
      <DialogContent
        className="sm:max-w-md [&>button]:hidden"
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Sesión expirada</DialogTitle>
          <DialogDescription>
            Tu sesión expiró por inactividad. ¿Deseas continuar trabajando en esta misma pantalla?
          </DialogDescription>
        </DialogHeader>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" className="rounded-full" onClick={cerrar} disabled={renovando}>
            Cerrar sesión
          </Button>
          <Button className="rounded-full" onClick={renovar} disabled={renovando}>
            {renovando ? "Renovando…" : "Continuar"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
