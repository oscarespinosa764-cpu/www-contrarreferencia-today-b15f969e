import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { generarTextoCaso } from "@/lib/ai.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Plus } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/casos")({
  component: CasosPage,
});

function CasosPage() {
  const { canEdit } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [iaTexto, setIaTexto] = useState("");
  const [iaBusy, setIaBusy] = useState(false);
  const generar = useServerFn(generarTextoCaso);

  const { data: casos, isLoading } = useQuery({
    queryKey: ["casos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("casos_entrantes")
        .select("*")
        .eq("archivado", false)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const handleCreate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from("casos_entrantes").insert({
      codigo: String(f.get("codigo")),
      nombres: String(f.get("nombres")),
      apellidos: String(f.get("apellidos")),
      documento: String(f.get("documento")),
      ips: String(f.get("ips")),
      medico: String(f.get("medico")),
      especialidad: String(f.get("especialidad")),
      aseguramiento: String(f.get("aseguramiento")),
      estado: String(f.get("estado")) || "PENDIENTE",
      detalle: String(f.get("detalle")),
      texto_ia: iaTexto || null,
      created_by: u.user?.id,
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Caso registrado");
    setOpen(false);
    setIaTexto("");
    qc.invalidateQueries({ queryKey: ["casos"] });
    qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
  };

  const handleIA = (form: HTMLFormElement) => {
    const f = new FormData(form);
    const datos = `Código: ${f.get("codigo")}\nPaciente: ${f.get("nombres")} ${f.get("apellidos")}\nDocumento: ${f.get("documento")}\nIPS remite: ${f.get("ips")}\nMédico: ${f.get("medico")}\nEspecialidad: ${f.get("especialidad")}\nAseguramiento: ${f.get("aseguramiento")}\nDetalle: ${f.get("detalle")}`;
    setIaBusy(true);
    generar({ data: { tipoCaso: "entrante", datos, formato: "resumen" } })
      .then((r) => {
        if (r.error) toast.error(r.error);
        else setIaTexto(r.texto);
      })
      .catch(() => toast.error("No se pudo generar el texto"))
      .finally(() => setIaBusy(false));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Casos entrantes (R&C)</h1>
          <p className="text-muted-foreground">Casos que otras IPS remiten hacia CEDIM</p>
        </div>
        {canEdit && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="mr-2 h-4 w-4" /> Nuevo caso</Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] overflow-auto sm:max-w-2xl">
              <DialogHeader>
                <DialogTitle>Nuevo caso entrante</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleCreate} className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field name="codigo" label="Código" />
                  <Field name="documento" label="Documento" required />
                  <Field name="nombres" label="Nombres" required />
                  <Field name="apellidos" label="Apellidos" />
                  <Field name="ips" label="IPS que remite" />
                  <Field name="medico" label="Médico" />
                  <Field name="especialidad" label="Especialidad" />
                  <Field name="aseguramiento" label="Aseguramiento" />
                  <Field name="estado" label="Estado" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="detalle">Detalle</Label>
                  <Textarea id="detalle" name="detalle" rows={3} />
                </div>
                <div className="space-y-2 rounded-md border border-border p-3">
                  <div className="flex items-center justify-between">
                    <Label className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" /> Texto generado por IA</Label>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      disabled={iaBusy}
                      onClick={(e) => handleIA(e.currentTarget.closest("form") as HTMLFormElement)}
                    >
                      {iaBusy ? "Generando…" : "Generar resumen"}
                    </Button>
                  </div>
                  <Textarea value={iaTexto} onChange={(e) => setIaTexto(e.target.value)} rows={4} placeholder="Pulsa «Generar resumen» para crear el texto del caso con IA." />
                </div>
                <DialogFooter>
                  <Button type="submit">Guardar caso</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {isLoading ? (
        <p className="text-muted-foreground">Cargando…</p>
      ) : casos && casos.length > 0 ? (
        <div className="grid gap-3">
          {casos.map((c) => (
            <Card key={c.id}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">{[c.nombres, c.apellidos].filter(Boolean).join(" ") || "Sin nombre"}</CardTitle>
                  {c.estado && <Badge variant="outline">{c.estado}</Badge>}
                </div>
              </CardHeader>
              <CardContent className="space-y-1 text-sm text-muted-foreground">
                <p>Doc: {c.documento || "—"} · {c.especialidad || "—"} · {c.ips || "—"}</p>
                {c.codigo && <p>Código: {c.codigo}</p>}
                {c.texto_ia && <p className="mt-2 rounded bg-muted p-2 text-foreground">{c.texto_ia}</p>}
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <p className="text-muted-foreground">No hay casos entrantes registrados todavía.</p>
      )}
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
