import { useAuth } from "@/lib/auth";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { TURNOS_CANONICOS, TURNOS_CODIGOS } from "@/lib/turno";
import type { ReactNode } from "react";
import { useState } from "react";

/**
 * Gate mínimo para escenarios donde Supabase restaura una sesión válida
 * pero no existe TurnoSesion en sessionStorage (pestaña nueva, storage
 * limpiado, etc.). No cierra sesión ni toca el flujo de dispositivo.
 * Bloquea el acceso operativo hasta que el usuario elija turno.
 */
export function TurnoSesionGate({ children }: { children: ReactNode }) {
  const { user, isActiveMember, turnoSesion, setTurnoSesion } = useAuth();
  const [seleccion, setSeleccion] = useState<typeof TURNOS_CODIGOS[number] | "">("");

  if (!user || !isActiveMember || turnoSesion) return <>{children}</>;

  return (
    <Dialog open>
      <DialogContent className="max-w-md" onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>Selecciona tu turno operativo</DialogTitle>
          <DialogDescription>
            Para continuar, indica el turno en el que iniciarás esta sesión.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {TURNOS_CODIGOS.map((codigo) => {
            const def = TURNOS_CANONICOS[codigo];
            const activa = seleccion === codigo;
            return (
              <button
                key={codigo}
                type="button"
                onClick={() => setSeleccion(codigo)}
                className={`rounded-lg border p-3 text-left text-sm transition ${
                  activa
                    ? "border-primary bg-primary/10 text-foreground"
                    : "border-border hover:bg-muted"
                }`}
              >
                <p className="font-semibold">{def.etiqueta}</p>
                <p className="text-xs text-muted-foreground">
                  {String(def.inicio).padStart(2, "0")}:00 – {String(def.fin).padStart(2, "0")}:00
                  {def.cruzaMedianoche ? " (día siguiente)" : ""}
                </p>
              </button>
            );
          })}
        </div>
        <Button
          disabled={!seleccion}
          onClick={() => seleccion && setTurnoSesion(seleccion)}
          className="w-full"
        >
          Confirmar turno de sesión
        </Button>
      </DialogContent>
    </Dialog>
  );
}
