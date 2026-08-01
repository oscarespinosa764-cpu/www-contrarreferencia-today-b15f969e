// ---------------------------------------------------------------------------
// FASE 5E · Bloque B — Piezas compartidas de presentación de HISTÓRICOS y del
// modal de detalle de un seguimiento ya registrado.
//
// Solo presentación: no calcula estados, no muta registros, no dispara
// consultas. Los cuatro modales (Remisiones, Referencias Internas,
// PHD/PAD/O2/Especiales y Pendientes) consumen estas piezas.
// ---------------------------------------------------------------------------
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Copy, Eye } from "lucide-react";
import { toast } from "sonner";
import { fmtFechaHora } from "@/lib/cuadro-turno-utils";
import { labelCanonicoTipoSeguimiento } from "@/lib/seguimiento-orden";

export type SeguimientoRow = Record<string, unknown> & { id?: unknown };

const labelCls = "text-[11px] font-semibold uppercase tracking-wide text-muted-foreground";

// --- Aviso amarillo unificado de validaciones -------------------------------
export function SeguimientoValidationSummary({ errores }: { errores: string[] }) {
  if (!errores.length) return null;
  return (
    <ul
      role="alert"
      aria-live="polite"
      className="space-y-1 rounded-md border border-amber-300 bg-amber-50 p-2 text-[11px] text-amber-800 dark:bg-amber-950/30 dark:text-amber-200"
    >
      {errores.map((e, i) => (
        <li key={i}>• {e}</li>
      ))}
    </ul>
  );
}

// --- Texto canónico completo de un seguimiento ------------------------------
const CLAVES_TECNICAS = new Set([
  "id",
  "caso_id",
  "user_id",
  "usuario_id",
  "actor",
  "hash",
  "firma_id",
  "created_at",
  "updated_at",
]);

function etiquetaClave(k: string): string {
  return k.replace(/_/g, " ").toUpperCase();
}

function valorLegible(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "string") return v.trim() ? v.trim() : null;
  if (typeof v === "number") return String(v);
  if (typeof v === "boolean") return v ? "SÍ" : "NO";
  if (Array.isArray(v)) {
    const items = v.map(valorLegible).filter(Boolean) as string[];
    return items.length ? items.join(", ") : null;
  }
  return null;
}

