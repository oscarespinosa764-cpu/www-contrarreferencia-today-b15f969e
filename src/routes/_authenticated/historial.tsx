import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppHeader } from "@/components/app-header";
import { Panel } from "@/components/stat-card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Search } from "lucide-react";

export const Route = createFileRoute("/_authenticated/historial")({
  component: HistorialPage,
});

function HistorialPage() {
  const [q, setQ] = useState("");

  const { data: casos } = useQuery({
    queryKey: ["historial-casos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("casos_entrantes")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(1000);
      if (error) throw error;
      return data;
    },
  });

  const { data: remisiones } = useQuery({
    queryKey: ["historial-remisiones"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("remisiones")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(1000);
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

  const remisionesF = useMemo(
    () =>
      (remisiones ?? []).filter((r) =>
        term
          ? [r.paciente, r.documento, r.codigo_radicacion, r.ips_receptora, r.estado]
              .filter(Boolean)
              .join(" ")
              .toLowerCase()
              .includes(term)
          : true,
      ),
    [remisiones, term],
  );

  return (
    <div>
      <AppHeader
        title="Historial de Casos"
        subtitle="Consulta de casos entrantes y remisiones, incluidos los archivados"
      />

      <Panel title="Buscar en el historial">
        <div className="relative mx-auto max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="rounded-full pl-9"
            placeholder="Buscar por nombre, documento, código…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>

        <Tabs defaultValue="entrantes" className="mt-4">
          <TabsList className="mx-auto">
            <TabsTrigger value="entrantes">Entrantes ({casosF.length})</TabsTrigger>
            <TabsTrigger value="salientes">Salientes ({remisionesF.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="entrantes" className="space-y-3 pt-4">
            {casosF.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">Sin resultados.</p>
            ) : (
              casosF.map((c) => (
                <div
                  key={c.id}
                  className={`rounded-xl border border-border border-l-4 border-l-status-blue bg-card p-4 shadow-sm ${c.archivado ? "opacity-70" : ""}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-bold text-foreground">
                      {[c.nombres, c.apellidos].filter(Boolean).join(" ") || "Sin nombre"}
                    </p>
                    <div className="flex gap-2">
                      {c.archivado && <Badge variant="secondary">Archivado</Badge>}
                      {c.estado && <Badge variant="outline">{c.estado}</Badge>}
                    </div>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Doc: {c.documento || "—"} · {c.especialidad || "—"} · {c.ips || "—"}
                  </p>
                  {c.fecha && <p className="text-xs text-muted-foreground">Fecha: {c.fecha}</p>}
                </div>
              ))
            )}
          </TabsContent>

          <TabsContent value="salientes" className="space-y-3 pt-4">
            {remisionesF.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">Sin resultados.</p>
            ) : (
              remisionesF.map((r) => (
                <div
                  key={r.id}
                  className={`rounded-xl border border-border border-l-4 border-l-status-teal bg-card p-4 shadow-sm ${r.archivado ? "opacity-70" : ""}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-bold text-foreground">{r.paciente || "Sin nombre"}</p>
                    <div className="flex gap-2">
                      {r.archivado && <Badge variant="secondary">Archivado</Badge>}
                      {r.estado && <Badge variant="outline">{r.estado}</Badge>}
                    </div>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Doc: {r.documento || "—"} · {r.ips_receptora || "—"}
                  </p>
                  {r.codigo_radicacion && (
                    <p className="text-xs text-muted-foreground">Radicado: {r.codigo_radicacion}</p>
                  )}
                </div>
              ))
            )}
          </TabsContent>
        </Tabs>
      </Panel>
    </div>
  );
}
