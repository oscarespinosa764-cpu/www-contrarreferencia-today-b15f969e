import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { AppHeader } from "@/components/app-header";
import { Panel, StatCard } from "@/components/stat-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Plus, Search } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/seguimientos")({
  component: SeguimientosPage,
});

function SeguimientosPage() {
  const { canEdit, user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [casoSel, setCasoSel] = useState("");
  const [q, setQ] = useState("");

  const { data: casos } = useQuery({
    queryKey: ["sel-casos"],
    queryFn: async () => {
      const [{ data: ent }, { data: sal }] = await Promise.all([
        supabase.from("casos_entrantes").select("id, nombres, apellidos, codigo").eq("archivado", false).limit(500),
        supabase.from("remisiones").select("id, paciente, codigo_radicacion").eq("archivado", false).limit(500),
      ]);
      const entrantes = (ent ?? []).map((c) => ({
        key: `entrante:${c.id}`,
        id: c.id,
        tipo: "entrante" as const,
        label: `[Entrante] ${[c.nombres, c.apellidos].filter(Boolean).join(" ") || "Sin nombre"}`,
        radicado: c.codigo ?? "",
      }));
      const salientes = (sal ?? []).map((r) => ({
        key: `saliente:${r.id}`,
        id: r.id,
        tipo: "saliente" as const,
        label: `[Saliente] ${r.paciente || "Sin nombre"}`,
        radicado: r.codigo_radicacion ?? "",
      }));
      return [...entrantes, ...salientes];
    },
  });

  const { data: seguimientos, isLoading } = useQuery({
    queryKey: ["seguimientos-lista"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("seguimientos")
        .select("*")
        .eq("archivado", false)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const term = q.trim().toLowerCase();
  const seguimientosF = useMemo(
    () =>
      (seguimientos ?? []).filter((s) =>
        term
          ? [s.tipo_seguimiento, s.detalle, s.nombre_usuario, s.radicado]
              .filter(Boolean)
              .join(" ")
              .toLowerCase()
              .includes(term)
          : true,
      ),
    [seguimientos, term],
  );

  const totalEntrantes = (seguimientos ?? []).filter((s) => s.tipo_caso === "entrante").length;
  const totalSalientes = (seguimientos ?? []).filter((s) => s.tipo_caso === "saliente").length;

  const handleCreate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const sel = (casos ?? []).find((c) => c.key === casoSel);
    if (!sel) return toast.error("Selecciona un caso");
    const { data: prof } = await supabase.from("profiles").select("nombre").eq("user_id", user!.id).maybeSingle();
    const { error } = await supabase.from("seguimientos").insert({
      caso_id: sel.id,
      tipo_caso: sel.tipo,
      radicado: sel.radicado || null,
      tipo_seguimiento: String(f.get("tipo_seguimiento")) || null,
      detalle: String(f.get("detalle")),
      nombre_usuario: prof?.nombre || user!.email,
      created_by: user!.id,
    });
    if (error) return toast.error(error.message);
    toast.success("Seguimiento registrado");
    setOpen(false);
    setCasoSel("");
    qc.invalidateQueries({ queryKey: ["seguimientos-lista"] });
    qc.invalidateQueries({ queryKey: ["seguimientos-pendientes"] });
  };

  return (
    <div>
      <AppHeader title="Seguimientos" subtitle="Notas y avances registrados sobre cada caso en gestión" />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatCard title="Activos totales" value={seguimientos?.length ?? 0} caption="Casos en seguimiento" color="blue" />
        <StatCard title="Entrantes" value={totalEntrantes} caption="Casos R&C entrantes" color="green" />
        <StatCard title="Salientes" value={totalSalientes} caption="Remisiones salientes" color="teal" />
      </div>

      <Panel
        title="Seguimientos registrados"
        action={
          canEdit && (
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="rounded-full">
                  <Plus className="mr-1.5 h-4 w-4" /> Nuevo seguimiento
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Nuevo seguimiento</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleCreate} className="space-y-4">
                  <div className="space-y-2">
                    <Label>Caso</Label>
                    <Select value={casoSel} onValueChange={setCasoSel}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecciona un caso" />
                      </SelectTrigger>
                      <SelectContent>
                        {(casos ?? []).map((c) => (
                          <SelectItem key={c.key} value={c.key}>
                            {c.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="tipo_seguimiento">Tipo de seguimiento</Label>
                    <Input id="tipo_seguimiento" name="tipo_seguimiento" placeholder="Llamada, gestión, respuesta IPS…" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="detalle">Detalle</Label>
                    <Textarea id="detalle" name="detalle" rows={4} required />
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
            placeholder="Buscar por tipo, detalle, usuario…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>

        {isLoading ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Cargando…</p>
        ) : seguimientosF.length > 0 ? (
          <div className="grid gap-3">
            {seguimientosF.map((s) => (
              <div
                key={s.id}
                className={`rounded-xl border border-border border-l-4 bg-card p-4 shadow-sm ${s.tipo_caso === "entrante" ? "border-l-status-green" : "border-l-status-teal"}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-bold text-foreground">{s.tipo_seguimiento || "Seguimiento"}</p>
                  <Badge variant="outline">{s.tipo_caso === "entrante" ? "Entrante" : "Saliente"}</Badge>
                </div>
                {s.detalle && <p className="mt-1 text-sm text-foreground">{s.detalle}</p>}
                <p className="mt-1 text-xs text-muted-foreground">
                  {s.nombre_usuario || "—"} · {new Date(s.created_at).toLocaleString("es-CO")}
                  {s.radicado ? ` · Rad. ${s.radicado}` : ""}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No hay seguimientos registrados todavía.
          </p>
        )}
      </Panel>
    </div>
  );
}
