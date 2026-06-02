import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppHeader } from "@/components/app-header";
import { StatCard, Panel } from "@/components/stat-card";

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
    <div>
      <AppHeader
        title="Indicadores"
        subtitle="Resumen del desempeño de la coordinación de referencia y contrarreferencia"
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard title="Entrantes activos" value={data?.entrantesActivos} color="green" />
        <StatCard title="Salientes activos" value={data?.salientesActivos} color="teal" />
        <StatCard title="Seguimientos activos" value={data?.seguimientosActivos} color="blue" />
        <StatCard
          title="Total histórico"
          value={(data?.entrantesTotal ?? 0) + (data?.salientesTotal ?? 0)}
          color="muted"
        />
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <Panel title="Casos entrantes por estado">
          <EstadoLista rows={data?.estadoEntrantes ?? []} barColor="bg-status-green" />
        </Panel>
        <Panel title="Remisiones salientes por estado">
          <EstadoLista rows={data?.estadoSalientes ?? []} barColor="bg-status-teal" />
        </Panel>
      </div>
    </div>
  );
}

function EstadoLista({ rows, barColor }: { rows: [string, number][]; barColor: string }) {
  const total = rows.reduce((a, [, n]) => a + n, 0) || 1;
  if (rows.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">Sin datos.</p>;
  }
  return (
    <div className="space-y-3">
      {rows.map(([estado, n]) => (
        <div key={estado} className="space-y-1">
          <div className="flex justify-between text-sm">
            <span className="text-foreground">{estado}</span>
            <span className="text-muted-foreground">{n}</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div className={`h-full rounded-full ${barColor}`} style={{ width: `${(n / total) * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}
