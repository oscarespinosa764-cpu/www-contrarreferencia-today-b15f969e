import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ArchiveRestore } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/historicos")({
  component: HistoricosPage,
});

function HistoricosPage() {
  const { isAdmin } = useAuth();
  const qc = useQueryClient();

  const { data: casos } = useQuery({
    queryKey: ["hist-casos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("casos_entrantes")
        .select("*")
        .eq("archivado", true)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: remisiones } = useQuery({
    queryKey: ["hist-remisiones"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("remisiones")
        .select("*")
        .eq("archivado", true)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const restaurar = async (tabla: "casos_entrantes" | "remisiones", id: string, key: string) => {
    const { error } = await supabase.from(tabla).update({ archivado: false }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Registro restaurado");
    qc.invalidateQueries({ queryKey: [key] });
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Históricos" description="Registros archivados. El administrador puede restaurarlos cuando sea necesario." />

      <Tabs defaultValue="entrantes">
        <TabsList>
          <TabsTrigger value="entrantes">Entrantes ({casos?.length ?? 0})</TabsTrigger>
          <TabsTrigger value="salientes">Salientes ({remisiones?.length ?? 0})</TabsTrigger>
        </TabsList>

        <TabsContent value="entrantes" className="space-y-3 pt-4">
          {casos && casos.length > 0 ? (
            casos.map((c) => (
              <Card key={c.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="text-base">
                      {[c.nombres, c.apellidos].filter(Boolean).join(" ") || "Sin nombre"}
                    </CardTitle>
                    <div className="flex items-center gap-2">
                      {c.estado && <Badge variant="outline">{c.estado}</Badge>}
                      {isAdmin && (
                        <Button size="sm" variant="ghost" onClick={() => restaurar("casos_entrantes", c.id, "hist-casos")}>
                          <ArchiveRestore className="mr-1 h-4 w-4" /> Restaurar
                        </Button>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  Doc: {c.documento || "—"} · {c.especialidad || "—"}
                </CardContent>
              </Card>
            ))
          ) : (
            <p className="text-muted-foreground">No hay casos entrantes archivados.</p>
          )}
        </TabsContent>

        <TabsContent value="salientes" className="space-y-3 pt-4">
          {remisiones && remisiones.length > 0 ? (
            remisiones.map((r) => (
              <Card key={r.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="text-base">{r.paciente || "Sin nombre"}</CardTitle>
                    <div className="flex items-center gap-2">
                      {r.estado && <Badge variant="outline">{r.estado}</Badge>}
                      {isAdmin && (
                        <Button size="sm" variant="ghost" onClick={() => restaurar("remisiones", r.id, "hist-remisiones")}>
                          <ArchiveRestore className="mr-1 h-4 w-4" /> Restaurar
                        </Button>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  Doc: {r.documento || "—"} · {r.ips_receptora || "—"}
                </CardContent>
              </Card>
            ))
          ) : (
            <p className="text-muted-foreground">No hay remisiones archivadas.</p>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
