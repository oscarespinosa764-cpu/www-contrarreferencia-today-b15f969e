import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Panel } from "@/components/stat-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { ProgramarAlertasDialog } from "@/components/coordinacion/programar-alertas-dialog";
import { Plus, Zap, Search } from "lucide-react";
import { toast } from "sonner";

export function ReglasPanel() {
  const { isAdmin } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");

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

  const term = q.trim().toLowerCase();
  const reglasF = useMemo(
    () =>
      (reglas ?? []).filter((r) =>
        term ? [r.valor, r.extra1].filter(Boolean).join(" ").toLowerCase().includes(term) : true,
      ),
    [reglas, term],
  );

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
    <Panel
      title="Reglas operativas"
      leftAction={
        <ProgramarAlertasDialog
          trigger={
            <Button variant="outline" size="sm" className="rounded-full">
              Programar
            </Button>
          }
        />
      }
      action={
        isAdmin && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="rounded-full">
                <Plus className="mr-1.5 h-4 w-4" /> Nueva regla
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
    >
      <div className="relative mb-4 mx-auto max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="rounded-full pl-9"
          placeholder="Buscar regla…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      {isLoading ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Cargando…</p>
      ) : reglasF.length > 0 ? (
        <div className="grid gap-3">
          {reglasF.map((r) => (
            <div
              key={r.id}
              className="rounded-xl border border-border border-l-4 border-l-status-amber bg-card p-4 shadow-sm"
            >
              <p className="flex items-center gap-2 text-sm font-bold text-foreground">
                <Zap className="h-4 w-4 text-status-amber" /> {r.valor}
              </p>
              {r.extra1 && (
                <p className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">{r.extra1}</p>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="py-8 text-center text-sm text-muted-foreground">
          Aún no hay reglas operativas definidas.
        </p>
      )}
    </Panel>
  );
}
