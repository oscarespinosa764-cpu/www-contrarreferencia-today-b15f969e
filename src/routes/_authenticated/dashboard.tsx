import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppHeader } from "@/components/app-header";
import { StatCard, MiniStat, SectionTitle, Panel } from "@/components/stat-card";
import { Button } from "@/components/ui/button";
import {
  metricasRemisiones,
  metricasCasos,
  metricasIndicadores,
} from "@/lib/dashboard-metrics";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
});

function Dashboard() {
  const { data } = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: async () => {
      const [rem, casos, dom, ri, pend, ind, med, avisos, coord] = await Promise.all([
        supabase
          .from("remisiones")
          .select(
            "archivado,estado,tipo_tramite,remision_por,especificacion,observaciones,evolucion,evolucion_detalle,tipo_ambulancia,ips_receptora",
          )
          .limit(2000),
        supabase.from("casos_entrantes").select("archivado,tipo,estado,fecha_vence").limit(2000),
        supabase.from("domiciliarios").select("archivado").limit(2000),
        supabase.from("referencia_interna").select("archivado").limit(2000),
        supabase.from("pendientes").select("archivado,estado").limit(2000),
        supabase.from("indicadores").select("id,activo,archivado").limit(2000),
        supabase.from("mediciones_indicadores").select("indicador_id,semaforo,fecha").limit(2000),
        supabase.from("avisos").select("id,archivado,estado").eq("archivado", false).limit(2000),
        supabase
          .from("coordinacion")
          .select("id,estado,archivado")
          .eq("archivado", false)
          .limit(2000),
      ]);

      const r = metricasRemisiones(rem.data ?? []);
      const c = metricasCasos(casos.data ?? []);
      const i = metricasIndicadores(ind.data ?? [], med.data ?? []);

      const domActivos = (dom.data ?? []).filter((x) => !x.archivado).length;
      const riActivos = (ri.data ?? []).filter((x) => !x.archivado).length;
      const pendAbiertos = (pend.data ?? []).filter(
        (x) => !x.archivado && String(x.estado ?? "").toUpperCase() !== "CERRADO",
      ).length;

      const avisosActivos = (avisos.data ?? []).filter((a) => {
        const e = String(a.estado ?? "").toUpperCase();
        return e !== "INACTIVO" && e !== "CERRADO" && e !== "VENCIDO";
      }).length;

      const alertasCoord = (coord.data ?? []).filter(
        (a) => String(a.estado ?? "ABIERTA").toUpperCase() === "ABIERTA",
      ).length;

      return {
        rem: r,
        casos: c,
        ind: i,
        domActivos,
        riActivos,
        pendAbiertos,
        avisosActivos,
        alertasCoord,
        notificaciones: c.proximosVencer + c.vencidos,
      };
    },
  });

  return (
    <div>
      <AppHeader title="Dashboard General" subtitle="Panel Inteligente de Coordinación" />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
        <StatCard title="Remisiones activas" value={data?.rem.activas} caption="En trámite hacia otras IPS" color="blue" />
        <StatCard title="Pendientes por aceptación" value={data?.rem.pendientesAceptacion} caption="Esperando respuesta de red" color="amber" />
        <StatCard title="PHD / PAD / O2 / Especiales" value={data?.domActivos} caption="Activos especiales" color="teal" />
        <StatCard title="Referencias internas" value={data?.riActivos} caption="Casos internos CEDIM" color="blue" />
        <StatCard title="Pendientes generales" value={data?.pendAbiertos} caption="Otros pendientes" color="amber" />
        <StatCard title="Acep. pendiente ambulancia" value={data?.rem.acepPendienteAmbulancia} caption="Traslado por coordinar" color="sky" />
        <StatCard title="Acep. ambulancia coordinada" value={data?.rem.acepAmbulanciaCoordinada} caption="Traslado ya definido" color="green" />
        <StatCard title="Desistimiento IPS / DPTO específico" value={data?.rem.desistIps} caption="Desistimientos hacia IPS o depto. específico" color="muted" />
        <StatCard title="Desistimiento remisión general" value={data?.rem.desistGeneral} caption="Desistimientos de remisión general" color="muted" />
      </div>

      <SectionTitle>Referencias entrantes</SectionTitle>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatCard title="Casos aceptados" value={data?.casos.aceptados} caption="ACEP registradas" color="green" />
        <StatCard title="Casos negados" value={data?.casos.negados} caption="NEG registradas" color="red" />
        <StatCard title="Pendientes por ingreso" value={data?.casos.pendientesIngreso} caption="Aceptaciones activas sin ingreso" color="green" />
        <StatCard title="Seguimientos de aceptados" value={data?.casos.proximosVencer} caption="Próximos a vencer" color="amber" />
        <StatCard title="Cancelación pacientes aceptados" value={data?.casos.cancelaciones} caption="CAN asociadas a aceptaciones" color="red" />
        <StatCard title="Ampliación pacientes aceptados" value={data?.casos.ampliaciones} caption="AMP asociadas a aceptaciones" color="sky" />
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <Panel title="Avisos operativos" action={<span className="rounded-full bg-status-amber/15 px-2 py-0.5 text-[11px] font-semibold text-status-amber">{data?.avisosActivos ?? 0} activos</span>}>
          {(data?.avisosActivos ?? 0) === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Sin avisos operativos activos. Todo en orden ✓</p>
          ) : (
            <p className="py-8 text-center text-sm text-muted-foreground">{data?.avisosActivos} aviso(s) operativo(s) activo(s).</p>
          )}
        </Panel>
        <Panel title="Pendientes de notificación" action={<Button variant="outline" size="sm" className="rounded-full">Ver seguimientos</Button>}>
          {(data?.notificaciones ?? 0) === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Sin pendientes de notificación.</p>
          ) : (
            <p className="py-8 text-center text-sm text-muted-foreground">{data?.notificaciones} aceptación(es) próximas a vencer o vencidas.</p>
          )}
        </Panel>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Panel title="Indicadores rápidos del área" action={<Button variant="outline" size="sm" className="rounded-full">Ver todos</Button>}>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <MiniStat label="Total" value={data?.ind.total} color="muted" />
            <MiniStat label="En meta" value={data?.ind.enMeta} color="green" />
            <MiniStat label="Alerta" value={data?.ind.alerta} color="amber" />
            <MiniStat label="Críticos" value={data?.ind.criticos} color="red" />
          </div>
          <p className="mt-3 text-center text-[11px] text-muted-foreground">{data?.ind.sinMedicion ?? 0} indicador(es) sin medición reciente.</p>
          {(data?.ind.total ?? 0) === 0 && (
            <p className="mt-1 text-center text-sm italic text-muted-foreground">Sin mediciones registradas todavía.</p>
          )}
        </Panel>
        <Panel title="Alertas de coordinación" action={<Button variant="outline" size="sm" className="rounded-full">Gestionar</Button>}>
          {(data?.alertasCoord ?? 0) === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Sin alertas abiertas para coordinación.</p>
          ) : (
            <p className="py-8 text-center text-sm text-muted-foreground">{data?.alertasCoord} alerta(s) de coordinación abierta(s).</p>
          )}
        </Panel>
      </div>
    </div>
  );
}
