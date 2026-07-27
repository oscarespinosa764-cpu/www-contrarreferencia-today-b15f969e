import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/lib/backend-client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { FiltersBar, countActiveFilters } from "@/components/filters/filters-bar";
import { Plus, Trash2, CheckCircle2, Archive, AlertTriangle, RefreshCw, Pencil } from "lucide-react";
import { ChecklistFormDialog } from "./checklist-form-dialog";

// ============================================================
// Panel administrativo de LISTAS DE CHEQUEO (Fase Q4).
// - Solo admin puede crear/editar/activar versiones.
// - Cada checklist tiene N versiones; solo UNA activa a la vez
//   (garantizado por índice único parcial en DB).
// - Los items se editan como filas simples (texto + requerido).
// - No integra generadores de PDF: eso es un paso posterior.
// ============================================================

type Checklist = {
  id: string;
  codigo: string;
  nombre: string;
  modulo: string;
  activo: boolean;
  estado_revision: string | null;
  versionActiva: number | null;
  itemCount: number;
};

type ChecklistItem = { id: string; texto: string; requerido: boolean };

type Version = {
  id: string;
  checklist_id: string;
  version: number;
  estado: "BORRADOR" | "ACTIVA" | "ARCHIVADA";
  items: ChecklistItem[];
  notas: string | null;
  updated_at: string;
};

