import { useState, type ReactNode } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { EtapaMeta } from "@/lib/salientes-grupos";

interface Props {
  etapa: EtapaMeta;
  count: number;
  defaultOpen?: boolean;
  children: ReactNode;
}

/**
 * Cabecera colapsable para un grupo de casos SALIENTES en el Dashboard.
 * No modifica el layout de las tarjetas — solo agrega un contenedor con
 * título de etapa, conteo y una barra de color a la izquierda.
 */
export function GrupoEtapa({ etapa, count, defaultOpen = true, children }: Props) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className={`rounded-xl border border-l-4 bg-card shadow-sm ${etapa.bar}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 rounded-t-xl px-3 py-2 text-left"
      >
        {open ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        )}
        <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide ${etapa.color}`}>
          {etapa.titulo}
        </span>
        <span className="text-[11px] text-muted-foreground">{etapa.descripcion}</span>
        <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-foreground">
          {count}
        </span>
      </button>
      {open && <div className="grid gap-3 border-t border-border p-3">{children}</div>}
    </section>
  );
}
