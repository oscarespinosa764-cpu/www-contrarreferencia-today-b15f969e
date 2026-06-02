import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { AppHeader } from "@/components/app-header";
import { Panel } from "@/components/stat-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Plus, Search, Network } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/red-ips")({
  component: RedIpsPage,
});

function RedIpsPage() {
  const { isAdmin } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [filtro, setFiltro] = useState("todos");

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

  const term = q.trim().toLowerCase();
  const ipsF = useMemo(
    () =>
      (ips ?? [])
        .filter((i) =>
          filtro === "disponibles" ? i.activo : filtro === "no-disponibles" ? !i.activo : true,
        )
        .filter((i) =>
          term
            ? [i.valor, i.extra1, i.extra2].filter(Boolean).join(" ").toLowerCase().includes(term)
            : true,
        ),
    [ips, term, filtro],
  );

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
    <div>
      <AppHeader
        title="Red / Disponibilidad IPS"
        subtitle="Instituciones receptoras y su disponibilidad para recibir remisiones"
      />

      <Panel
        title="Red de instituciones"
        action={
          isAdmin && (
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="rounded-full">
                  <Plus className="mr-1.5 h-4 w-4" /> Agregar IPS
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
      >
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div className="relative min-w-[240px] flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="rounded-full pl-9"
              placeholder="Buscar IPS, servicio, contacto…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <Select value={filtro} onValueChange={setFiltro}>
            <SelectTrigger className="w-44 rounded-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              <SelectItem value="disponibles">Disponibles</SelectItem>
              <SelectItem value="no-disponibles">No disponibles</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Cargando…</p>
        ) : ipsF.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {ipsF.map((i) => (
              <div
                key={i.id}
                className={`rounded-xl border border-border border-l-4 bg-card p-4 shadow-sm ${i.activo ? "border-l-status-green" : "border-l-status-red"}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-bold text-foreground">{i.valor}</p>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${i.activo ? "bg-status-green/15 text-status-green" : "bg-status-red/15 text-status-red"}`}
                  >
                    {i.activo ? "DISPONIBLE" : "NO DISPONIBLE"}
                  </span>
                </div>
                <div className="mt-1 space-y-1 text-xs text-muted-foreground">
                  {i.extra1 && <p>Servicios: {i.extra1}</p>}
                  {i.extra2 && <p>Contacto: {i.extra2}</p>}
                </div>
                {isAdmin && (
                  <div className="mt-2 flex items-center gap-2 pt-1">
                    <Switch checked={i.activo} onCheckedChange={(v) => toggleDisponible(i.id, v)} />
                    <span className="text-xs text-muted-foreground">Marcar disponibilidad</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 py-12 text-center text-muted-foreground">
            <Network className="h-10 w-10 opacity-40" />
            <p className="text-sm">
              Aún no hay IPS registradas.{isAdmin ? " Usa «Agregar IPS» para empezar." : ""}
            </p>
          </div>
        )}
      </Panel>
    </div>
  );
}
