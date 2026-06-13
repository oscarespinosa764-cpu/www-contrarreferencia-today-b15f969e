import { useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
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
import { Search, Plus, Copy, Pencil, Trash2, Sparkles, Tag } from "lucide-react";
import { toast } from "sonner";
import { PASOS, VARIABLES, pasosLabels } from "@/lib/plantillas-variables";
import { generarPlantillaTexto } from "@/lib/ai.functions";

type Plantilla = {
  id: string;
  categoria: string | null;
  subcategoria: string | null;
  indicativo: string | null;
  nombre: string | null;
  mensaje: string | null;
  variables: string | null;
  activo: boolean;
  archivado: boolean;
  pasos: string[] | null;
  condicion: string | null;
};

const ALL = "__all__";

const emptyForm = {
  nombre: "",
  categoria: "",
  subcategoria: "",
  indicativo: "",
  mensaje: "",
  pasos: [] as string[],
  condicion: "",
};

export function PlantillasBiblioteca() {
  const { isAdmin, canEdit } = useAuth();
  const qc = useQueryClient();

  const [q, setQ] = useState("");
  const [catFilter, setCatFilter] = useState<string>(ALL);
  const [indFilter, setIndFilter] = useState<string>(ALL);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [delId, setDelId] = useState<string | null>(null);
  const [genDesc, setGenDesc] = useState("");
  const [generando, setGenerando] = useState(false);
  const msgRef = useRef<HTMLTextAreaElement>(null);
  const generar = useServerFn(generarPlantillaTexto);

  const { data: plantillas, isLoading } = useQuery({
    queryKey: ["plantillas-biblioteca"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("plantillas")
        .select("id, categoria, subcategoria, indicativo, nombre, mensaje, variables, activo, archivado, pasos, condicion")
        .eq("archivado", false)
        .order("categoria")
        .order("nombre");
      if (error) throw error;
      return data as Plantilla[];
    },
  });

  const categorias = useMemo(
    () => Array.from(new Set((plantillas ?? []).map((p) => p.categoria).filter(Boolean) as string[])).sort(),
    [plantillas],
  );
  const indicativos = useMemo(
    () => Array.from(new Set((plantillas ?? []).map((p) => p.indicativo).filter(Boolean) as string[])).sort(),
    [plantillas],
  );

  const term = q.trim().toLowerCase();
  const filtradas = useMemo(() => {
    return (plantillas ?? []).filter((p) => {
      if (catFilter !== ALL && p.categoria !== catFilter) return false;
      if (indFilter !== ALL && p.indicativo !== indFilter) return false;
      if (!term) return true;
      return [p.nombre, p.indicativo, p.categoria, p.subcategoria, p.mensaje]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(term);
    });
  }, [plantillas, catFilter, indFilter, term]);

  const copiar = (txt: string | null) => {
    navigator.clipboard.writeText(txt ?? "");
    toast.success("Plantilla copiada");
  };

  const openNueva = () => {
    setEditId(null);
    setForm(emptyForm);
    setGenDesc("");
    setDialogOpen(true);
  };

  const openEditar = (p: Plantilla) => {
    setEditId(p.id);
    setForm({
      nombre: p.nombre ?? "",
      categoria: p.categoria ?? "",
      subcategoria: p.subcategoria ?? "",
      indicativo: p.indicativo ?? "",
      mensaje: p.mensaje ?? "",
      pasos: p.pasos ?? [],
      condicion: p.condicion ?? "",
    });
    setGenDesc("");
    setDialogOpen(true);
  };

  const togglePaso = (id: string) => {
    setForm((f) => ({
      ...f,
      pasos: f.pasos.includes(id) ? f.pasos.filter((p) => p !== id) : [...f.pasos, id],
    }));
  };

  const insertarVariable = (token: string) => {
    const el = msgRef.current;
    const ins = `{{${token}}}`;
    if (!el) {
      setForm((f) => ({ ...f, mensaje: f.mensaje + ins }));
      return;
    }
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? el.value.length;
    const next = el.value.slice(0, start) + ins + el.value.slice(end);
    setForm((f) => ({ ...f, mensaje: next }));
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + ins.length;
      el.setSelectionRange(pos, pos);
    });
  };

  const generarBorrador = async () => {
    if (!genDesc.trim()) return toast.error("Describe qué texto necesitas para generarlo");
    setGenerando(true);
    try {
      const pasoLabel = pasosLabels(form.pasos).join(", ");
      const res = await generar({
        data: {
          descripcion: genDesc.trim(),
          paso: pasoLabel,
          variables: VARIABLES.map((v) => v.token),
        },
      });
      if (res.error) toast.error(res.error);
      else if (res.texto) {
        setForm((f) => ({ ...f, mensaje: res.texto }));
        toast.success("Borrador generado. Revísalo y ajústalo.");
      }
    } catch {
      toast.error("No se pudo generar el borrador");
    } finally {
      setGenerando(false);
    }
  };

  const guardar = async () => {
    if (!form.nombre.trim() || !form.mensaje.trim()) {
      return toast.error("El nombre y el mensaje son obligatorios");
    }
    setSaving(true);
    const payload = {
      nombre: form.nombre.trim(),
      categoria: form.categoria.trim() || null,
      subcategoria: form.subcategoria.trim() || null,
      indicativo: form.indicativo.trim() || null,
      mensaje: form.mensaje,
      pasos: form.pasos,
      condicion: form.condicion.trim() || null,
    };
    const { error } = editId
      ? await supabase.from("plantillas").update(payload).eq("id", editId)
      : await supabase.from("plantillas").insert({ ...payload, activo: true, archivado: false });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(editId ? "Plantilla actualizada" : "Plantilla creada");
    setDialogOpen(false);
    qc.invalidateQueries({ queryKey: ["plantillas-biblioteca"] });
    qc.invalidateQueries({ queryKey: ["plantillas-paso"] });
  };

  const eliminar = async () => {
    if (!delId) return;
    const { error } = await supabase.from("plantillas").delete().eq("id", delId);
    setDelId(null);
    if (error) return toast.error(error.message);
    toast.success("Plantilla eliminada");
    qc.invalidateQueries({ queryKey: ["plantillas-biblioteca"] });
  };

  return (
    <div className="space-y-4">
      {/* Barra de búsqueda y filtros */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="rounded-full pl-9"
            placeholder="Buscar por nombre, indicativo o contenido…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>

        <Select value={indFilter} onValueChange={setIndFilter}>
          <SelectTrigger className="w-full rounded-full lg:w-52">
            <SelectValue placeholder="Todos los indicativos" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todos los indicativos</SelectItem>
            {indicativos.map((i) => (
              <SelectItem key={i} value={i}>
                {i}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={catFilter} onValueChange={setCatFilter}>
          <SelectTrigger className="w-full rounded-full lg:w-56">
            <SelectValue placeholder="Todas las categorías" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todas las categorías</SelectItem>
            {categorias.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="whitespace-nowrap rounded-full px-3 py-1">
            {filtradas.length} plantilla{filtradas.length === 1 ? "" : "s"}
          </Badge>
          {canEdit && (
            <Button size="sm" className="rounded-full" onClick={openNueva}>
              <Plus className="mr-1.5 h-4 w-4" /> Nueva plantilla
            </Button>
          )}
        </div>
      </div>

      {/* Cuadrícula de tarjetas */}
      {isLoading ? (
        <p className="py-10 text-center text-sm text-muted-foreground">Cargando…</p>
      ) : filtradas.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {filtradas.map((p) => (
            <div
              key={p.id}
              className="flex flex-col rounded-xl border border-border border-t-4 border-t-status-blue bg-card p-3.5 shadow-sm"
            >
              {p.categoria && (
                <Badge variant="secondary" className="mb-1.5 w-fit rounded-md text-[10px] uppercase tracking-wide">
                  {p.categoria}
                </Badge>
              )}
              <p className="text-sm font-bold leading-snug text-foreground">{p.nombre}</p>
              {(p.subcategoria || p.indicativo) && (
                <p className="mt-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {p.subcategoria || p.indicativo}
                </p>
              )}
              <p className="mt-2 line-clamp-4 whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">
                {p.mensaje}
              </p>

              <div className="mt-3 flex flex-wrap gap-1.5 border-t border-border pt-2.5">
                <Button size="sm" className="h-8 flex-1 rounded-md text-xs" onClick={() => copiar(p.mensaje)}>
                  <Copy className="mr-1 h-3.5 w-3.5" /> Copiar
                </Button>
                {canEdit && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 flex-1 rounded-md text-xs"
                    onClick={() => openEditar(p)}
                  >
                    <Pencil className="mr-1 h-3.5 w-3.5" /> Editar
                  </Button>
                )}
                {isAdmin && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 flex-1 rounded-md text-xs text-status-red hover:text-status-red"
                    onClick={() => setDelId(p.id)}
                  >
                    <Trash2 className="mr-1 h-3.5 w-3.5" /> Eliminar
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="py-10 text-center text-sm text-muted-foreground">
          No se encontraron plantillas con los filtros seleccionados.
        </p>
      )}

      {/* Diálogo nuevo / editar */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editId ? "Editar plantilla" : "Nueva plantilla"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="pl-nombre">Nombre</Label>
              <Input
                id="pl-nombre"
                value={form.nombre}
                onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
                placeholder="Ej: Aceptación EPS"
              />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="pl-cat">Categoría</Label>
                <Input
                  id="pl-cat"
                  value={form.categoria}
                  onChange={(e) => setForm((f) => ({ ...f, categoria: e.target.value }))}
                  placeholder="Ej: ACEPTACIONES"
                  list="cat-list"
                />
                <datalist id="cat-list">
                  {categorias.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pl-ind">Indicativo</Label>
                <Input
                  id="pl-ind"
                  value={form.indicativo}
                  onChange={(e) => setForm((f) => ({ ...f, indicativo: e.target.value }))}
                  placeholder="Ej: TRAZABILIDAD INDIGO"
                  list="ind-list"
                />
                <datalist id="ind-list">
                  {indicativos.map((i) => (
                    <option key={i} value={i} />
                  ))}
                </datalist>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pl-sub">Subcategoría (opcional)</Label>
              <Input
                id="pl-sub"
                value={form.subcategoria}
                onChange={(e) => setForm((f) => ({ ...f, subcategoria: e.target.value }))}
                placeholder="Ej: SOAT/ADRES"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pl-msg">Mensaje</Label>
              <Textarea
                id="pl-msg"
                rows={7}
                value={form.mensaje}
                onChange={(e) => setForm((f) => ({ ...f, mensaje: e.target.value }))}
                placeholder="Texto de la plantilla. Usa variables como {{IPS}}, {{CODIGO}}, {{CIUDAD}}…"
              />
              <p className="text-[11px] text-muted-foreground">
                Usa variables entre llaves dobles para reutilizar: {"{{IPS}}"}, {"{{CODIGO}}"}, {"{{CIUDAD}}"}.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={guardar} disabled={saving}>
              {saving ? "Guardando…" : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmación de eliminación */}
      <AlertDialog open={!!delId} onOpenChange={(o) => !o && setDelId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar esta plantilla?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. La plantilla dejará de estar disponible para el equipo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={eliminar}>Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
