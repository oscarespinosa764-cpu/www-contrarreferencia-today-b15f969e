// -----------------------------------------------------------------------------
// FASE 2 · Diálogo compartido "Deshacer cancelación / Reactivar caso".
// Solo se debe montar cuando el rol técnico del usuario es admin y el caso
// se encuentra en un estado cancelatorio canónico (validación server-side
// permanece obligatoria — este componente NO es la única defensa).
// -----------------------------------------------------------------------------
import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import {
  reactivarCasoCanceladoAdmin,
  type TipoCasoReactivable,
} from "@/lib/reactivar-caso.functions";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tipoCaso: TipoCasoReactivable;
  casoId: string;
  paciente: string;
  documento: string;
  codigo?: string;
  estadoCancelado: string;
};

const TABLA_POR_TIPO: Record<TipoCasoReactivable, string> = {
  entrante: "casos_entrantes",
  remision: "remisiones",
  domiciliario: "domiciliarios",
};

const ETIQUETA_TIPO: Record<TipoCasoReactivable, string> = {
  entrante: "Entrante",
  remision: "Saliente",
  domiciliario: "PHD / PAD / O2 / Especial",
};

export function DeshacerCancelacionDialog({
  open,
  onOpenChange,
  tipoCaso,
  casoId,
  paciente,
  documento,
  codigo,
  estadoCancelado,
}: Props) {
  const [motivo, setMotivo] = useState("");
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [cargandoStamp, setCargandoStamp] = useState(false);
  const [stampError, setStampError] = useState<string | null>(null);
  const qc = useQueryClient();
  const reactivar = useServerFn(reactivarCasoCanceladoAdmin);

  useEffect(() => {
    if (!open) {
      setMotivo("");
      setUpdatedAt(null);
      setStampError(null);
      return;
    }
    let cancelled = false;
    setCargandoStamp(true);
    const tabla = TABLA_POR_TIPO[tipoCaso];
    supabase
      .from(tabla as never)
      .select("updated_at" as never)
      .eq("id", casoId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error || !data) {
          setStampError("No se pudo leer el caso actual. Vuelve a intentarlo.");
          setUpdatedAt(null);
        } else {
          setUpdatedAt((data as { updated_at: string }).updated_at);
        }
        setCargandoStamp(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, tipoCaso, casoId]);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!updatedAt) throw new Error("updated_at ausente");
      const res = await reactivar({
        data: {
          tipoCaso,
          casoId,
          motivoReactivacion: motivo.trim(),
          updatedAtEsperado: updatedAt,
        },
      });
      if (!res.ok) throw new Error(res.error ?? "No fue posible reactivar el caso.");
      return res;
    },
    onSuccess: (res) => {
      toast.success(
        `Caso reactivado. Estado restaurado: ${res.estadoRestaurado ?? "—"}`,
      );
      // Invalidación selectiva de consumidores reales.
      qc.invalidateQueries({ queryKey: ["historial"] });
      qc.invalidateQueries({ queryKey: ["historicos-casos"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["dashboard-metrics"] });
      qc.invalidateQueries({ queryKey: ["remisiones"] });
      qc.invalidateQueries({ queryKey: ["phd-ciclo"] });
      qc.invalidateQueries({ queryKey: ["casos-entrantes"] });
      qc.invalidateQueries({ queryKey: ["seguimientos"] });
      onOpenChange(false);
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "Error inesperado.";
      toast.error(msg);
    },
  });

  const motivoValido = motivo.trim().length >= 10 && motivo.trim().length <= 500;
  const puedeEnviar = !!updatedAt && motivoValido && !mutation.isPending && !cargandoStamp;

  return (
    <Dialog open={open} onOpenChange={(v) => (mutation.isPending ? undefined : onOpenChange(v))}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Deshacer cancelación</DialogTitle>
          <DialogDescription>
            Reactiva el caso al último estado operativo válido inmediatamente anterior a la
            cancelación vigente. La cancelación original y su motivo se conservan.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-2 text-sm">
          <div><span className="font-medium">Flujo:</span> {ETIQUETA_TIPO[tipoCaso]}</div>
          <div><span className="font-medium">Paciente:</span> {paciente || "—"}</div>
          <div><span className="font-medium">Documento:</span> {documento || "—"}</div>
          {codigo ? (
            <div><span className="font-medium">Código:</span> {codigo}</div>
          ) : null}
          <div><span className="font-medium">Estado actual:</span> {estadoCancelado}</div>
          <div className="text-xs text-muted-foreground">
            El estado restaurado se determina automáticamente desde el historial estructurado.
            Si no puede identificarse con certeza, la operación se bloqueará.
          </div>
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="motivo-reactivacion">Motivo de la reactivación *</Label>
          <Textarea
            id="motivo-reactivacion"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Explique brevemente por qué se deshace la cancelación (mínimo 10, máximo 500 caracteres)."
            rows={4}
            maxLength={500}
            disabled={mutation.isPending}
          />
          <div className="text-xs text-muted-foreground">
            {motivo.trim().length} / 500 caracteres
          </div>
        </div>

        {stampError ? (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
            {stampError}
          </div>
        ) : null}

        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={mutation.isPending}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={() => mutation.mutate()}
            disabled={!puedeEnviar}
          >
            {mutation.isPending ? "Reactivando…" : "Reactivar caso"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
