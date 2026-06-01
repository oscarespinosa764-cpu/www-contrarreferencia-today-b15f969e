import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { generarTextoCaso } from "@/lib/ai.functions";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
    <div className="space-y-6">
      <PageHeader
        title="Plantillas"
        description="Genera textos estandarizados de casos con IA y guarda los que más uses."
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4 text-primary" /> Generador de texto
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
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
                <SelectTrigger className="w-56">
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
            <Button onClick={handleGenerar} disabled={busy}>
              {busy ? "Generando…" : "Generar"}
            </Button>
          </div>

          {resultado && (
            <div className="space-y-2 rounded-md border border-border p-3">
              <Textarea value={resultado} onChange={(e) => setResultado(e.target.value)} rows={6} />
              <div className="flex gap-2">
                <Button variant="secondary" size="sm" onClick={() => copiar(resultado)}>
                  <Copy className="mr-2 h-4 w-4" /> Copiar
                </Button>
                <Button variant="outline" size="sm" onClick={handleGuardar}>
                  <Save className="mr-2 h-4 w-4" /> Guardar plantilla
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div>
        <h2 className="mb-3 text-lg font-semibold text-foreground">Plantillas guardadas</h2>
        {plantillas && plantillas.length > 0 ? (
          <div className="grid gap-3">
            {plantillas.map((p) => (
              <Card key={p.id}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm capitalize">{p.valor}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <p className="whitespace-pre-wrap text-sm text-muted-foreground">{p.extra1}</p>
                  <Button variant="ghost" size="sm" onClick={() => copiar(p.extra1 ?? "")}>
                    <Copy className="mr-2 h-4 w-4" /> Copiar
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <p className="text-muted-foreground">Aún no has guardado plantillas.</p>
        )}
        {!isAdmin && (
          <p className="mt-2 text-xs text-muted-foreground">Las plantillas guardadas las gestiona el administrador.</p>
        )}
      </div>
    </div>
  );
}
