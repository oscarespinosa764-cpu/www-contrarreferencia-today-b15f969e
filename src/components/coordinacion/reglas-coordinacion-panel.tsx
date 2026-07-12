// Subventana REGLAS DE COORDINACIÓN (Control de Mando → Alertas y avisos).
// Administra exclusivamente las reglas que generan ALERTAS DE COORDINACIÓN.
//
// Fase 1: catálogo de las reglas de coordinación iniciales (código, módulo,
// condición, umbral, prioridad, estado). El formulario seguro de creación/edición
// y el motor backend persistente (tabla propia + cron con hora de servidor) se
// conectan en la fase 2 (requiere migración de base de datos).
import { Panel } from "@/components/stat-card";
import { Zap, Info } from "lucide-react";
import {
  REGLAS_COORDINACION,
  umbralTexto,
  NIVEL_LABEL,
} from "@/lib/alertas-coordinacion-ui";

export function ReglasCoordinacionPanel() {
  const entrantes = REGLAS_COORDINACION.filter((r) => r.subventana === "ENTRANTES");
  const salientes = REGLAS_COORDINACION.filter((r) => r.subventana === "SALIENTES");

  const Card = ({ codigo }: { codigo: string }) => {
    const r = REGLAS_COORDINACION.find((x) => x.codigo === codigo)!;
    return (
      <div className="rounded-xl border border-border border-l-4 border-l-status-amber bg-card p-4 shadow-sm">
        <p className="flex items-center gap-2 text-sm font-bold text-foreground">
          <Zap className="h-4 w-4 shrink-0 text-status-amber" /> {r.nombre}
        </p>
        <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px]">
          <span className="rounded-full bg-secondary px-2 py-0.5 font-mono font-semibold text-secondary-foreground">
            {r.codigo}
          </span>
          <span className="rounded-full bg-muted px-2 py-0.5 font-semibold">{r.modulo}</span>
          <span className="rounded-full bg-muted px-2 py-0.5 font-semibold">
            Umbral: {umbralTexto(r)}
          </span>
          <span className="rounded-full bg-status-amber/15 px-2 py-0.5 font-bold text-status-amber">
            {NIVEL_LABEL[r.prioridad]}
          </span>
        </p>
        <p className="mt-1.5 text-xs text-muted-foreground">{r.descripcion}</p>
        <p className="mt-1 text-[11px] text-muted-foreground">
          Evento: {r.evento} · Condición: {r.condicion}
        </p>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <Panel title="Reglas de coordinación · Entrantes" bodyMaxHeight={null}>
        <div className="grid gap-3">
          {entrantes.map((r) => (
            <Card key={r.codigo} codigo={r.codigo} />
          ))}
        </div>
      </Panel>

      <Panel title="Reglas de coordinación · Salientes" bodyMaxHeight={null}>
        <div className="grid gap-3">
          {salientes.map((r) => (
            <Card key={r.codigo} codigo={r.codigo} />
          ))}
        </div>
      </Panel>

      <div className="flex items-start gap-2 rounded-xl border border-status-sky/30 bg-status-sky/10 p-4 text-xs text-muted-foreground">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-status-sky" />
        <span>
          Estas reglas producen <strong>alertas de coordinación persistentes</strong> (no avisos
          operativos). La creación/edición segura de reglas y el motor de evaluación con hora de
          servidor e idempotencia se activan en la siguiente etapa. Los canales de salida se
          seleccionan sin duplicar credenciales: se toman de Notificaciones externas.
        </span>
      </div>
    </div>
  );
}
