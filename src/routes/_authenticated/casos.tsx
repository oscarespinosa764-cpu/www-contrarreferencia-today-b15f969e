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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Plus, Search } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/casos")({
  component: CasosPage,
});

function CasosPage() {
  const { canEdit } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
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

  const term = q.trim().toLowerCase();
  const casosF = useMemo(
    () =>
      (casos ?? []).filter((c) =>
        term
          ? [c.nombres, c.apellidos, c.documento, c.codigo, c.ips, c.especialidad, c.estado]
              .filter(Boolean)
              .join(" ")
              .toLowerCase()
              .includes(term)
          : true,
      ),
    [casos, term],
  );

  const handleCreate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from("casos_entrantes").insert({
      codigo: String(f.get("codigo")),
      tipo: String(f.get("tipo")) || "ACEP",
      nombres: String(f.get("nombres")),
      apellidos: String(f.get("apellidos")),
      documento: String(f.get("documento")),
      ips: String(f.get("ips")),
      unidad: String(f.get("unidad")),
      medico: String(f.get("medico")),
      especialidad: String(f.get("especialidad")),
      eapb: String(f.get("eapb")),
      regimen: String(f.get("regimen")),
      aseguramiento: String(f.get("aseguramiento")),
      estado: String(f.get("estado")) || "REGISTRADO",
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
    <div>
      <AppHeader title="Casos Entrantes (R&C)" subtitle="Casos que otras IPS remiten hacia CEDIM" />

      <Panel
        title="Casos entrantes activos"
        action={
          canEdit && (
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="rounded-full">
                  <Plus className="mr-1.5 h-4 w-4" /> Nuevo caso
                </Button>
              </DialogTrigger>
              <DialogContent className="max-h-[90vh] overflow-auto sm:max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Registrar caso entrante</DialogTitle>
                  <p className="text-xs text-muted-foreground">
                    Caso que otra IPS remite hacia CEDIM (Referencia y Contrarreferencia).
                  </p>
                </DialogHeader>
                <form onSubmit={handleCreate} className="space-y-5">
                  {/* Datos del paciente */}
                  <section className="space-y-3">
                    <SectionTitle>👤 Datos del paciente</SectionTitle>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field name="documento" label="Documento" required />
                      <Field name="nombres" label="Nombres" required />
                      <Field name="apellidos" label="Apellidos" />
                      <Field name="eapb" label="EAPB / Asegurador" />
                    </div>
                  </section>

                  {/* Datos de la remisión */}
                  <section className="space-y-3">
                    <SectionTitle>🏥 Datos de la remisión</SectionTitle>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field name="ips" label="IPS que remite" />
                      <Field name="unidad" label="Unidad / Servicio" />
                      <Field name="medico" label="Médico" />
                      <Field name="especialidad" label="Especialidad" />
                    </div>
                  </section>

                  {/* Clasificación */}
                  <section className="space-y-3">
                    <SectionTitle>🗂️ Clasificación del caso</SectionTitle>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <SelectField name="tipo" label="Tipo de gestión" defaultValue="ACEP" options={["ACEP", "NEG", "AMP", "CAN", "ING"]} />
                      <SelectField name="estado" label="Estado" defaultValue="REGISTRADO" options={["REGISTRADO", "INGRESADO", "CERRADO"]} />
                      <Field name="regimen" label="Régimen" />
                      <Field name="codigo" label="Código / Radicado" />
                    </div>
                  </section>

                  <div className="space-y-2">
                    <Label htmlFor="detalle">Detalle</Label>
                    <Textarea id="detalle" name="detalle" rows={3} placeholder="Motivo, diagnóstico, observaciones…" />
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
                    <Button type="submit">Guardar caso</Button>
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
            placeholder="Buscar por nombre, documento, código…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>

        {isLoading ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Cargando…</p>
        ) : casosF.length > 0 ? (
          <div className="grid gap-3">
            {casosF.map((c) => (
              <div
                key={c.id}
                className="rounded-xl border border-border border-l-4 border-l-status-blue bg-card p-4 shadow-sm"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-bold text-foreground">
                    {[c.nombres, c.apellidos].filter(Boolean).join(" ") || "Sin nombre"}
                  </p>
                  {c.estado && <Badge variant="outline">{c.estado}</Badge>}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Doc: {c.documento || "—"} · {c.especialidad || "—"} · {c.ips || "—"}
                </p>
                {c.codigo && <p className="text-xs text-muted-foreground">Código: {c.codigo}</p>}
                {c.texto_ia && (
                  <p className="mt-2 rounded bg-muted p-2 text-xs text-foreground">{c.texto_ia}</p>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No hay casos entrantes registrados todavía.
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
