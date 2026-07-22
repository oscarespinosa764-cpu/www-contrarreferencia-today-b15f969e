import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/lib/backend-client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Trash2, Plus, Save, Loader2 } from "lucide-react";
import {
  useCatalogoCategorias,
  useCatalogoTiposMeta,
  ICONOS_PERMITIDOS,
  iconoDe,
  type CatalogoCategoria,
} from "@/lib/catalogo-categorias";
import { registrarAuditoria } from "@/lib/auditoria.functions";

const ICONO_KEYS = Object.keys(ICONOS_PERMITIDOS);

type EditableCategoria = {
  id?: string;
  codigo: string;
  nombre: string;
  descripcion: string;
  icono: string;
  orden: number;
  activo: boolean;
};

const EMPTY: EditableCategoria = {
  codigo: "",
  nombre: "",
  descripcion: "",
  icono: "package",
  orden: 100,
  activo: true,
};

export function AdminCategoriasDialog({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const cats = useCatalogoCategorias();
  const tipos = useCatalogoTiposMeta();
  const [tab, setTab] = useState("categorias");
  const [editing, setEditing] = useState<EditableCategoria | null>(null);

  // conteo de tipos por categoría (para bloquear eliminación)
  const tiposPorCat = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of tipos.data ?? []) {
      map.set(t.categoria_id, (map.get(t.categoria_id) ?? 0) + 1);
    }
    return map;
  }, [tipos.data]);

  const invalidarTodo = () => {
    queryClient.invalidateQueries({ queryKey: ["catalogo-categorias-config"] });
    queryClient.invalidateQueries({ queryKey: ["catalogo-tipos-config"] });
    queryClient.invalidateQueries({ queryKey: ["catalogo-categorias-counts"] });
  };

  const saveCat = useMutation({
    mutationFn: async (data: EditableCategoria) => {
      const payload = {
        codigo: data.codigo.trim().toUpperCase(),
        nombre: data.nombre.trim(),
        descripcion: data.descripcion.trim() || null,
        icono: data.icono,
        orden: data.orden,
        activo: data.activo,
      };
      if (!payload.codigo || !/^[A-Z0-9_]+$/.test(payload.codigo)) {
        throw new Error("Código inválido (solo A-Z, 0-9 y _).");
      }
      if (!payload.nombre) throw new Error("El nombre es obligatorio.");
      if (data.id) {
        const { error } = await supabase
          .from("catalogo_categorias")
          .update(payload)
          .eq("id", data.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("catalogo_categorias")
          .insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: (_v, vars) => {
      toast.success(vars.id ? "Categoría actualizada." : "Categoría creada.");
      registrarAuditoria({
        data: {
          accion: vars.id ? "categoria.update" : "categoria.insert",
          modulo: "catalogos",
          tabla: "catalogo_categorias",
          registroId: vars.id ?? null,
          resultado: "exito",
          detalles: { codigo: vars.codigo, nombre: vars.nombre },
        },
      }).catch(() => {});
      setEditing(null);
      invalidarTodo();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteCat = useMutation({
    mutationFn: async (cat: CatalogoCategoria) => {
      if ((tiposPorCat.get(cat.id) ?? 0) > 0) {
        throw new Error(
          "No se puede eliminar: la categoría tiene tipos asignados. Reasígnalos primero.",
        );
      }
      const { error } = await supabase
        .from("catalogo_categorias")
        .delete()
        .eq("id", cat.id);
      if (error) throw error;
    },
    onSuccess: (_v, cat) => {
      toast.success("Categoría eliminada.");
      registrarAuditoria({
        data: {
          accion: "categoria.delete",
          modulo: "catalogos",
          tabla: "catalogo_categorias",
          registroId: cat.id,
          resultado: "exito",
          detalles: { codigo: cat.codigo, nombre: cat.nombre },
        },
      }).catch(() => {});
      invalidarTodo();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const reasignTipo = useMutation({
    mutationFn: async (v: { tipo: string; categoria_id: string }) => {
      const { error } = await supabase
        .from("catalogo_tipos")
        .update({ categoria_id: v.categoria_id })
        .eq("tipo", v.tipo);
      if (error) throw error;
    },
    onSuccess: (_v, vars) => {
      registrarAuditoria({
        data: {
          accion: "tipo.reasignar",
          modulo: "catalogos",
          tabla: "catalogo_tipos",
          registroId: vars.tipo,
          resultado: "exito",
          detalles: { categoria_id: vars.categoria_id },
        },
      }).catch(() => {});
      invalidarTodo();
      toast.success("Tipo reasignado.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="h-[90dvh] max-h-none w-[95vw] max-w-4xl overflow-hidden p-0">
        <div className="flex h-full min-h-0 flex-col">
          <DialogHeader className="shrink-0 border-b border-border px-5 py-3">
            <DialogTitle>Administración de categorías de catálogos</DialogTitle>
            <p className="text-xs text-muted-foreground">
              Gestiona las categorías visibles y reasigna cada tipo técnico a su
              categoría.
            </p>
          </DialogHeader>

          <Tabs
            value={tab}
            onValueChange={setTab}
            className="flex min-h-0 flex-1 flex-col"
          >
            <TabsList className="mx-5 mt-3 shrink-0 self-start">
              <TabsTrigger value="categorias">Categorías</TabsTrigger>
              <TabsTrigger value="asignaciones">
                Asignación de tipos
              </TabsTrigger>
            </TabsList>

            {/* -------- Categorías -------- */}
            <TabsContent
              value="categorias"
              className="mt-0 min-h-0 flex-1 overflow-auto px-5 py-4"
            >
              <div className="mb-3 flex justify-end">
                <Button
                  size="sm"
                  onClick={() => setEditing({ ...EMPTY })}
                  disabled={saveCat.isPending}
                >
                  <Plus className="mr-1.5 h-4 w-4" /> Nueva categoría
                </Button>
              </div>
              <div className="space-y-2">
                {(cats.data ?? []).map((c) => {
                  const Icon = iconoDe(c.icono);
                  const nTipos = tiposPorCat.get(c.id) ?? 0;
                  return (
                    <Card key={c.id} className="flex items-center gap-3 p-3">
                      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                        <Icon className="h-5 w-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="truncate font-semibold">{c.nombre}</p>
                          <Badge variant="secondary" className="text-[10px]">
                            {c.codigo}
                          </Badge>
                          {!c.activo && (
                            <Badge variant="outline" className="text-[10px]">
                              Inactiva
                            </Badge>
                          )}
                          <span className="text-[11px] text-muted-foreground">
                            {nTipos} tipos
                          </span>
                        </div>
                        <p className="line-clamp-1 text-xs text-muted-foreground">
                          {c.descripcion ?? "—"}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          setEditing({
                            id: c.id,
                            codigo: c.codigo,
                            nombre: c.nombre,
                            descripcion: c.descripcion ?? "",
                            icono: c.icono,
                            orden: c.orden,
                            activo: c.activo,
                          })
                        }
                      >
                        Editar
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive"
                        onClick={() => {
                          if (
                            confirm(`¿Eliminar la categoría "${c.nombre}"?`)
                          ) {
                            deleteCat.mutate(c);
                          }
                        }}
                        disabled={nTipos > 0 || deleteCat.isPending}
                        title={
                          nTipos > 0
                            ? "Reasigna los tipos antes de eliminar"
                            : "Eliminar"
                        }
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </Card>
                  );
                })}
                {cats.isLoading && (
                  <p className="py-4 text-center text-sm text-muted-foreground">
                    Cargando…
                  </p>
                )}
              </div>
            </TabsContent>

            {/* -------- Asignación de tipos -------- */}
            <TabsContent
              value="asignaciones"
              className="mt-0 min-h-0 flex-1 overflow-auto px-5 py-4"
            >
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40">
                    <tr className="text-left text-xs uppercase text-muted-foreground">
                      <th className="px-3 py-2">Tipo técnico</th>
                      <th className="px-3 py-2">Nombre visible</th>
                      <th className="px-3 py-2">Categoría</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(tipos.data ?? [])
                      .slice()
                      .sort((a, b) => a.tipo.localeCompare(b.tipo))
                      .map((t) => (
                        <tr key={t.tipo} className="border-t border-border">
                          <td className="px-3 py-2 font-mono text-xs">
                            {t.tipo}
                          </td>
                          <td className="px-3 py-2 text-xs">
                            {t.nombre_visible}
                          </td>
                          <td className="px-3 py-2">
                            <select
                              value={t.categoria_id}
                              disabled={reasignTipo.isPending}
                              onChange={(e) =>
                                reasignTipo.mutate({
                                  tipo: t.tipo,
                                  categoria_id: e.target.value,
                                })
                              }
                              className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                            >
                              {(cats.data ?? []).map((c) => (
                                <option key={c.id} value={c.id}>
                                  {c.nombre}
                                </option>
                              ))}
                            </select>
                          </td>
                        </tr>
                      ))}
                    {(!tipos.data || tipos.data.length === 0) && (
                      <tr>
                        <td
                          colSpan={3}
                          className="px-3 py-8 text-center text-sm text-muted-foreground"
                        >
                          {tipos.isLoading ? "Cargando…" : "Sin tipos."}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                Los cambios se aplican en tiempo real y quedan registrados en
                auditoría.
              </p>
            </TabsContent>
          </Tabs>

          <DialogFooter className="shrink-0 border-t border-border px-5 py-3">
            <Button variant="outline" size="sm" onClick={onClose}>
              Cerrar
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>

      {/* Editor lateral simple como diálogo anidado */}
      {editing && (
        <Dialog open onOpenChange={(o) => !o && setEditing(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>
                {editing.id ? "Editar categoría" : "Nueva categoría"}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label className="text-xs">Código</Label>
                <Input
                  value={editing.codigo}
                  onChange={(e) =>
                    setEditing({ ...editing, codigo: e.target.value.toUpperCase() })
                  }
                  placeholder="EJ_NUEVA_CATEGORIA"
                  disabled={!!editing.id}
                />
                <p className="mt-1 text-[10px] text-muted-foreground">
                  Solo mayúsculas, números y _. No editable después de crear.
                </p>
              </div>
              <div>
                <Label className="text-xs">Nombre</Label>
                <Input
                  value={editing.nombre}
                  onChange={(e) =>
                    setEditing({ ...editing, nombre: e.target.value })
                  }
                />
              </div>
              <div>
                <Label className="text-xs">Descripción</Label>
                <Textarea
                  rows={2}
                  value={editing.descripcion}
                  onChange={(e) =>
                    setEditing({ ...editing, descripcion: e.target.value })
                  }
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Icono</Label>
                  <select
                    value={editing.icono}
                    onChange={(e) =>
                      setEditing({ ...editing, icono: e.target.value })
                    }
                    className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                  >
                    {ICONO_KEYS.map((k) => (
                      <option key={k} value={k}>
                        {k}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label className="text-xs">Orden</Label>
                  <Input
                    type="number"
                    value={editing.orden}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        orden: parseInt(e.target.value) || 0,
                      })
                    }
                  />
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={editing.activo}
                  onChange={(e) =>
                    setEditing({ ...editing, activo: e.target.checked })
                  }
                />
                Activa
              </label>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditing(null)}>
                Cancelar
              </Button>
              <Button
                onClick={() => saveCat.mutate(editing)}
                disabled={saveCat.isPending}
              >
                {saveCat.isPending ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="mr-1.5 h-4 w-4" />
                )}
                Guardar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </Dialog>
  );
}
