// FASE 3 — Infraestructura compartida de filtros.
// Componentes controlados: el consumidor mantiene sus estados, queries y
// query keys. Este archivo solo aporta presentación responsive, panel
// abierto/cerrado, contador y accesibilidad. NO es fuente de verdad.
//
// Responsive: container queries de Tailwind v4 (`@container` + `@2xl:`).
// En contenedor amplio se muestran primary + secondary + limpiar inline.
// En contenedor reducido se muestra únicamente primary + botón "Filtrar (n)"
// que abre un Sheet con los mismos controles secondary.
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetFooter,
  SheetClose,
} from "@/components/ui/sheet";
import { Filter, Eraser } from "lucide-react";

export type FiltersMode = "inmediato" | "explicito";

/**
 * Cuenta filtros activos comparando valores actuales contra los defaults del
 * consumidor. Excluye vacíos, "todos", null/undefined y valores iguales al
 * default. Ranges de fecha cuentan como 1.
 */
export function countActiveFilters(
  current: Record<string, unknown>,
  defaults: Record<string, unknown>,
): number {
  let n = 0;
  for (const k of Object.keys(defaults)) {
    const v = current[k];
    const d = defaults[k];
    if (v === undefined || v === null) continue;
    if (typeof v === "string" && v.trim() === "") continue;
    if (v === d) continue;
    n++;
  }
  return n;
}

export function FiltersBar({
  primary,
  secondary,
  extraActions,
  activeCount,
  onClear,
  panelTitle = "Filtros",
  mode = "inmediato",
  onApply,
  className,
  alwaysCompact = false,
}: {
  /** Controles siempre visibles (búsqueda, filtro primario). */
  primary?: ReactNode;
  /** Controles inline en ancho amplio; en ancho reducido viven en el Sheet. */
  secondary?: ReactNode;
  /** Acciones al final de la barra (Nuevo, Refrescar, etc.). */
  extraActions?: ReactNode;
  /** Filtros activos calculados por el consumidor con countActiveFilters. */
  activeCount: number;
  /** Restablece defaults reales del consumidor (búsqueda, selects, fechas). */
  onClear?: () => void;
  /** Título del panel compacto. */
  panelTitle?: string;
  /**
   * Semántica del consumidor: "inmediato" aplica al cambiar cada control;
   * "explicito" requiere Aplicar. En "inmediato" el botón Aplicar solo cierra.
   */
  mode?: FiltersMode;
  /** Solo se invoca en modo "explicito" al pulsar Aplicar. */
  onApply?: () => void;
  className?: string;
  /**
   * Cuando true, los filtros secundarios NUNCA se muestran inline: siempre
   * viven dentro del Sheet compacto (consumidores tipo Historial que ya
   * usaban popovers y prefieren un único botón "Filtrar (n)").
   */
  alwaysCompact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const hasSecondary = Boolean(secondary);

  return (
    <div className={`@container w-full ${className ?? ""}`}>
      <div className="flex flex-wrap items-center gap-2">
        {primary}

        {/* Secundarios inline sólo cuando el contenedor tiene espacio real (oculto si alwaysCompact) */}
        {hasSecondary && !alwaysCompact && (
          <div className="hidden @min-[820px]:flex flex-wrap items-center gap-2">
            {secondary}
          </div>
        )}

        {/* Limpiar inline (amplio) — sólo si hay filtros activos y no es compact */}
        {onClear && activeCount > 0 && !alwaysCompact && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onClear}
            className="hidden @min-[820px]:inline-flex rounded-full text-xs"
            aria-label="Limpiar filtros"
          >
            <Eraser className="mr-1 h-3.5 w-3.5" /> Limpiar
          </Button>
        )}

        {/* Botón compacto — visible en contenedor reducido, o siempre si alwaysCompact */}
        {hasSecondary && (
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className={alwaysCompact ? "rounded-full" : "@min-[820px]:hidden rounded-full"}
                aria-expanded={open}
                aria-label={
                  activeCount > 0
                    ? `Filtrar, ${activeCount} filtros activos`
                    : "Filtrar"
                }
              >
                <Filter className="mr-1.5 h-3.5 w-3.5" />
                Filtrar{activeCount > 0 ? ` (${activeCount})` : ""}
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-full sm:max-w-md">
              <SheetHeader>
                <SheetTitle>{panelTitle}</SheetTitle>
              </SheetHeader>
              <div className="mt-4 flex flex-col gap-3">{secondary}</div>
              <SheetFooter className="mt-6 flex-row justify-end gap-2">
                {onClear && (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => onClear()}
                  >
                    <Eraser className="mr-1 h-4 w-4" /> Limpiar filtros
                  </Button>
                )}
                <SheetClose asChild>
                  <Button
                    type="button"
                    onClick={() => {
                      if (mode === "explicito") onApply?.();
                    }}
                  >
                    Aplicar
                  </Button>
                </SheetClose>
              </SheetFooter>
            </SheetContent>
          </Sheet>
        )}

        {extraActions}
      </div>
    </div>
  );
}
