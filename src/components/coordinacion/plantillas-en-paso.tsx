import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { FileText, Copy, Sparkles } from "lucide-react";
import { toast } from "sonner";
import {
  aplicarVariables,
  PASO_LABEL,
  type DatosPlantilla,
  type PasoId,
} from "@/lib/plantillas-variables";

type PlantillaPaso = {
  id: string;
  nombre: string | null;
  mensaje: string | null;
  categoria: string | null;
  condicion: string | null;
  pasos: string[] | null;
};

type Props = {
  /** Paso del sistema donde se está consumiendo la plantilla. */
  paso: PasoId;
  /** Datos reales del caso/alerta para rellenar las variables. */
  datos: DatosPlantilla;
  /** Condición opcional para afinar el filtrado (ej. tipo de seguimiento). */
  condicion?: string | null;
  /** Se llama con el texto ya generado cuando el usuario elige "Usar". */
  onUsar?: (texto: string) => void;
};

/**
 * Bloque reutilizable: muestra las plantillas ancladas a un paso del sistema,
 * ya generadas con los datos reales. Solo permite usar o copiar (no crear).
 * La creación de plantillas vive únicamente en "Plantillas Generales".
 */
export function PlantillasEnPaso({ paso, datos, condicion, onUsar }: Props) {
  const { data: plantillas } = useQuery({
    queryKey: ["plantillas-paso", paso],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("plantillas")
        .select("id, nombre, mensaje, categoria, condicion, pasos")
        .eq("archivado", false)
        .eq("activo", true)
        .contains("pasos", [paso])
        .order("nombre");
      if (error) throw error;
      return data as PlantillaPaso[];
    },
  });

  const cond = (condicion ?? "").trim().toLowerCase();
  const lista = useMemo(() => {
    const arr = plantillas ?? [];
    if (!cond) return arr;
    // Sugerir primero las que coinciden con la condición; el resto queda disponible.
    return [...arr].sort((a, b) => {
      const ma = (a.condicion ?? "").trim().toLowerCase() === cond ? 0 : 1;
      const mb = (b.condicion ?? "").trim().toLowerCase() === cond ? 0 : 1;
      return ma - mb;
    });
  }, [plantillas, cond]);

  if (!lista || lista.length === 0) return null;

  const usar = (p: PlantillaPaso) => {
    const texto = aplicarVariables(p.mensaje, datos);
    if (onUsar) onUsar(texto);
    else {
      navigator.clipboard.writeText(texto);
      toast.success("Plantilla copiada");
    }
  };

  const copiar = (p: PlantillaPaso) => {
    navigator.clipboard.writeText(aplicarVariables(p.mensaje, datos));
    toast.success("Plantilla copiada");
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="rounded-full">
          <Sparkles className="mr-1.5 h-4 w-4" /> Plantillas ({lista.length})
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="border-b border-border px-3 py-2">
          <p className="text-xs font-semibold text-foreground">
            Plantillas para {PASO_LABEL[paso] ?? paso}
          </p>
          <p className="text-[10px] text-muted-foreground">
            El texto ya viene con los datos del caso.
          </p>
        </div>
        <div className="max-h-72 space-y-2 overflow-auto p-2">
          {lista.map((p) => {
            const coincide = cond && (p.condicion ?? "").trim().toLowerCase() === cond;
            return (
              <div key={p.id} className="rounded-lg border border-border bg-card p-2.5">
                <div className="mb-1 flex items-center gap-1.5">
                  <FileText className="h-3.5 w-3.5 text-status-blue" />
                  <span className="truncate text-xs font-bold text-foreground">{p.nombre}</span>
                  {coincide && (
                    <Badge variant="secondary" className="ml-auto rounded-full text-[9px]">
                      Sugerida
                    </Badge>
                  )}
                </div>
                <p className="line-clamp-3 whitespace-pre-wrap text-[11px] leading-relaxed text-muted-foreground">
                  {aplicarVariables(p.mensaje, datos)}
                </p>
                <div className="mt-2 flex gap-1.5">
                  <Button size="sm" className="h-7 flex-1 rounded-md text-[11px]" onClick={() => usar(p)}>
                    {onUsar ? "Usar" : "Copiar"}
                  </Button>
                  {onUsar && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 rounded-md text-[11px]"
                      onClick={() => copiar(p)}
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
