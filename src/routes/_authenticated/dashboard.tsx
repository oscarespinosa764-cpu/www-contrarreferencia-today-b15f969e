import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppHeader } from "@/components/app-header";
import { StatCard, MiniStat, SectionTitle, Panel } from "@/components/stat-card";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
});

function Dashboard() {
  const { data: stats } = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: async () => {
      const [rem, casos] = await Promise.all([
        supabase.from("remisiones").select("id", { count: "exact", head: true }).eq("archivado", false),
        supabase.from("casos_entrantes").select("id", { count: "exact", head: true }).eq("archivado", false),
      ]);
      return { remisiones: rem.count ?? 0, casos: casos.count ?? 0 };
    },
  });

  return (
    <div>
      <AppHeader title="Dashboard General" subtitle="Panel Inteligente de Coordinación" />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
        <StatCard title="Remisiones activas" value={stats?.remisiones} caption="En trámite hacia otras IPS" color="blue" />
        <StatCard title="Pendientes por aceptación" value={0} caption="Esperando respuesta de red" color="amber" />
        <StatCard title="PHD / PAD / O2 / Especiales" value={0} caption="Activos especiales" color="teal" />
        <StatCard title="Referencias internas" value={0} caption="Casos internos CEDIM" color="blue" />
        <StatCard title="Pendientes generales" value={0} caption="Otros pendientes" color="amber" />
        <StatCard title="Acep. pendiente ambulancia" value={0} caption="Traslado por coordinar" color="sky" />
        <StatCard title="Acep. ambulancia coordinada" value={0} caption="Traslado ya definido" color="green" />
        <StatCard title="Desistimientos de remisión" value={0} caption="Remisión general" color="muted" />
      </div>

      <SectionTitle>Referencias entrantes</SectionTitle>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatCard title="Casos aceptados" value={stats?.casos} caption="ACEP registradas" color="green" />
        <StatCard title="Casos negados" value={0} caption="NEG registradas" color="red" />
        <StatCard title="Pendientes por ingreso" value={0} caption="Aceptaciones activas sin ingreso" color="green" />
        <StatCard title="Seguimientos de aceptados" value={0} caption="Próximos a vencer" color="amber" />
        <StatCard title="Cancelación pacientes aceptados" value={0} caption="CAN asociadas a aceptaciones" color="red" />
        <StatCard title="Ampliación pacientes aceptados" value={0} caption="AMP asociadas a aceptaciones" color="sky" />
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <Panel title="Avisos operativos" action={<span className="rounded-full bg-status-amber/15 px-2 py-0.5 text-[11px] font-semibold text-status-amber">0 activos</span>}>
          <p className="py-8 text-center text-sm text-muted-foreground">Sin avisos operativos activos. Todo en orden ✓</p>
        </Panel>
        <Panel title="Pendientes de notificación" action={<Button variant="outline" size="sm" className="rounded-full">Ver seguimientos</Button>}>
          <p className="py-8 text-center text-sm text-muted-foreground">Sin pendientes de notificación.</p>
        </Panel>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Panel title="Indicadores rápidos del área" action={<Button variant="outline" size="sm" className="rounded-full">Ver todos</Button>}>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <MiniStat label="Total" value={0} color="muted" />
            <MiniStat label="En meta" value={0} color="green" />
            <MiniStat label="Alerta" value={0} color="amber" />
            <MiniStat label="Críticos" value={0} color="red" />
          </div>
          <p className="mt-3 text-center text-[11px] text-muted-foreground">0 indicador(es) sin medición reciente.</p>
          <p className="mt-1 text-center text-sm italic text-muted-foreground">Sin mediciones registradas todavía.</p>
        </Panel>
        <Panel title="Alertas de coordinación" action={<Button variant="outline" size="sm" className="rounded-full">Gestionar</Button>}>
          <p className="py-8 text-center text-sm text-muted-foreground">Sin alertas abiertas para coordinación.</p>
        </Panel>
      </div>
    </div>
  );
}
