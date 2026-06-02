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
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Plus, Search } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/remisiones")({
  component: RemisionesPage,
});

function RemisionesPage() {
  const { canEdit } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [iaTexto, setIaTexto] = useState("");
  const [iaBusy, setIaBusy] = useState(false);
  const generar = useServerFn(generarTextoCaso);

  const { data: remisiones, isLoading } = useQuery({
    queryKey: ["remisiones"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("remisiones")
        .select("*")
        .eq("archivado", false)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const term = q.trim().toLowerCase();
  const remisionesF = useMemo(
    () =>
      (remisiones ?? []).filter((r) =>
        term
          ? [r.paciente, r.documento, r.servicio, r.ips_receptora, r.estado, r.prioridad]
              .filter(Boolean)
              .join(" ")
              .toLowerCase()
              .includes(term)
          : true,
      ),
    [remisiones, term],
  );

  const handleCreate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from("remisiones").insert({
      paciente: String(f.get("paciente")),
      documento: String(f.get("documento")),
      edad: String(f.get("edad")),
      servicio: String(f.get("servicio")),
      prioridad: String(f.get("prioridad")),
      asegurador: String(f.get("asegurador")),
      ips_receptora: String(f.get("ips_receptora")),
      estado: String(f.get("estado")) || "PENDIENTE ACEPTACION",
      observaciones: String(f.get("observaciones")),
      texto_ia: iaTexto || null,
      created_by: u.user?.id,
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Remisión registrada");
    setOpen(false);
    setIaTexto("");
    qc.invalidateQueries({ queryKey: ["remisiones"] });
    qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
  };

  const handleIA = (form: HTMLFormElement) => {
    const f = new FormData(form);
    const datos = `Paciente: ${f.get("paciente")}\nDocumento: ${f.get("documento")}\nEdad: ${f.get("edad")}\nServicio: ${f.get("servicio")}\nPrioridad: ${f.get("prioridad")}\nAsegurador: ${f.get("asegurador")}\nIPS receptora: ${f.get("ips_receptora")}\nObservaciones: ${f.get("observaciones")}`;
    setIaBusy(true);
    generar({ data: { tipoCaso: "remision", datos, formato: "resumen" } })
      .then((r) => {
        if (r.error) toast.error(r.error);
        else setIaTexto(r.texto);
      })
      .catch(() => toast.error("No se pudo generar el texto"))
      .finally(() => setIaBusy(false));
  };

  return (
    <div>
      <AppHeader title="Remisiones Salientes" subtitle="Casos que CEDIM remite hacia otras IPS" />

      <Panel
        title="Remisiones activas"
        action={
          canEdit && (
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="rounded-full">
                  <Plus className="mr-1.5 h-4 w-4" /> Nueva remisión
                </Button>
              </DialogTrigger>
              <DialogContent className="max-h-[90vh] overflow-auto sm:max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Nueva remisión saliente</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleCreate} className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field name="paciente" label="Paciente" required />
                    <Field name="documento" label="Documento" required />
                    <Field name="edad" label="Edad" />
                    <Field name="servicio" label="Servicio" />
                    <Field name="prioridad" label="Prioridad" />
                    <Field name="asegurador" label="Asegurador" />
                    <Field name="ips_receptora" label="IPS receptora" />
                    <Field name="estado" label="Estado" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="observaciones">Observaciones</Label>
                    <Textarea id="observaciones" name="observaciones" rows={3} />
                  </div>
                  <div className="space-y-2 rounded-md border border-border p-3">
                    <div className="flex items-center justify-between">
                      <Label className="flex items-center gap-2">
                        <Sparkles className="h-4 w-4 text-primary" /> Texto generado por IA
                      </Label>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        className="rounded-full"
                        disabled={iaBusy}
                        onClick={(e) => handleIA(e.currentTarget.closest("form") as HTMLFormElement)}
                      >
                        {iaBusy ? "Generando…" : "Generar resumen"}
                      </Button>
                    </div>
                    <Textarea
                      value={iaTexto}
                      onChange={(e) => setIaTexto(e.target.value)}
                      rows={4}
                      placeholder="Pulsa «Generar resumen» para crear el texto del caso con IA."
                    />
                  </div>
                  <DialogFooter>
                    <Button type="submit">Guardar remisión</Button>
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
            placeholder="Buscar por paciente, documento, IPS…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>

        {isLoading ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Cargando…</p>
        ) : remisionesF.length > 0 ? (
          <div className="grid gap-3">
            {remisionesF.map((r) => (
              <div
                key={r.id}
                className="rounded-xl border border-border border-l-4 border-l-status-teal bg-card p-4 shadow-sm"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-bold text-foreground">{r.paciente || "Sin nombre"}</p>
                  {r.prioridad && <Badge variant="outline">{r.prioridad}</Badge>}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Doc: {r.documento || "—"} · {r.servicio || "—"} · {r.ips_receptora || "—"}
                </p>
                <p className="text-xs text-muted-foreground">Estado: {r.estado || "—"}</p>
                {r.texto_ia && (
                  <p className="mt-2 rounded bg-muted p-2 text-xs text-foreground">{r.texto_ia}</p>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No hay remisiones registradas todavía.
          </p>
        )}
      </Panel>
    </div>
  );
}

function Field({ name, label, required }: { name: string; label: string; required?: boolean }) {
  return (
    <div className="space-y-2">
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} name={name} required={required} />
    </div>
  );
}
