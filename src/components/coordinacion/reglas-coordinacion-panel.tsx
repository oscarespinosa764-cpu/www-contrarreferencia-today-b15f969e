// Subventana REGLAS DE COORDINACIÓN (Control de Mando → Alertas y avisos).
// Administra las reglas que generan ALERTAS DE COORDINACIÓN (persistentes).
// CRUD completo para administración: crear, editar, activar/desactivar y archivar.
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/backend-client";
import { useAuth } from "@/lib/auth";
import { registrarAuditoria } from "@/lib/auditoria.functions";
import { Panel } from "@/components/stat-card";
import { Button } from "@/components/ui/button";
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
import { Zap, Info, Plus, Pencil, Archive } from "lucide-react";
import { toast } from "sonner";
import {
  ReglaCoordinacionFormDialog,
  type ReglaCoordFormValues,
} from "@/components/coordinacion/regla-coordinacion-form-dialog";
import {
  type ReglaCoordDB,
  NIVEL_LABEL_COORD,
  NIVEL_BADGE_COORD,
  umbralTextoDB,
} from "@/lib/reglas-coordinacion-db";

export function ReglasCoordinacionPanel() {
  const { isAdmin, user } = useAuth();
  const qc = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ReglaCoordDB | null>(null);
  const [archivar, setArchivar] = useState<ReglaCoordDB | null>(null);

  const { data: reglas, isLoading } = useQuery({
    queryKey: ["reglas-coordinacion"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reglas_coordinacion")
        .select("*")
        .eq("archivado", false)
        .order("subventana", { ascending: true })
        .order("orden", { ascending: true });
      if (error) throw error;
      return (data ?? []) as ReglaCoordDB[];
    },
  });

  const refrescar = () => qc.invalidateQueries({ queryKey: ["reglas-coordinacion"] });

  const audit = (accion: string, detalles: Record<string, unknown>) =>
    registrarAuditoria({
      data: { accion, modulo: "reglas-coordinacion", tabla: "reglas_coordinacion", detalles },
    }).catch(() => {});

  const entrantes = useMemo(
    () => (reglas ?? []).filter((r) => r.subventana === "ENTRANTES"),
    [reglas],
  );
  const salientes = useMemo(
    () => (reglas ?? []).filter((r) => r.subventana === "SALIENTES"),
    [reglas],
  );

  const activas = (reglas ?? []).filter((r) => r.activo).length;
  const total = reglas?.length ?? 0;

  const guardar = async (values: ReglaCoordFormValues, id?: string): Promise<boolean> => {
    if (id) {
      const { error } = await supabase.from("reglas_coordinacion").update(values).eq("id", id);
      if (error) {
        toast.error(error.message);
        return false;
      }
      audit("editar_regla_coordinacion", { id, codigo: values.codigo });
      toast.success("Regla de coordinación actualizada");
    } else {
      const maxOrden = Math.max(0, ...(reglas ?? []).map((r) => r.orden ?? 0));
      const { data, error } = await supabase
        .from("reglas_coordinacion")
        .insert({
          ...values,
          orden: maxOrden + 1,
          es_base: false,
          archivado: false,
          created_by: user?.id ?? null,
        })
        .select("id")
        .single();
      if (error) {
        toast.error(
          error.code === "23505" ? "Ya existe una regla con ese código." : error.message,
        );
        return false;
      }
      audit("crear_regla_coordinacion", { id: data?.id, codigo: values.codigo });
      toast.success("Regla de coordinación creada");
    }
    refrescar();
    return true;
  };

  const toggleActivo = async (r: ReglaCoordDB) => {
    const { error } = await supabase
      .from("reglas_coordinacion")
      .update({ activo: !r.activo })
      .eq("id", r.id);
    if (error) return toast.error(error.message);
    audit(r.activo ? "desactivar_regla_coordinacion" : "activar_regla_coordinacion", {
      id: r.id,
      codigo: r.codigo,
    });
    refrescar();
  };

  const confirmarArchivar = async () => {
    if (!archivar) return;
    const { error } = await supabase
      .from("reglas_coordinacion")
      .update({ archivado: true, activo: false })
      .eq("id", archivar.id);
    if (error) return toast.error(error.message);
    audit("archivar_regla_coordinacion", { id: archivar.id, codigo: archivar.codigo });
    toast.success("Regla archivada");
    setArchivar(null);
    refrescar();
  };

  const Card = ({ r }: { r: ReglaCoordDB }) => (
    <div
      className={`rounded-xl border border-border border-l-4 bg-card p-4 shadow-sm ${
        r.activo ? "border-l-status-amber" : "border-l-border opacity-70"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-bold text-foreground">
            <Zap className="h-4 w-4 shrink-0 text-status-amber" /> {r.nombre}
          </p>
          <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px]">
            <span className="rounded-full bg-secondary px-2 py-0.5 font-mono font-semibold text-secondary-foreground">
              {r.codigo}
            </span>
            <span className="rounded-full bg-muted px-2 py-0.5 font-semibold">{r.modulo}</span>
            <span className="rounded-full bg-muted px-2 py-0.5 font-semibold">
              Umbral: {umbralTextoDB(r)}
            </span>
            <span
              className={`rounded-full px-2 py-0.5 font-bold ${
                NIVEL_BADGE_COORD[r.prioridad] ?? "bg-muted"
              }`}
            >
              {NIVEL_LABEL_COORD[r.prioridad] ?? r.prioridad}
            </span>
            {!r.activo && (
              <span className="rounded-full bg-muted px-2 py-0.5 font-semibold text-muted-foreground">
                Inactiva
              </span>
            )}
          </p>
          {r.descripcion && (
            <p className="mt-1.5 text-xs text-muted-foreground">{r.descripcion}</p>
          )}
          {(r.evento || r.condicion) && (
            <p className="mt-1 text-[11px] text-muted-foreground">
              {r.evento ? `Evento: ${r.evento}` : ""}
              {r.evento && r.condicion ? " · " : ""}
              {r.condicion ? `Condición: ${r.condicion}` : ""}
            </p>
          )}
        </div>
        {isAdmin && (
          <div className="flex shrink-0 items-center gap-1.5">
            <Switch checked={r.activo} onCheckedChange={() => toggleActivo(r)} />
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
  );

  return (
    <div className="space-y-4">
      {isAdmin && (
        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] text-muted-foreground">
            {total} regla(s) · {activas} activa(s)
          </p>
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
      )}

      {isLoading ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Cargando reglas…</p>
      ) : (
        <>
          <Panel title="Reglas de coordinación · Entrantes" bodyMaxHeight={null}>
            {entrantes.length > 0 ? (
              <div className="grid gap-3">
                {entrantes.map((r) => (
                  <Card key={r.id} r={r} />
                ))}
              </div>
            ) : (
              <p className="py-4 text-center text-sm text-muted-foreground">
                No hay reglas de entrantes.
              </p>
            )}
          </Panel>

          <Panel title="Reglas de coordinación · Salientes" bodyMaxHeight={null}>
            {salientes.length > 0 ? (
              <div className="grid gap-3">
                {salientes.map((r) => (
                  <Card key={r.id} r={r} />
                ))}
              </div>
            ) : (
              <p className="py-4 text-center text-sm text-muted-foreground">
                No hay reglas de salientes.
              </p>
            )}
          </Panel>
        </>
      )}

      <div className="flex items-start gap-2 rounded-xl border border-status-sky/30 bg-status-sky/10 p-4 text-xs text-muted-foreground">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-status-sky" />
        <span>
          Estas reglas producen <strong>alertas de coordinación persistentes</strong> (no avisos
          operativos). Las reglas base no se eliminan: se activan/desactivan o archivan. Los canales
          de salida se toman de Notificaciones externas sin duplicar credenciales.
        </span>
      </div>

      <ReglaCoordinacionFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        editing={editing}
        onSubmit={guardar}
      />

      <AlertDialog open={!!archivar} onOpenChange={(v) => !v && setArchivar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Archivar regla de coordinación?</AlertDialogTitle>
            <AlertDialogDescription>
              «{archivar?.nombre}» se archivará y dejará de generar alertas. No se elimina
              físicamente y se puede restaurar desde base de datos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmarArchivar}>Archivar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
