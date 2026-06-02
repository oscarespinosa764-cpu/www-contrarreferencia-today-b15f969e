import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { AppHeader } from "@/components/app-header";
import { Panel } from "@/components/stat-card";
import { Button } from "@/components/ui/button";
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
    <div>
      <AppHeader
        title="Históricos"
        subtitle="Registros archivados disponibles para restauración"
      />

      <Panel title="Registros archivados">
        <Tabs defaultValue="entrantes">
          <TabsList className="mx-auto">
            <TabsTrigger value="entrantes">Entrantes ({casos?.length ?? 0})</TabsTrigger>
            <TabsTrigger value="salientes">Salientes ({remisiones?.length ?? 0})</TabsTrigger>
          </TabsList>

          <TabsContent value="entrantes" className="space-y-3 pt-4">
            {casos && casos.length > 0 ? (
              casos.map((c) => (
                <div
                  key={c.id}
                  className="rounded-xl border border-border border-l-4 border-l-status-blue bg-card p-4 shadow-sm"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-bold text-foreground">
                      {[c.nombres, c.apellidos].filter(Boolean).join(" ") || "Sin nombre"}
                    </p>
                    <div className="flex items-center gap-2">
                      {c.estado && <Badge variant="outline">{c.estado}</Badge>}
                      {isAdmin && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="rounded-full"
                          onClick={() => restaurar("casos_entrantes", c.id, "hist-casos")}
                        >
                          <ArchiveRestore className="mr-1 h-4 w-4" /> Restaurar
                        </Button>
                      )}
                    </div>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Doc: {c.documento || "—"} · {c.especialidad || "—"}
                  </p>
                </div>
              ))
            ) : (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No hay casos entrantes archivados.
              </p>
            )}
          </TabsContent>

          <TabsContent value="salientes" className="space-y-3 pt-4">
            {remisiones && remisiones.length > 0 ? (
              remisiones.map((r) => (
                <div
                  key={r.id}
                  className="rounded-xl border border-border border-l-4 border-l-status-teal bg-card p-4 shadow-sm"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-bold text-foreground">{r.paciente || "Sin nombre"}</p>
                    <div className="flex items-center gap-2">
                      {r.estado && <Badge variant="outline">{r.estado}</Badge>}
                      {isAdmin && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="rounded-full"
                          onClick={() => restaurar("remisiones", r.id, "hist-remisiones")}
                        >
                          <ArchiveRestore className="mr-1 h-4 w-4" /> Restaurar
                        </Button>
                      )}
                    </div>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Doc: {r.documento || "—"} · {r.ips_receptora || "—"}
                  </p>
                </div>
              ))
            ) : (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No hay remisiones archivadas.
              </p>
            )}
          </TabsContent>
        </Tabs>
      </Panel>
    </div>
  );
}
