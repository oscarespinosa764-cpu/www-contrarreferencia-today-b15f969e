import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
    <div className="space-y-6">
      <PageHeader
        title="Historial de Casos"
        description="Busca y consulta todos los casos entrantes y remisiones, incluidos los archivados."
      />

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Buscar por nombre, documento, código…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      <Tabs defaultValue="entrantes">
        <TabsList>
          <TabsTrigger value="entrantes">Entrantes ({casosF.length})</TabsTrigger>
          <TabsTrigger value="salientes">Salientes ({remisionesF.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="entrantes" className="space-y-3 pt-4">
          {casosF.length === 0 ? (
            <p className="text-muted-foreground">Sin resultados.</p>
          ) : (
            casosF.map((c) => (
              <Card key={c.id} className={c.archivado ? "opacity-70" : ""}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">
                      {[c.nombres, c.apellidos].filter(Boolean).join(" ") || "Sin nombre"}
                    </CardTitle>
                    <div className="flex gap-2">
                      {c.archivado && <Badge variant="secondary">Archivado</Badge>}
                      {c.estado && <Badge variant="outline">{c.estado}</Badge>}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  <p>
                    Doc: {c.documento || "—"} · {c.especialidad || "—"} · {c.ips || "—"}
                  </p>
                  {c.fecha && <p>Fecha: {c.fecha}</p>}
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        <TabsContent value="salientes" className="space-y-3 pt-4">
          {remisionesF.length === 0 ? (
            <p className="text-muted-foreground">Sin resultados.</p>
          ) : (
            remisionesF.map((r) => (
              <Card key={r.id} className={r.archivado ? "opacity-70" : ""}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">{r.paciente || "Sin nombre"}</CardTitle>
                    <div className="flex gap-2">
                      {r.archivado && <Badge variant="secondary">Archivado</Badge>}
                      {r.estado && <Badge variant="outline">{r.estado}</Badge>}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  <p>
                    Doc: {r.documento || "—"} · {r.ips_receptora || "—"}
                  </p>
                  {r.codigo_radicacion && <p>Radicado: {r.codigo_radicacion}</p>}
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