export function ChecklistsPanel() {
  const { isAdmin } = useAuth();
  const qc = useQueryClient();

  const [moduloFiltro, setModuloFiltro] = useState("todos");
  const [estadoFiltro, setEstadoFiltro] = useState("activas");
  const [busqueda, setBusqueda] = useState("");

  const {
    data: checklists,
    isLoading: cargandoChecklists,
    isError: checklistsError,
    error: checklistsErrorObj,
    refetch: refetchChecklists,
  } = useQuery<Checklist[]>({
    queryKey: ["cm-checklists"],
    queryFn: async () => {
      const { data: listas, error } = await supabase
        .from("checklists")
        .select("id, codigo, nombre, modulo, activo, estado_revision")
        .order("codigo", { ascending: true });
      if (error) throw error;
      const rows = (listas ?? []) as Array<Omit<Checklist, "versionActiva" | "itemCount">>;
      if (rows.length === 0) return [];

      const { data: versiones, error: versionError } = await supabase
        .from("checklist_versiones")
        .select("checklist_id, version, estado, items")
        .in(
          "checklist_id",
          rows.map((r) => r.id),
        )
        .eq("estado", "ACTIVA");
      if (versionError) throw versionError;

      const versionesActivas = new Map(
        (versiones ?? []).map((v) => [
          v.checklist_id,
          {
            version: Number(v.version),
            items: Array.isArray(v.items) ? v.items.length : 0,
          },
        ]),
      );

      return rows.map((r) => {
        const activa = versionesActivas.get(r.id);
        return {
          ...r,
          versionActiva: activa?.version ?? null,
          itemCount: activa?.items ?? 0,
        };
      });
    },
  });

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dialogCrear, setDialogCrear] = useState(false);
  const [dialogEditar, setDialogEditar] = useState(false);
  const modulos = useMemo(
    () => Array.from(new Set((checklists ?? []).map((c) => c.modulo))).sort(),
    [checklists],
  );
  const filtradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return (checklists ?? []).filter((c) => {
      if (moduloFiltro !== "todos" && c.modulo !== moduloFiltro) return false;
      if (estadoFiltro === "activas" && !c.activo) return false;
      if (estadoFiltro === "inactivas" && c.activo) return false;
      if (!q) return true;
      return [c.nombre, c.codigo, c.modulo].some((v) => v.toLowerCase().includes(q));
    });
  }, [busqueda, checklists, estadoFiltro, moduloFiltro]);
  const seleccion = useMemo(
    () => (selectedId ? filtradas.find((c) => c.id === selectedId) : filtradas[0]) ?? null,
    [filtradas, selectedId],
  );

  const {
    data: versiones,
    isLoading: cargandoVersiones,
    isError: versionesError,
    error: versionesErrorObj,
    refetch: refetchVersiones,
  } = useQuery<Version[]>({
    queryKey: ["cm-checklist-versiones", seleccion?.id],
    enabled: !!seleccion?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("checklist_versiones")
        .select("id, checklist_id, version, estado, items, notas, updated_at")
        .eq("checklist_id", seleccion!.id)
        .order("version", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Version[];
    },
  });

  if (!isAdmin) {
    return (
      <p className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
        Solo administradores pueden gestionar listas de chequeo.
      </p>
    );
  }

  const crearNuevaVersion = async () => {
    if (!seleccion) return;
    const proxima = ((versiones?.[0]?.version ?? 0) as number) + 1;
    const base = versiones?.[0]?.items ?? [];
    const { error } = await supabase.from("checklist_versiones").insert({
      checklist_id: seleccion.id,
      version: proxima,
      estado: "BORRADOR",
      items: base,
    });
    if (error) toast.error(error.message);
    else {
      toast.success(`Versión ${proxima} creada en borrador`);
      qc.invalidateQueries({ queryKey: ["cm-checklists"] });
      qc.invalidateQueries({ queryKey: ["cm-checklist-versiones", seleccion.id] });
    }
  };

  const errorMessage = (err: unknown) =>
    err instanceof Error ? err.message : "No fue posible completar la consulta.";

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-[280px_1fr]">
      <aside className="space-y-2 rounded-xl border border-border bg-card p-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold">Listas registradas</h3>
            <p className="text-[11px] text-muted-foreground">
              {filtradas.length} visibles · {checklists?.length ?? 0} registradas
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={() => setDialogCrear(true)}>
            <Plus className="mr-1 h-3.5 w-3.5" /> Nueva
          </Button>
        </div>

        <FiltersBar
          alwaysCompact
          activeCount={countActiveFilters(
            { busqueda, moduloFiltro, estadoFiltro },
            { busqueda: "", moduloFiltro: "todos", estadoFiltro: "activas" },
          )}
          onClear={() => { setBusqueda(""); setModuloFiltro("todos"); setEstadoFiltro("activas"); }}
          primary={
            <Input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar por nombre o código"
              className="h-8 flex-1 text-xs"
            />
          }
          secondary={
            <>
              <Select value={moduloFiltro} onValueChange={setModuloFiltro}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Módulo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos los módulos</SelectItem>
                  {modulos.map((m) => (
                    <SelectItem key={m} value={m}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={estadoFiltro} onValueChange={setEstadoFiltro}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Estado" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="activas">Activas</SelectItem>
                  <SelectItem value="todas">Todas</SelectItem>
                  <SelectItem value="inactivas">Inactivas</SelectItem>
                </SelectContent>
              </Select>
            </>
          }
        />


        {cargandoChecklists && (
          <div className="space-y-2">
            <Skeleton className="h-16" />
            <Skeleton className="h-16" />
            <Skeleton className="h-16" />
          </div>
        )}

        {checklistsError && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>No se pudieron leer las listas</AlertTitle>
            <AlertDescription className="space-y-2">
              <p>{errorMessage(checklistsErrorObj)}</p>
              <Button size="sm" variant="outline" onClick={() => refetchChecklists()}>
                <RefreshCw className="mr-1 h-3.5 w-3.5" /> Reintentar
              </Button>
            </AlertDescription>
          </Alert>
        )}

        <ul className="space-y-1">
          {!cargandoChecklists && !checklistsError && filtradas.map((c) => {
            const active = seleccion?.id === c.id;
            return (
              <li key={c.id}>
                <button
                  onClick={() => setSelectedId(c.id)}
                  className={`w-full rounded-md border px-3 py-2 text-left text-sm transition ${
                    active
                      ? "border-primary bg-primary/10 text-foreground"
                      : "border-border bg-background hover:bg-muted"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="font-medium uppercase leading-tight">{c.nombre}</div>
                    <Badge variant={c.activo ? "default" : "outline"}>
                      {c.activo ? "ACTIVA" : "INACTIVA"}
                    </Badge>
                  </div>
                  <div className="mt-1 text-[11px] text-muted-foreground">
                    {c.codigo} · módulo {c.modulo}
                  </div>
                  <div className="mt-1 text-[11px] text-muted-foreground">
                    v{c.versionActiva ?? "—"} activa · {c.itemCount} ítems
                  </div>
                  {c.estado_revision && c.estado_revision !== "ACTIVA" ? (
                    <div className="mt-1 text-[11px] font-semibold text-amber-600">
                      {c.estado_revision.replace(/_/g, " ")}
                    </div>
                  ) : null}
                </button>
              </li>
            );
          })}
          {!cargandoChecklists && !checklistsError && filtradas.length === 0 && (
            <li className="rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground">
              {(checklists?.length ?? 0) === 0
                ? "Aún no hay listas registradas."
                : "No hay listas que coincidan con los filtros visibles."}
            </li>
          )}
        </ul>
      </aside>

      <section className="space-y-4 rounded-xl border border-border bg-card p-4">
        {!seleccion ? (
          <p className="text-sm text-muted-foreground">Seleccione una lista para gestionarla.</p>
        ) : (
          <>
            <header className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-base font-semibold">{seleccion.nombre}</h3>
                <p className="text-xs text-muted-foreground">
                  {seleccion.codigo} · módulo {seleccion.modulo}
                </p>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setDialogEditar(true)}>
                  <Pencil className="mr-1 h-4 w-4" /> Editar
                </Button>
                <Button size="sm" onClick={crearNuevaVersion}>
                  <Plus className="mr-1 h-4 w-4" /> Nueva versión (borrador)
                </Button>
              </div>
            </header>

            <div className="grid gap-2 text-xs sm:grid-cols-2 lg:grid-cols-4">
              <Info label="Estado" value={seleccion.activo ? "ACTIVA" : "INACTIVA"} />
              <Info label="Versión activa" value={seleccion.versionActiva ? `v${seleccion.versionActiva}` : "Sin versión activa"} />
              <Info label="Ítems activos" value={String(seleccion.itemCount)} />
              <Info label="Dependencias" value="Sin dependencias registradas" />
              <Info label="Plantilla PDF vinculada" value="No configurada" className="sm:col-span-2" />
              <Info
                label="Punto de ejecución"
                value={
                  seleccion.codigo === "TURNO_APERTURA"
                    ? "Configurada — sin punto de ejecución asignado"
                    : seleccion.codigo === "PHD_RADICACION_VALIDACION"
                      ? "Radicación PHD/PAD/O2"
                      : seleccion.codigo === "SALIENTES_ENTREGA_SEGURA"
                        ? "Entrega documental salientes"
                        : "No registrado"
                }
                className="sm:col-span-2"
              />
            </div>

            <div className="space-y-3">
              {cargandoVersiones && (
                <div className="space-y-2">
                  <Skeleton className="h-24" />
                  <Skeleton className="h-24" />
                </div>
              )}
              {versionesError && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>No se pudieron leer las versiones</AlertTitle>
                  <AlertDescription className="space-y-2">
                    <p>{errorMessage(versionesErrorObj)}</p>
                    <Button size="sm" variant="outline" onClick={() => refetchVersiones()}>
                      <RefreshCw className="mr-1 h-3.5 w-3.5" /> Reintentar
                    </Button>
                  </AlertDescription>
                </Alert>
              )}
              {!cargandoVersiones && !versionesError && (versiones ?? []).map((v) => (
                <VersionCard key={v.id} version={v} />
              ))}
              {!cargandoVersiones && !versionesError && (!versiones || versiones.length === 0) && (
                <p className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
                  Sin versiones. Cree la primera.
                </p>
              )}
            </div>
          </>
        )}
      </section>

      <ChecklistFormDialog
        open={dialogCrear}
        onOpenChange={setDialogCrear}
        modo="crear"
      />
      <ChecklistFormDialog
        open={dialogEditar}
        onOpenChange={setDialogEditar}
        modo="editar"
        inicial={seleccion ? {
          id: seleccion.id,
          codigo: seleccion.codigo,
          nombre: seleccion.nombre,
          modulo: seleccion.modulo,
          activo: seleccion.activo,
        } : null}
      />
    </div>
  );
}

function Info({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className={`rounded-md border border-border/70 bg-background p-2 ${className ?? ""}`}>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 font-medium text-foreground">{value}</p>
    </div>
  );
}

function VersionCard({ version }: { version: Version }) {
  const qc = useQueryClient();
  const [items, setItems] = useState<ChecklistItem[]>(version.items ?? []);
  const [notas, setNotas] = useState(version.notas ?? "");
  const [dirty, setDirty] = useState(false);

  const editable = version.estado === "BORRADOR";

  const guardar = async () => {
    const { error } = await supabase
      .from("checklist_versiones")
      .update({ items, notas })
      .eq("id", version.id);
    if (error) toast.error(error.message);
    else {
      toast.success("Versión guardada");
      setDirty(false);
      qc.invalidateQueries({ queryKey: ["cm-checklists"] });
      qc.invalidateQueries({ queryKey: ["cm-checklist-versiones", version.checklist_id] });
    }
  };

  const activar = async () => {
    // Archiva la actualmente activa y activa esta (transacción implícita del cliente).
    const { error: e1 } = await supabase
      .from("checklist_versiones")
      .update({ estado: "ARCHIVADA" })
      .eq("checklist_id", version.checklist_id)
      .eq("estado", "ACTIVA");
    if (e1) return toast.error(e1.message);
    const { error: e2 } = await supabase
      .from("checklist_versiones")
      .update({ estado: "ACTIVA" })
      .eq("id", version.id);
    if (e2) return toast.error(e2.message);
    toast.success(`Versión ${version.version} activa`);
    qc.invalidateQueries({ queryKey: ["cm-checklists"] });
    qc.invalidateQueries({ queryKey: ["cm-checklist-versiones", version.checklist_id] });
  };

  const archivar = async () => {
    const { error } = await supabase
      .from("checklist_versiones")
      .update({ estado: "ARCHIVADA" })
      .eq("id", version.id);
    if (error) toast.error(error.message);
    else {
      toast.success(`Versión ${version.version} archivada`);
      qc.invalidateQueries({ queryKey: ["cm-checklists"] });
      qc.invalidateQueries({ queryKey: ["cm-checklist-versiones", version.checklist_id] });
    }
  };

  const addItem = () => {
    setItems((prev) => [
      ...prev,
      { id: `i${Date.now()}`, texto: "Nuevo ítem", requerido: false },
    ]);
    setDirty(true);
  };

  return (
    <article className="space-y-3 rounded-lg border border-border bg-background p-3">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold">Versión {version.version}</span>
          <span className="text-[11px] text-muted-foreground">{items.length} ítems</span>
          <Badge
            variant={
              version.estado === "ACTIVA"
                ? "default"
                : version.estado === "BORRADOR"
                  ? "secondary"
                  : "outline"
            }
          >
            {version.estado}
          </Badge>
        </div>
        <div className="flex gap-2">
          {editable && dirty && (
            <Button size="sm" onClick={guardar}>
              Guardar cambios
            </Button>
          )}
          {version.estado === "BORRADOR" && (
            <Button size="sm" variant="outline" onClick={activar}>
              <CheckCircle2 className="mr-1 h-4 w-4" /> Activar
            </Button>
          )}
          {version.estado === "ACTIVA" && (
            <Button size="sm" variant="ghost" onClick={archivar}>
              <Archive className="mr-1 h-4 w-4" /> Archivar
            </Button>
          )}
        </div>
      </header>

      <div className="space-y-2">
        {items.map((it, idx) => (
          <div key={it.id} className="flex items-start gap-2 rounded-md border border-border/60 p-2">
            <Input
              value={it.texto}
              disabled={!editable}
              onChange={(e) => {
                const t = e.target.value;
                setItems((prev) => prev.map((x, i) => (i === idx ? { ...x, texto: t } : x)));
                setDirty(true);
              }}
            />
            <label className="flex items-center gap-1 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={it.requerido}
                disabled={!editable}
                onChange={(e) => {
                  const v = e.target.checked;
                  setItems((prev) =>
                    prev.map((x, i) => (i === idx ? { ...x, requerido: v } : x)),
                  );
                  setDirty(true);
                }}
              />
              Requerido
            </label>
            {editable && (
              <Button
                size="icon"
                variant="ghost"
                onClick={() => {
                  setItems((prev) => prev.filter((_, i) => i !== idx));
                  setDirty(true);
                }}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        ))}
        {editable && (
          <Button size="sm" variant="outline" onClick={addItem}>
            <Plus className="mr-1 h-4 w-4" /> Agregar ítem
          </Button>
        )}
      </div>

      <div>
        <label className="text-xs text-muted-foreground">Notas de la versión</label>
        <Textarea
          value={notas}
          disabled={!editable}
          onChange={(e) => {
            setNotas(e.target.value);
            setDirty(true);
          }}
          rows={2}
        />
      </div>
    </article>
  );
}
