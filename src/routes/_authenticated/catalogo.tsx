import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppHeader } from "@/components/app-header";
import { Panel } from "@/components/stat-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Plus, Search } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/catalogo")({
  component: CatalogoPage,
});

const tipoLabels: Record<string, string> = {
  ips: "IPS / Red",
  regla: "Reglas operativas",
  plantilla: "Plantillas",
  especialidad: "Especialidades",
  aseguradora: "Aseguradoras / EAPB",
  estado: "Estados",
  servicio: "Servicios",
};

function CatalogoPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");

  const { data: items, isLoading } = useQuery({
    queryKey: ["catalogo-todos"],
    queryFn: async () => {
      const { data, error } = await supabase.from("catalogos").select("*").order("tipo").order("valor");
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
    <div>
      <AppHeader
        title="Catálogo"
        subtitle="Listas maestras del sistema: especialidades, aseguradoras, estados y más"
      />

      <Panel
        title="Listas maestras"
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
    </div>
  );
}
