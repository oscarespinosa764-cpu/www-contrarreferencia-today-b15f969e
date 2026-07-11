import { useMemo, useState } from "react";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Clock, LogIn, Timer } from "lucide-react";
import { AccionDialog } from "@/components/rc/seguimiento-control";
import type { Caso, Plantilla } from "@/lib/rc-utils";
import type { Catalogos } from "@/lib/use-rc-data";
import { fmtDuracion } from "@/lib/rc-utils";
import {
  calcularNotifIngreso,
  CATEGORIA_LABEL,
  type CategoriaIngreso,
  type NotifIngreso,
} from "@/lib/notif-ingreso";

interface Props {
  casos: Caso[];
  catalogos: Catalogos;
  plantillas: Plantilla[];
  tick: number;
}

/**
 * Panel "Posibles notificaciones de ingreso": lista los cupos cancelados o los
 * casos negados dentro de la ventana de 24 h, permitiendo confirmar un ingreso
 * posterior (tardío o sin proceso de referencia) que genera la alerta y pasa a
 * historial. Se calcula en memoria; al vencer la ventana desaparecen solos.
 */
export function PosiblesIngresos({ casos, catalogos, plantillas, tick }: Props) {
  const { canEdit } = useAuth();
  const [sel, setSel] = useState<NotifIngreso | null>(null);

  const items = useMemo(
    () => calcularNotifIngreso(casos),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [casos, tick],
  );

  if (items.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        No hay posibles notificaciones de ingreso.
      </p>
    );
  }

  const color = (c: CategoriaIngreso) =>
    c === "tardio" ? "border-l-status-amber" : "border-l-status-red";

  return (
    <>
      <div className="grid gap-3">
        {items.map((it) => {
          const c = it.caso;
          const nombre =
            [c.nombres, c.apellidos].filter(Boolean).join(" ") || c.documento || "Sin nombre";
          const restante = it.minRestantes;
          return (
            <div
              key={it.key}
              className={`rounded-xl border border-border border-l-4 ${color(it.categoria)} bg-card p-4 shadow-sm`}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p className="text-base font-bold text-foreground">{nombre}</p>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                    it.categoria === "tardio"
                      ? "bg-status-amber/15 text-status-amber"
                      : "bg-status-red/15 text-status-red"
                  }`}
                >
                  {CATEGORIA_LABEL[it.categoria]}
                </span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                <span className="font-bold text-foreground">DOCUMENTO:</span> {c.documento || "—"} ·{" "}
                <span className="font-bold text-foreground">IPS:</span> {c.ips || "—"}
                {c.unidad ? (
                  <>
                    {" "}
                    · <span className="font-bold text-foreground">UNIDAD:</span> {c.unidad}
                  </>
                ) : null}
              </p>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                  <Timer className="h-3.5 w-3.5" />
                  Ventana: {restante > 0 ? `${fmtDuracion(restante)} restantes` : "por vencer"}
                </span>
                <div className="flex items-center gap-2">
                  {canEdit && (
                    <Button
                      size="sm"
                      className="rounded-full"
                      onClick={() => setSel(it)}
                    >
                      <LogIn className="mr-1 h-3.5 w-3.5" /> Confirmar ingreso
                    </Button>
                  )}
                  <Badge variant="secondary" className="font-mono text-xs">
                    {c.codigo}
                  </Badge>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {sel && (
        <AccionDialog
          accion="ingreso"
          caso={sel.caso}
          casos={casos}
          catalogos={catalogos}
          plantillas={plantillas}
          modo="posterior"
          categoria={sel.categoria}
          onClose={() => setSel(null)}
        />
      )}
    </>
  );
}
