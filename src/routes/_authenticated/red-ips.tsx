import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
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

export const Route = createFileRoute("/_authenticated/red-ips")({
  component: RedIpsPage,
});

function RedIpsPage() {
  const { isAdmin } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data: ips, isLoading } = useQuery({
    queryKey: ["catalogo-ips"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("catalogos")
        .select("*")
        .eq("tipo", "ips")
        .order("valor");
      if (error) throw error;
      return data;
    },
  });

  const handleCreate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const { error } = await supabase.from("catalogos").insert({
      tipo: "ips",
      valor: String(f.get("valor")),
      extra1: String(f.get("servicios")) || null,
      extra2: String(f.get("contacto")) || null,
      activo: true,
    });
    if (error) return toast.error(error.message);
    toast.success("IPS agregada");
    setOpen(false);
    qc.invalidateQueries({ queryKey: ["catalogo-ips"] });
  };

  const toggleDisponible = async (id: string, activo: boolean) => {
    const { error } = await supabase.from("catalogos").update({ activo }).eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["catalogo-ips"] });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Red / Disponibilidad IPS"
        description="Instituciones receptoras y su disponibilidad actual para recibir remisiones."
        action={
          isAdmin && (
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="mr-2 h-4 w-4" /> Agregar IPS
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Nueva IPS</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleCreate} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="valor">Nombre de la IPS</Label>
                    <Input id="valor" name="valor" required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="servicios">Servicios / especialidades</Label>
                    <Input id="servicios" name="servicios" placeholder="UCI, cardiología…" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="contacto">Contacto</Label>
                    <Input id="contacto" name="contacto" placeholder="Teléfono / correo" />
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
      ) : ips && ips.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {ips.map((i) => (
            <Card key={i.id}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">{i.valor}</CardTitle>
                  <Badge variant={i.activo ? "default" : "secondary"}>
                    {i.activo ? "Disponible" : "No disponible"}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-muted-foreground">
                {i.extra1 && <p>Servicios: {i.extra1}</p>}
                {i.extra2 && <p>Contacto: {i.extra2}</p>}
                {isAdmin && (
                  <div className="flex items-center gap-2 pt-1">
                    <Switch checked={i.activo} onCheckedChange={(v) => toggleDisponible(i.id, v)} />
                    <span className="text-xs">Marcar disponibilidad</span>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <p className="text-muted-foreground">
          Aún no hay IPS registradas.{isAdmin ? " Usa «Agregar IPS» para empezar." : ""}
        </p>
      )}
    </div>
  );
}
