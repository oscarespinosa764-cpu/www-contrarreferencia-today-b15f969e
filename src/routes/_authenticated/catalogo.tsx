import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Plus } from "lucide-react";
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

  const { data: items, isLoading } = useQuery({
    queryKey: ["catalogo-todos"],
    queryFn: async () => {
      const { data, error } = await supabase.from("catalogos").select("*").order("tipo").order("valor");
      if (error) throw error;
      return data;
    },
  });

  const grupos = useMemo(() => {
    const map: Record<string, typeof items> = {};
    (items ?? []).forEach((i) => {
      (map[i.tipo] ??= []).push(i);
    });
    return Object.entries(map);
  }, [items]);

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
    <div className="space-y-6">
      <PageHeader
        title="Catálogo"
        description="Listas maestras del sistema: especialidades, aseguradoras, estados, servicios y más."
        action={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" /> Agregar elemento
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
      />

      {isLoading ? (
        <p className="text-muted-foreground">Cargando…</p>
      ) : grupos.length > 0 ? (
        <div className="space-y-6">
          {grupos.map(([tipo, list]) => (
            <Card key={tipo}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{tipoLabels[tipo] ?? tipo}</CardTitle>
              </CardHeader>
              <CardContent className="divide-y divide-border">
                {(list ?? []).map((i) => (
                  <div key={i.id} className="flex items-center justify-between gap-3 py-2">
                    <div>
                      <p className="text-sm text-foreground">{i.valor}</p>
                      {i.extra1 && <p className="text-xs text-muted-foreground">{i.extra1}</p>}
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge variant={i.activo ? "default" : "secondary"}>{i.activo ? "Activo" : "Inactivo"}</Badge>
                      <Switch checked={i.activo} onCheckedChange={(v) => toggle(i.id, v)} />
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <p className="text-muted-foreground">El catálogo está vacío. Agrega tu primer elemento.</p>
      )}
    </div>
  );
}
