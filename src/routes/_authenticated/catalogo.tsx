import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { generarTextoCaso } from "@/lib/ai.functions";
import { AppHeader } from "@/components/app-header";
import { Panel } from "@/components/stat-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Search, Sparkles, Copy, Save, BookOpen, Mail } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/catalogo")({
  component: CatalogoPage,
});

const tipoLabels: Record<string, string> = {
  ips: "IPS / Red",
  regla: "Reglas operativas",
  especialidad: "Especialidades",
  aseguradora: "Aseguradoras / EAPB",
  estado: "Estados",
  servicio: "Servicios",
};

function CatalogoTab() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");

  const { data: items, isLoading } = useQuery({
    queryKey: ["catalogo-todos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("catalogos")
        .select("*")
        .neq("tipo", "plantilla")
        .order("tipo")
        .order("valor");
      if (error) throw error;
      return data;
    },
  });

  const term = q.trim().toLowerCase();

  const grupos = useMemo(() => {
    const map: Record<string, typeof items> = {};
    (items ?? [])
      .filter((i) =>
        term ? [i.valor, i.extra1, i.tipo].filter(Boolean).join(" ").toLowerCase().includes(term) : true,
      )
      .forEach((i) => {
        (map[i.tipo] ??= []).push(i);
      });
    return Object.entries(map);
  }, [items, term]);

  const handleCreate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const tipo = String(f.get("tipo")).trim().toLowerCase();
    const { error } = await supabase.from("catalogos").insert({
      tipo,
      valor: String(f.get("valor")),
      extra1: String(f.get("extra1")) || null,
      activo: true,
    });
    if (error) return toast.error(error.message);
    toast.success("Elemento agregado");
    setOpen(false);
    qc.invalidateQueries({ queryKey: ["catalogo-todos"] });
  };

  const toggle = async (id: string, activo: boolean) => {
    const { error } = await supabase.from("catalogos").update({ activo }).eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["catalogo-todos"] });
  };

  return (
    <Panel
      title="Listas maestras"
      bodyMaxHeight="calc(100vh - 19rem)"
      action={
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="rounded-full">
              <Plus className="mr-1.5 h-4 w-4" /> Agregar elemento
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nuevo elemento de catálogo</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="tipo">Tipo</Label>
                <Input id="tipo" name="tipo" required placeholder="especialidad, aseguradora, estado…" list="tipos" />
                <datalist id="tipos">
                  {Object.keys(tipoLabels).map((t) => (
                    <option key={t} value={t} />
                  ))}
                </datalist>
              </div>
              <div className="space-y-2">
                <Label htmlFor="valor">Valor</Label>
                <Input id="valor" name="valor" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="extra1">Detalle (opcional)</Label>
                <Input id="extra1" name="extra1" />
              </div>
              <DialogFooter>
                <Button type="submit">Guardar</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      }
    >
      <div className="relative mb-4 mx-auto max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="rounded-full pl-9"
          placeholder="Buscar elemento del catálogo…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      {isLoading ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Cargando…</p>
      ) : grupos.length > 0 ? (
        <div className="space-y-4">
          {grupos.map(([tipo, list]) => (
            <div key={tipo} className="rounded-xl border border-border border-l-4 border-l-status-blue bg-card p-4 shadow-sm">
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-foreground">
                {tipoLabels[tipo] ?? tipo}
              </p>
              <div className="divide-y divide-border">
                {(list ?? []).map((i) => (
                  <div key={i.id} className="flex items-center justify-between gap-3 py-2">
                    <div>
                      <p className="text-sm text-foreground">{i.valor}</p>
                      {i.extra1 && <p className="text-xs text-muted-foreground">{i.extra1}</p>}
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge variant={i.activo ? "default" : "secondary"}>
                        {i.activo ? "Activo" : "Inactivo"}
                      </Badge>
                      <Switch checked={i.activo} onCheckedChange={(v) => toggle(i.id, v)} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="py-8 text-center text-sm text-muted-foreground">
          El catálogo está vacío. Agrega tu primer elemento.
        </p>
      )}
    </Panel>
  );
}

const formatos = [
  { v: "resumen", label: "Resumen breve" },
  { v: "estructurado", label: "Nota estructurada" },
  { v: "informe", label: "Informe completo" },
] as const;

function PlantillasTab() {
  const { isAdmin } = useAuth();
  const qc = useQueryClient();
  const generar = useServerFn(generarTextoCaso);
  const [datos, setDatos] = useState("");
  const [formato, setFormato] = useState<"resumen" | "estructurado" | "informe">("resumen");
  const [resultado, setResultado] = useState("");
  const [busy, setBusy] = useState(false);

  const { data: plantillas } = useQuery({
    queryKey: ["plantillas"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("catalogos")
        .select("*")
        .eq("tipo", "plantilla")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const handleGenerar = async () => {
    if (!datos.trim()) return toast.error("Escribe la información del caso");
    setBusy(true);
    try {
      const r = await generar({ data: { tipoCaso: "entrante", datos, formato } });
      if (r.error) toast.error(r.error);
      else setResultado(r.texto);
    } catch {
      toast.error("No se pudo generar el texto");
    } finally {
      setBusy(false);
    }
  };

  const handleGuardar = async () => {
    if (!resultado.trim()) return;
    const { error } = await supabase.from("catalogos").insert({
      tipo: "plantilla",
      valor: formato,
      extra1: resultado.slice(0, 4000),
    });
    if (error) return toast.error(error.message);
    toast.success("Plantilla guardada");
    qc.invalidateQueries({ queryKey: ["plantillas"] });
  };

  const copiar = (txt: string) => {
    navigator.clipboard.writeText(txt);
    toast.success("Copiado");
  };

  return (
    <div className="space-y-4">
      <Panel title="Generador de texto" bodyMaxHeight={null} action={<Sparkles className="h-4 w-4 text-primary" />}>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="datos">Información del caso</Label>
            <Textarea
              id="datos"
              rows={5}
              value={datos}
              onChange={(e) => setDatos(e.target.value)}
              placeholder="Pega aquí los datos del paciente y la gestión realizada…"
            />
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-2">
              <Label>Formato</Label>
              <Select value={formato} onValueChange={(v) => setFormato(v as typeof formato)}>
                <SelectTrigger className="w-56 rounded-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {formatos.map((f) => (
                    <SelectItem key={f.v} value={f.v}>
                      {f.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button className="rounded-full" onClick={handleGenerar} disabled={busy}>
              {busy ? "Generando…" : "Generar"}
            </Button>
          </div>

          {resultado && (
            <div className="space-y-2 rounded-xl border border-border p-3">
              <Textarea value={resultado} onChange={(e) => setResultado(e.target.value)} rows={6} />
              <div className="flex gap-2">
                <Button variant="secondary" size="sm" className="rounded-full" onClick={() => copiar(resultado)}>
                  <Copy className="mr-2 h-4 w-4" /> Copiar
                </Button>
                <Button variant="outline" size="sm" className="rounded-full" onClick={handleGuardar}>
                  <Save className="mr-2 h-4 w-4" /> Guardar plantilla
                </Button>
              </div>
            </div>
          )}
        </div>
      </Panel>

      <Panel title="Plantillas guardadas" bodyMaxHeight="calc(100vh - 30rem)">
        {plantillas && plantillas.length > 0 ? (
          <div className="grid gap-3">
            {plantillas.map((p) => (
              <div
                key={p.id}
                className="rounded-xl border border-border border-l-4 border-l-status-blue bg-card p-4 shadow-sm"
              >
                <p className="text-sm font-bold capitalize text-foreground">{p.valor}</p>
                <p className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">{p.extra1}</p>
                <Button variant="ghost" size="sm" className="mt-1 rounded-full" onClick={() => copiar(p.extra1 ?? "")}>
                  <Copy className="mr-2 h-4 w-4" /> Copiar
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <p className="py-8 text-center text-sm text-muted-foreground">Aún no has guardado plantillas.</p>
        )}
        {!isAdmin && (
          <p className="mt-2 text-center text-xs text-muted-foreground">
            Las plantillas guardadas las gestiona el administrador.
          </p>
        )}
      </Panel>
    </div>
  );
}

function CatalogoPage() {
  return (
    <div className="flex min-h-full flex-col">
      <AppHeader
        title="Catálogo y Plantillas"
        subtitle="Listas maestras del sistema y plantillas reutilizables de gestión"
      />

      <Tabs defaultValue="catalogo" className="flex flex-1 flex-col">
        <TabsList className="mx-auto mb-4">
          <TabsTrigger value="catalogo" className="gap-1.5">
            <BookOpen className="h-4 w-4" /> Catálogo
          </TabsTrigger>
          <TabsTrigger value="plantillas" className="gap-1.5">
            <Mail className="h-4 w-4" /> Plantillas Generales
          </TabsTrigger>
        </TabsList>

        <TabsContent value="catalogo" className="mt-0 flex-1">
          <CatalogoTab />
        </TabsContent>
        <TabsContent value="plantillas" className="mt-0 flex-1">
          <PlantillasTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
