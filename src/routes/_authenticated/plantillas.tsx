import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { generarTextoCaso } from "@/lib/ai.functions";
import { AppHeader } from "@/components/app-header";
import { Panel } from "@/components/stat-card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sparkles, Copy, Save } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/plantillas")({
  component: PlantillasPage,
});

const formatos = [
  { v: "resumen", label: "Resumen breve" },
  { v: "estructurado", label: "Nota estructurada" },
  { v: "informe", label: "Informe completo" },
] as const;

function PlantillasPage() {
  const { isAdmin } = useAuth();
  const qc = useQueryClient();
  const generar = useServerFn(generarTextoCaso);
  const [datos, setDatos] = useState("");
  const [formato, setFormato] = useState<"resumen" | "estructurado" | "informe">("resumen");
  const [resultado, setResultado] = useState("");
  const [busy, setBusy] = useState(false);

  const { data: plantillas } = useQuery({
    queryKey: ["plantillas"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("catalogos")
        .select("*")
        .eq("tipo", "plantilla")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const handleGenerar = async () => {
    if (!datos.trim()) return toast.error("Escribe la información del caso");
    setBusy(true);
    try {
      const r = await generar({ data: { tipoCaso: "entrante", datos, formato } });
      if (r.error) toast.error(r.error);
      else setResultado(r.texto);
    } catch {
      toast.error("No se pudo generar el texto");
    } finally {
      setBusy(false);
    }
  };

  const handleGuardar = async () => {
    if (!resultado.trim()) return;
    const { error } = await supabase.from("catalogos").insert({
      tipo: "plantilla",
      valor: formato,
      extra1: resultado.slice(0, 4000),
    });
    if (error) return toast.error(error.message);
    toast.success("Plantilla guardada");
    qc.invalidateQueries({ queryKey: ["plantillas"] });
  };

  const copiar = (txt: string) => {
    navigator.clipboard.writeText(txt);
    toast.success("Copiado");
  };

  return (
    <div>
      <AppHeader
        title="Plantillas Generales"
        subtitle="Genera textos estandarizados de casos con IA y guárdalos"
      />

      <Panel
        title="Generador de texto"
        action={<Sparkles className="h-4 w-4 text-primary" />}
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="datos">Información del caso</Label>
            <Textarea
              id="datos"
              rows={5}
              value={datos}
              onChange={(e) => setDatos(e.target.value)}
              placeholder="Pega aquí los datos del paciente y la gestión realizada…"
            />
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-2">
              <Label>Formato</Label>
              <Select value={formato} onValueChange={(v) => setFormato(v as typeof formato)}>
                <SelectTrigger className="w-56 rounded-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {formatos.map((f) => (
                    <SelectItem key={f.v} value={f.v}>
                      {f.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button className="rounded-full" onClick={handleGenerar} disabled={busy}>
              {busy ? "Generando…" : "Generar"}
            </Button>
          </div>

          {resultado && (
            <div className="space-y-2 rounded-xl border border-border p-3">
              <Textarea value={resultado} onChange={(e) => setResultado(e.target.value)} rows={6} />
              <div className="flex gap-2">
                <Button variant="secondary" size="sm" className="rounded-full" onClick={() => copiar(resultado)}>
                  <Copy className="mr-2 h-4 w-4" /> Copiar
                </Button>
                <Button variant="outline" size="sm" className="rounded-full" onClick={handleGuardar}>
                  <Save className="mr-2 h-4 w-4" /> Guardar plantilla
                </Button>
              </div>
            </div>
          )}
        </div>
      </Panel>

      <div className="mt-4">
        <Panel title="Plantillas guardadas">
          {plantillas && plantillas.length > 0 ? (
            <div className="grid gap-3">
              {plantillas.map((p) => (
                <div
                  key={p.id}
                  className="rounded-xl border border-border border-l-4 border-l-status-blue bg-card p-4 shadow-sm"
                >
                  <p className="text-sm font-bold capitalize text-foreground">{p.valor}</p>
                  <p className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">{p.extra1}</p>
                  <Button variant="ghost" size="sm" className="mt-1 rounded-full" onClick={() => copiar(p.extra1 ?? "")}>
                    <Copy className="mr-2 h-4 w-4" /> Copiar
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Aún no has guardado plantillas.
            </p>
          )}
          {!isAdmin && (
            <p className="mt-2 text-center text-xs text-muted-foreground">
              Las plantillas guardadas las gestiona el administrador.
            </p>
          )}
        </Panel>
      </div>
    </div>
  );
}