function parseDetalles(raw: unknown): Record<string, unknown> | null {
  if (!raw) return null;
  if (typeof raw === "object") return raw as Record<string, unknown>;
  if (typeof raw === "string") {
    try {
      const p = JSON.parse(raw);
      return p && typeof p === "object" ? (p as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Fuente canónica del texto completo mostrado y copiado.
 * Orden: plantilla persistida → detalles estructurados → observaciones.
 * Nunca muta el registro ni inventa datos.
 */
export function getSeguimientoDisplayText(seg: SeguimientoRow | null | undefined): string {
  if (!seg) return "";
  const bloques: string[] = [];
  const plantilla = typeof seg.plantilla_indigo === "string" ? seg.plantilla_indigo.trim() : "";
  const observaciones =
    (typeof seg.detalle === "string" && seg.detalle.trim()) ||
    (typeof seg.observaciones === "string" && seg.observaciones.trim()) ||
    "";
  const descripcion = typeof seg.descripcion === "string" ? seg.descripcion.trim() : "";

  if (plantilla) {
    bloques.push(plantilla);
  } else {
    const det = parseDetalles(seg.detalles);
    const lineas: string[] = [];
    const tipo = typeof seg.tipo_seguimiento === "string" ? seg.tipo_seguimiento.trim() : "";
    if (tipo) lineas.push(`TIPO DE SEGUIMIENTO: ${labelCanonicoTipoSeguimiento(tipo).toUpperCase()}`);
    const estadoSol =
      typeof seg.estado_solicitud === "string" ? seg.estado_solicitud.trim() : "";
    if (estadoSol) lineas.push(`ESTADO DE SOLICITUD: ${estadoSol.toUpperCase()}`);
    const radicado = typeof seg.radicado === "string" ? seg.radicado.trim() : "";
    if (radicado) lineas.push(`RADICADO: ${radicado}`);
    if (det) {
      for (const [k, v] of Object.entries(det)) {
        if (CLAVES_TECNICAS.has(k)) continue;
        const val = valorLegible(v);
        if (!val) continue;
        lineas.push(`${etiquetaClave(k)}: ${val}`);
      }
    }
    if (lineas.length) bloques.push(lineas.join("\n"));
  }

  if (descripcion && !bloques.join("\n").includes(descripcion)) {
    bloques.push(`DESCRIPCIÓN: ${descripcion}`);
  }
  if (observaciones && !bloques.join("\n").includes(observaciones)) {
    bloques.push(`OBSERVACIONES: ${observaciones}`);
  }
  return bloques.join("\n\n").trim();
}

// --- Modal de detalle compartido -------------------------------------------
export function SeguimientoDetalleDialog({
  seguimiento,
  onOpenChange,
}: {
  seguimiento: SeguimientoRow | null;
  onOpenChange: (v: boolean) => void;
}) {
  const texto = getSeguimientoDisplayText(seguimiento);
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(texto);
      toast.success("Texto copiado.");
    } catch {
      toast.error("No se pudo copiar. Selecciona el texto manualmente.");
    }
  };

  return (
    <Dialog open={!!seguimiento} onOpenChange={(v) => !v && onOpenChange(false)}>
      <DialogContent className="max-h-[90vh] w-[calc(100vw-1.5rem)] overflow-auto p-4 sm:max-w-lg sm:p-6">
        <DialogHeader>
          <DialogTitle className="break-words text-base uppercase tracking-wide">
            {labelCanonicoTipoSeguimiento(seguimiento?.tipo_seguimiento as string) ||
              "Detalle del seguimiento"}
          </DialogTitle>
        </DialogHeader>
        {seguimiento && (
          <div className="min-w-0 space-y-3">
            <p className="text-xs text-muted-foreground [overflow-wrap:anywhere]">
              {fmtFechaHora(seguimiento.created_at as string)} ·{" "}
              {(seguimiento.nombre_usuario as string) || "—"}
              {typeof seguimiento.canal_gestion === "string" && seguimiento.canal_gestion
                ? ` · ${seguimiento.canal_gestion}`
                : ""}
            </p>
            <div className="space-y-1.5">
              <p className={labelCls}>Registro</p>
              <div className="max-h-[45vh] overflow-auto rounded-md border border-border bg-muted/30 p-3">
                <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-foreground">
                  {texto || "Sin contenido registrado."}
                </pre>
              </div>
            </div>
          </div>
        )}
        <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-end">
          <Button
            type="button"
            className="gap-1.5 rounded-full"
            disabled={!texto}
            onClick={copiar}
          >
            <Copy className="h-4 w-4" /> Copiar texto
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// --- Lista compacta de HISTÓRICOS -------------------------------------------
export function SeguimientoHistoricos({
  items,
  metaDe,
}: {
  items: SeguimientoRow[];
  /** Metadato breve opcional por registro (canal, servicio, estado…). */
  metaDe?: (s: SeguimientoRow) => string | null;
}) {
  const [detalle, setDetalle] = useState<SeguimientoRow | null>(null);
  return (
    <div className="min-w-0">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        Históricos ({items.length})
      </p>
      {items.length === 0 ? (
        <p className="rounded-md border border-dashed border-border py-6 text-center text-sm italic text-muted-foreground">
          Sin seguimientos registrados.
        </p>
      ) : (
        <ul className="space-y-2">
          {items.map((h, i) => {
            const meta = metaDe?.(h) ?? null;
            return (
              <li
                key={String(h.id ?? i)}
                className="rounded-lg border border-border bg-card p-3"
              >
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold uppercase text-foreground">
                      {labelCanonicoTipoSeguimiento(h.tipo_seguimiento as string) || "Seguimiento"}
                    </p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {(h.nombre_usuario as string) || "—"}
                    </p>
                    {meta ? (
                      <p className="truncate text-[10.5px] text-muted-foreground">{meta}</p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className="text-[11px] text-muted-foreground">
                      {fmtFechaHora(h.created_at as string)}
                    </span>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-6 gap-1 px-2 text-[11px]"
                      onClick={() => setDetalle(h)}
                    >
                      <Eye className="h-3.5 w-3.5" /> Ver detalle
                    </Button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <SeguimientoDetalleDialog seguimiento={detalle} onOpenChange={() => setDetalle(null)} />
    </div>
  );
}
