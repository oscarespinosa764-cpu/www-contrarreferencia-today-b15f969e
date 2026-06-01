import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowUpRight, ArrowDownLeft, ClipboardCheck, Users, BookOpen, BarChart3 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/control-mando")({
  component: ControlMandoPage,
});

function ControlMandoPage() {
  const { data } = useQuery({
    queryKey: ["control-mando"],
    queryFn: async () => {
      const [rem, casos, seg, users, cat] = await Promise.all([
        supabase.from("remisiones").select("id", { count: "exact", head: true }).eq("archivado", false),
        supabase.from("casos_entrantes").select("id", { count: "exact", head: true }).eq("archivado", false),
        supabase.from("seguimientos").select("id", { count: "exact", head: true }).eq("archivado", false),
        supabase.from("profiles").select("id", { count: "exact", head: true }),
        supabase.from("catalogos").select("id", { count: "exact", head: true }),
      ]);
      return {
        remisiones: rem.count ?? 0,
        casos: casos.count ?? 0,
        seguimientos: seg.count ?? 0,
        usuarios: users.count ?? 0,
        catalogo: cat.count ?? 0,
      };
    },
  });

  return (
    <div className="space-y-6">
      <PageHeader title="Control de Mando" description="Vista ejecutiva del estado general del sistema y accesos rápidos." />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Remisiones salientes activas" value={data?.remisiones} icon={ArrowUpRight} />
        <Stat label="Casos entrantes activos" value={data?.casos} icon={ArrowDownLeft} />
        <Stat label="Seguimientos activos" value={data?.seguimientos} icon={ClipboardCheck} />
        <Stat label="Usuarios del sistema" value={data?.usuarios} icon={Users} />
      </div>

      <div>
        <h2 className="mb-3 text-lg font-semibold text-foreground">Accesos rápidos</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <QuickLink to="/indicadores" label="Indicadores" desc="Métricas y desempeño" icon={BarChart3} />
          <QuickLink to="/usuarios" label="Usuarios" desc="Roles y accesos" icon={Users} />
          <QuickLink to="/catalogo" label="Catálogo" desc="Listas maestras" icon={BookOpen} />
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, icon: Icon }: { label: string; value?: number; icon: typeof Users }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
        <Icon className="h-4 w-4 text-primary" />
      </CardHeader>
      <CardContent>
        <p className="text-3xl font-bold">{value ?? "—"}</p>
      </CardContent>
    </Card>
  );
}

function QuickLink({ to, label, desc, icon: Icon }: { to: string; label: string; desc: string; icon: typeof Users }) {
  return (
    <Link to={to}>
      <Card className="transition-colors hover:bg-accent">
        <CardHeader className="flex flex-row items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <CardTitle className="text-base">{label}</CardTitle>
            <p className="text-sm text-muted-foreground">{desc}</p>
          </div>
        </CardHeader>
      </Card>
    </Link>
  );
}
