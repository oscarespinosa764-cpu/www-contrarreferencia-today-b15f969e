import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/backend-client";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { CheckSquare, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

type Item = { id: string; texto: string; requerido?: boolean };

interface Props {
  checklistCodigo: string;
  casoId?: string | null;
  casoTipo?: string | null;
  compact?: boolean;
  onCompletado?: (respuestaId: string) => void;
}

/**
 * Runner de listas de chequeo:
 * - Carga la versión ACTIVA de un checklist por código.
 * - Permite marcar cada item y añadir observaciones.
 * - Guarda la respuesta en `checklist_respuestas` vinculada al caso (si aplica).
 * - Si no hay versión activa, no renderiza nada (opcional en la vista).
 */
export function ChecklistRunner({
  checklistCodigo,
  casoId,
  casoTipo,
  compact,
  onCompletado,
}: Props) {
  const qc = useQueryClient();
  const { data: version, isLoading } = useQuery({
    queryKey: ["checklist-runner-active", checklistCodigo],
    queryFn: async () => {
      const { data: cl, error: e1 } = await supabase
        .from("checklists")
        .select("id, codigo, nombre, descripcion")
        .eq("codigo", checklistCodigo)
        .eq("activo", true)
        .maybeSingle();
      if (e1) throw e1;
      if (!cl) return null;
      const { data: v, error: e2 } = await supabase
        .from("checklist_versiones")
        .select("id, version, items, notas")
        .eq("checklist_id", cl.id)
        .eq("estado", "ACTIVA")
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (e2) throw e2;
      if (!v) return null;
      return { checklist: cl, version: v };
    },
    staleTime: 60_000,
  });

  const items = useMemo<Item[]>(
    () => (Array.isArray(version?.version.items) ? (version!.version.items as Item[]) : []),
    [version],
  );

  const [marcados, setMarcados] = useState<Record<string, boolean>>({});
  const [obs, setObs] = useState("");
  useEffect(() => {
    setMarcados({});
    setObs("");
  }, [version?.version.id]);

  const requeridosFaltantes = items.filter((i) => i.requerido && !marcados[i.id]);
  const totalMarcados = items.filter((i) => marcados[i.id]).length;

  const guardar = useMutation({
    mutationFn: async () => {
      if (!version) throw new Error("Sin versión activa");
      const { data: u } = await supabase.auth.getUser();
      const nombre = u.user?.user_metadata?.nombre ?? u.user?.email ?? null;
      const payload = {
        checklist_codigo: version.checklist.codigo,
        version_id: version.version.id,
        caso_id: casoId ?? null,
        caso_tipo: casoTipo ?? null,
        respuestas: items.map((i) => ({
          id: i.id,
          texto: i.texto,
          requerido: !!i.requerido,
          marcado: !!marcados[i.id],
        })),
        observaciones: obs.trim() ? obs.trim() : null,
        usuario_id: u.user?.id ?? null,
        usuario_nombre: nombre,
      };
      const { data, error } = await supabase
        .from("checklist_respuestas")
        .insert(payload)
        .select("id")
        .single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: (id) => {
      toast.success("Lista de chequeo registrada");
      qc.invalidateQueries({ queryKey: ["cm-checklist-respuestas"] });
      onCompletado?.(id);
    },
    onError: (err: Error) => toast.error(err.message ?? "No se pudo guardar"),
  });

  if (isLoading) {
    return (
      <div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
        <Loader2 className="mr-1 inline h-3 w-3 animate-spin" /> Cargando lista de chequeo…
      </div>
    );
  }
  if (!version) return null;

  return (
    <div
      className={`space-y-2 rounded-lg border border-primary/30 bg-primary/5 p-3 ${
        compact ? "text-xs" : "text-sm"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-primary" />
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-primary">
              {version.checklist.nombre}
            </p>
            <p className="text-[10px] text-muted-foreground">
              v{version.version.version} · {totalMarcados}/{items.length} marcados
            </p>
          </div>
        </div>
      </div>
      <ul className="space-y-1.5">
        {items.map((i) => (
          <li key={i.id} className="flex items-start gap-2">
            <Checkbox
              id={`chk-${i.id}`}
              checked={!!marcados[i.id]}
              onCheckedChange={(v) => setMarcados((m) => ({ ...m, [i.id]: !!v }))}
              className="mt-0.5"
            />
            <label htmlFor={`chk-${i.id}`} className="flex-1 leading-snug">
              {i.texto}
              {i.requerido && (
                <span className="ml-1 text-[10px] font-semibold text-destructive">*obligatorio</span>
              )}
            </label>
          </li>
        ))}
      </ul>
      <div className="space-y-1">
        <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
          Observaciones
        </Label>
        <Textarea
          rows={2}
          value={obs}
          onChange={(e) => setObs(e.target.value)}
          placeholder="Opcional: notas o desviaciones."
          className="text-xs"
        />
      </div>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] text-muted-foreground">
          {requeridosFaltantes.length > 0
            ? `Faltan ${requeridosFaltantes.length} obligatorio(s)`
            : "Todos los ítems obligatorios completos"}
        </p>
        <Button
          type="button"
          size="sm"
          className="h-7 rounded-full px-3 text-xs"
          disabled={guardar.isPending || requeridosFaltantes.length > 0}
          onClick={() => guardar.mutate()}
        >
          {guardar.isPending ? (
            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
          ) : (
            <CheckSquare className="mr-1 h-3 w-3" />
          )}
          Registrar chequeo
        </Button>
      </div>
    </div>
  );
}
