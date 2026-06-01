import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/indicadores")({
  component: IndicadoresPage,
});

function IndicadoresPage() {
  const { data } = useQuery({
    queryKey: ["indicadores"],
    queryFn: async () => {
      const [ent, sal, seg] = await Promise.all([
        supabase.from("casos_entrantes").select("estado, archivado").limit(1000),
        supabase.from("remisiones").select("estado, archivado").limit(1000),
        supabase.from("seguimientos").select("id, archivado").limit(1000),
      ]);
      const casos = ent.data ?? [];
      const rem = sal.data ?? [];
      const seguim = seg.data ?? [];

      const porEstado = (rows: { estado: string | null }[]) => {
        const map: Record<string, number> = {};
        rows.forEach((r) => {
          const k = (r.estado || "Sin estado").toUpperCase();
          map[k] = (map[k] ?? 0) + 1;
        });
        return Object.entries(map).sort((a, b) => b[1] - a[1]);
      };

      return {
        entrantesActivos: casos.filter((c) => !c.archivado).length,
        salientesActivos: rem.filter((r) => !r.archivado).length,
        entrantesTotal: casos.length,
        salientesTotal: rem.length,
        seguimientosActivos: seguim.filter((s) => !s.archivado).length,
        estadoEntrantes: porEstado(casos),
        estadoSalientes: porEstado(rem),
      };
    },
  });

  return (
    <div className="space-y-6">
      <PageHeader title="Indicadores" description="Resumen del desempeño de la coordinación de referencia y contrarreferencia." />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Entrantes activos" value={data?.entrantesActivos} />
        <Stat label="Salientes activos" value={data?.salientesActivos} />
        <Stat label="Seguimientos activos" value={data?.seguimientosActivos} />
        <Stat label="Total histórico" value={(data?.entrantesTotal ?? 0) + (data?.salientesTotal ?? 0)} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <EstadoCard title="Casos entrantes por estado" rows={data?.estadoEntrantes ?? []} />
        <EstadoCard title="Remisiones salientes por estado" rows={data?.estadoSalientes ?? []} />
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value?: number }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-3xl font-bold">{value ?? "—"}</p>
      </CardContent>
    </Card>
  );
}

function EstadoCard({ title, rows }: { title: string; rows: [string, number][] }) {
  const total = rows.reduce((a, [, n]) => a + n, 0) || 1;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin datos.</p>
        ) : (
          rows.map(([estado, n]) => (
            <div key={estado} className="space-y-1">
              <div className="flex justify-between text-sm">
                <span className="text-foreground">{estado}</span>
                <span className="text-muted-foreground">{n}</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary" style={{ width: `${(n / total) * 100}%` }} />
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
