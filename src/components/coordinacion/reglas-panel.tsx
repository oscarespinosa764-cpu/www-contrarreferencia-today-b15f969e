import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/backend-client";
import { useAuth } from "@/lib/auth";
import { registrarAuditoria } from "@/lib/auditoria.functions";
import { Panel } from "@/components/stat-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Plus, Zap, Search, Pencil, Archive, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { ReglaFormDialog, type ReglaFormValues } from "@/components/coordinacion/regla-form-dialog";
import {
  REGLAS_BASE,
  moduloLabel,
  condicionMeta,
  NIVEL_BADGE,
  type Regla,
} from "@/lib/avisos-reglas";

export function ReglasPanel() {
  const { isAdmin } = useAuth();
  const qc = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Regla | null>(null);
  const [archivar, setArchivar] = useState<Regla | null>(null);
  const [q, setQ] = useState("");
  const [creandoBase, setCreandoBase] = useState(false);

  const { data: reglas, isLoading } = useQuery({
    queryKey: ["reglas-operativas"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reglas_operativas")
        .select("*")
        .eq("archivado", false)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Regla[];
    },
  });

  const refrescar = () => {
    qc.invalidateQueries({ queryKey: ["reglas-operativas"] });
    qc.invalidateQueries({ queryKey: ["avisos-operativos"] });
  };

  const audit = (accion: string, detalles: Record<string, unknown>) =>
    registrarAuditoria({
      data: { accion, modulo: "reglas", tabla: "reglas_operativas", detalles },
    }).catch(() => {});

  const term = q.trim().toLowerCase();
  const reglasF = useMemo(
    () =>
      (reglas ?? []).filter((r) =>
        term ? [r.nombre, r.mensaje, moduloLabel(r.modulo)].filter(Boolean).join(" ").toLowerCase().includes(term) : true,
      ),
    [reglas, term],
  );

  const activas = (reglas ?? []).filter((r) => r.activo).length;
  const pausadas = (reglas ?? []).length - activas;

  const guardar = async (values: ReglaFormValues, id?: string): Promise<boolean> => {
    if (id) {
      const { error } = await supabase.from("reglas_operativas").update(values).eq("id", id);
      if (error) {
        toast.error(error.message);
        return false;
      }
      audit("editar_regla", { id, nombre: values.nombre });
      toast.success("Regla actualizada");
    } else {
      const { data, error } = await supabase
        .from("reglas_operativas")
        .insert({ ...values, archivado: false })
        .select("id")
        .single();
      if (error) {
        toast.error(error.message);
        return false;
      }
      audit("crear_regla", { id: data?.id, nombre: values.nombre });
      toast.success("Regla creada");
    }
    refrescar();
    return true;
  };

  const togglePausa = async (r: Regla) => {
    const { error } = await supabase
      .from("reglas_operativas")
      .update({ activo: !r.activo })
      .eq("id", r.id);
    if (error) return toast.error(error.message);
    audit(r.activo ? "pausar_regla" : "reactivar_regla", { id: r.id });
    refrescar();
  };

  const confirmarArchivar = async () => {
    if (!archivar) return;
    const { error } = await supabase
      .from("reglas_operativas")
      .update({ archivado: true, activo: false })
      .eq("id", archivar.id);
    if (error) return toast.error(error.message);
    audit("archivar_regla", { id: archivar.id, nombre: archivar.nombre });
    toast.success("Regla archivada");
    setArchivar(null);
    refrescar();
  };

  const crearBase = async () => {
    setCreandoBase(true);
    const { error } = await supabase
      .from("reglas_operativas")
      .insert(REGLAS_BASE.map((r) => ({ ...r, activo: true, archivado: false })));
    setCreandoBase(false);
    if (error) return toast.error(error.message);
    audit("crear_reglas_base", { cantidad: REGLAS_BASE.length });
    toast.success(`${REGLAS_BASE.length} reglas base creadas`);
    refrescar();
  };

  return (
    <Panel
      title="Reglas operativas"
      action={
        isAdmin && (
          <div className="flex flex-wrap items-center gap-2">
            {(reglas?.length ?? 0) === 0 && (
              <Button
                variant="outline"
                size="sm"
                className="rounded-full"
                onClick={crearBase}
                disabled={creandoBase}
              >
                <Sparkles className="mr-1.5 h-4 w-4" /> Crear reglas base
              </Button>
            )}
            <Button
              size="sm"
              className="rounded-full"
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              <Plus className="mr-1.5 h-4 w-4" /> Nueva regla
            </Button>
          </div>
        )
      }
    >
      <p className="mb-3 text-center text-[11px] text-muted-foreground">
        Motor de avisos inteligentes · {reglas?.length ?? 0} configurada(s) · {activas} activa(s) ·{" "}
        {pausadas} pausada(s)
      </p>

      <div className="relative mb-4 mx-auto max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="rounded-full pl-9"
          placeholder="Buscar regla…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      {isLoading ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Cargando…</p>
      ) : reglasF.length > 0 ? (
        <div className="grid gap-3">
          {reglasF.map((r) => (
            <div
              key={r.id}
              className={`rounded-xl border border-border border-l-4 bg-card p-4 shadow-sm ${
                r.activo ? "border-l-status-amber" : "border-l-border opacity-70"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-sm font-bold text-foreground">
                    <Zap className="h-4 w-4 text-status-amber" /> {r.nombre}
                  </p>
                  <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px]">
                    <span className="rounded-full bg-secondary px-2 py-0.5 font-semibold text-secondary-foreground">
                      {moduloLabel(r.modulo)}
                    </span>
                    <span className={`rounded-full px-2 py-0.5 font-bold ${NIVEL_BADGE[r.nivel] ?? "bg-muted"}`}>
                      {r.nivel}
                    </span>
                    <span className="text-muted-foreground">
                      {condicionMeta(r.tipo_condicion)?.label ?? r.tipo_condicion}
                      {r.horas ? ` · ${r.horas}h` : ""}
                    </span>
                  </p>
                  {r.mensaje && (
                    <p className="mt-1.5 text-xs text-muted-foreground">{r.mensaje}</p>
                  )}
                </div>
                {isAdmin && (
                  <div className="flex shrink-0 items-center gap-1.5">
                    <Switch checked={r.activo} onCheckedChange={() => togglePausa(r)} />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => {
                        setEditing(r);
                        setFormOpen(true);
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-status-red"
                      onClick={() => setArchivar(r)}
                    >
                      <Archive className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="py-8 text-center text-sm text-muted-foreground">
          Aún no hay reglas operativas definidas.
          {isAdmin ? " Usa «Crear reglas base» o «Nueva regla»." : ""}
        </p>
      )}

      <ReglaFormDialog open={formOpen} onOpenChange={setFormOpen} editing={editing} onSubmit={guardar} />

      <AlertDialog open={!!archivar} onOpenChange={(v) => !v && setArchivar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Archivar regla?</AlertDialogTitle>
            <AlertDialogDescription>
              «{archivar?.nombre}» se archivará y dejará de evaluarse. No se elimina físicamente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmarArchivar}>Archivar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Panel>
  );
}
