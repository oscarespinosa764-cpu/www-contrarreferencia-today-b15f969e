import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Plus, Zap } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/reglas")({
  component: ReglasPage,
});

function ReglasPage() {
  const { isAdmin } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data: reglas, isLoading } = useQuery({
    queryKey: ["reglas"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("catalogos")
        .select("*")
        .eq("tipo", "regla")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const handleCreate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const { error } = await supabase.from("catalogos").insert({
      tipo: "regla",
      valor: String(f.get("titulo")),
      extra1: String(f.get("descripcion")) || null,
      activo: true,
    });
    if (error) return toast.error(error.message);
    toast.success("Regla creada");
    setOpen(false);
    qc.invalidateQueries({ queryKey: ["reglas"] });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reglas Operativas"
        description="Lineamientos y criterios estandarizados que el equipo debe seguir en cada gestión."
        action={
          isAdmin && (
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="mr-2 h-4 w-4" /> Nueva regla
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Nueva regla operativa</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleCreate} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="titulo">Título</Label>
                    <Input id="titulo" name="titulo" required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="descripcion">Descripción</Label>
                    <Textarea id="descripcion" name="descripcion" rows={4} />
                  </div>
                  <DialogFooter>
                    <Button type="submit">Guardar</Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          )
        }
      />

      {isLoading ? (
        <p className="text-muted-foreground">Cargando…</p>
      ) : reglas && reglas.length > 0 ? (
        <div className="grid gap-3">
          {reglas.map((r) => (
            <Card key={r.id}>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Zap className="h-4 w-4 text-primary" /> {r.valor}
                </CardTitle>
              </CardHeader>
              {r.extra1 && (
                <CardContent>
                  <p className="whitespace-pre-wrap text-sm text-muted-foreground">{r.extra1}</p>
                </CardContent>
              )}
            </Card>
          ))}
        </div>
      ) : (
        <p className="text-muted-foreground">Aún no hay reglas operativas definidas.</p>
      )}
    </div>
  );
}
