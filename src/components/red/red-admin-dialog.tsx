import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/backend-client";
import { useAuth } from "@/lib/auth";
import { useCatalogos } from "@/lib/use-rc-data";
import { registrarAuditoria } from "@/lib/auditoria.functions";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Plus, Pencil, Power, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { RedFormDialog } from "@/components/red/red-form-dialog";
import {
  RED_GRUPOS,
  getGrupo,
  grupoDeTipo,
  norm,
  textoBusqueda,
  esActivo,
  type RedRegistro,
  type RedGrupo,
} from "@/lib/red-ips-utils";

export function RedAdminDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const catalogos = useCatalogos();

  const [grupo, setGrupo] = useState<RedGrupo>("jornadas_tep");
  const [q, setQ] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<RedRegistro | null>(null);
  const [delTarget, setDelTarget] = useState<RedRegistro | null>(null);

  const { data: registros, isLoading } = useQuery({
    queryKey: ["red-operativa-admin"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("red_operativa")
        .select("*")
        .eq("archivado", false)
        .order("entidad");
      if (error) throw error;
      return (data ?? []) as unknown as RedRegistro[];
    },
    enabled: open,
  });

  const refrescar = () => {
    qc.invalidateQueries({ queryKey: ["red-operativa-admin"] });
    qc.invalidateQueries({ queryKey: ["red-operativa"] });
  };

  const term = norm(q.trim());
  const lista = useMemo(() => {
    return (registros ?? [])
      .filter((r) => grupoDeTipo(r.tipo_red) === grupo)
      .filter((r) => (term ? textoBusqueda(r).includes(term) : true));
  }, [registros, grupo, term]);

  const auditar = (accion: string, registroId: string, detalles: Record<string, unknown>) =>
    registrarAuditoria({
      data: { accion, modulo: "control-mando", tabla: "red_operativa", registroId, detalles },
    }).catch(() => {});

  const guardar = async (payload: Record<string, unknown>, id?: string): Promise<boolean> => {
    const meta = {
      fecha_actualizacion_disponibilidad: new Date().toISOString(),
      usuario_actualizacion: user?.id ?? null,
    };
    if (id) {
      const { error } = await supabase
        .from("red_operativa")
        .update({ ...payload, ...meta })
        .eq("id", id);
      if (error) {
        toast.error(error.message);
        return false;
      }
      auditar("editar_red", id, { tipo_red: payload.tipo_red });
      toast.success("Registro actualizado");
    } else {
      const { data, error } = await supabase
        .from("red_operativa")
        .insert({ ...payload, ...meta, archivado: false })
        .select("id")
        .single();
      if (error) {
        toast.error(error.message);
        return false;
      }
      auditar("crear_red", data?.id ?? "", { tipo_red: payload.tipo_red });
      toast.success("Registro creado");
    }
    refrescar();
    return true;
  };

  const toggleActivo = async (r: RedRegistro) => {
    const nuevo = esActivo(r) ? "inactivo" : "activo";
    const { error } = await supabase
      .from("red_operativa")
      .update({
        estado: nuevo,
        ...(nuevo === "inactivo" ? { disponible_para_remisiones: false } : {}),
      })
      .eq("id", r.id);
    if (error) return toast.error(error.message);
    auditar("cambiar_estado_red", r.id, { estado: nuevo });
    toast.success(nuevo === "inactivo" ? "Registro desactivado" : "Registro reactivado");
    refrescar();
  };

  const eliminar = async () => {
    if (!delTarget) return;
    // Borrado lógico (archivado): no se pierde el histórico.
    const { error } = await supabase
      .from("red_operativa")
      .update({ archivado: true })
      .eq("id", delTarget.id);
    if (error) return toast.error(error.message);
    auditar("eliminar_red", delTarget.id, { entidad: delTarget.entidad });
    toast.success("Registro eliminado");
    setDelTarget(null);
    refrescar();
  };

  const abrirNuevo = () => {
    setEditing(null);
    setFormOpen(true);
  };
  const abrirEditar = (r: RedRegistro) => {
    setEditing(r);
    setGrupo(grupoDeTipo(r.tipo_red));
    setFormOpen(true);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Gestión de red y disponibilidad</DialogTitle>
          </DialogHeader>

          {/* Pestañas por grupo */}
          <div className="flex gap-2 overflow-x-auto pb-1">
            {RED_GRUPOS.map((g) => (
              <button
                key={g.key}
                type="button"
                onClick={() => setGrupo(g.key)}
                className={`shrink-0 rounded-lg border px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide ${
                  g.key === grupo
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-secondary text-muted-foreground hover:bg-accent"
                }`}
              >
                {g.label}
              </button>
            ))}
          </div>


          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[200px] flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="rounded-full pl-9"
                placeholder="Buscar registro…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
            <Button size="sm" className="rounded-full" onClick={abrirNuevo}>
              <Plus className="mr-1.5 h-4 w-4" /> Agregar registro
            </Button>
          </div>

          {isLoading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Cargando…</p>
          ) : lista.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No hay registros en «{getGrupo(grupo).label}».
            </p>
          ) : (
            <div className="space-y-2">
              {lista.map((r) => {
                const activo = esActivo(r);
                return (
                  <div
                    key={r.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card p-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-foreground">
                        {r.entidad || "—"}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {r.disponible_para_remisiones ? "Disponible" : "No disponible"} ·{" "}
                        {activo ? "Activo" : "Inactivo"}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        title="Editar"
                        onClick={() => abrirEditar(r)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        title={activo ? "Desactivar" : "Reactivar"}
                        onClick={() => toggleActivo(r)}
                      >
                        <Power className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-status-red"
                        title="Eliminar"
                        onClick={() => setDelTarget(r)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <RedFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        tipo={formTipo}
        onTipoChange={setFormTipo}
        editing={editing}
        especialidades={catalogos.data.especialidades}
        ipsOptions={catalogos.data.ips}
        onSubmit={guardar}
      />

      <AlertDialog open={!!delTarget} onOpenChange={(v) => !v && setDelTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar registro?</AlertDialogTitle>
            <AlertDialogDescription>
              «{delTarget?.entidad}» se archivará y dejará de mostrarse en la red. Esta acción no
              elimina el histórico.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={eliminar}>Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
