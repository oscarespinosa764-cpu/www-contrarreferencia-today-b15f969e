import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppHeader } from "@/components/app-header";
import { StatCard, SplitStatCard, MiniStat, SectionTitle, Panel } from "@/components/stat-card";
import { Button } from "@/components/ui/button";
import { ProgramarAlertasDialog } from "@/components/coordinacion/programar-alertas-dialog";
import {
  metricasRemisiones,
  metricasCasos,
  metricasIndicadores,
  casosNotificacion,
} from "@/lib/dashboard-metrics";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
});

function fmtVence(min: number): string {
  const abs = Math.abs(Math.round(min));
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  const txt = `${h}H ${m}MIN`;
  return min < 0 ? `VENCIDO HACE ${txt}` : `VENCE EN ${txt}`;
}

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
        supabase
          .from("casos_entrantes")
          .select(
            "id,archivado,tipo,estado,fecha_vence,nombres,apellidos,codigo,cod_ref,especialidad,ips,documento",
          )
          .limit(2000),
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
      const notifLista = casosNotificacion(casos.data ?? []);

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
        notifLista,
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

      <SectionTitle>Remisiones salientes</SectionTitle>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
        <StatCard title="Remisiones activas" value={data?.rem.activas} caption="En trámite hacia otras IPS" color="blue" />
        <StatCard title="Pendientes por aceptación" value={data?.rem.pendientesAceptacion} caption="Esperando respuesta de red" color="amber" />
        <StatCard title="PHD / PAD / O2 / Especiales" value={data?.domActivos} caption="Activos especiales" color="teal" />
        <StatCard title="Referencias internas" value={data?.riActivos} caption="Casos internos CEDIM" color="blue" />
        <StatCard title="Pendientes generales" value={data?.pendAbiertos} caption="Otros pendientes" color="amber" />
        <StatCard title="Acep. pendiente ambulancia" value={data?.rem.acepPendienteAmbulancia} caption="Traslado por coordinar" color="sky" />
        <StatCard title="Acep. ambulancia coordinada" value={data?.rem.acepAmbulanciaCoordinada} caption="Traslado ya definido" color="green" />
        <SplitStatCard
          title="Desistimientos de remisión"
          color="muted"
          parts={[
            { label: "IPS / depto específico", value: data?.rem.desistIps },
            { label: "Remisión general", value: data?.rem.desistGeneral },
          ]}
        />
      </div>

      <SectionTitle>Referencias entrantes</SectionTitle>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatCard title="Casos aceptados" value={data?.casos.aceptados} caption="ACEP registradas" color="green" />
        <StatCard title="Casos negados" value={data?.casos.negados} caption="NEG registradas" color="red" />
        <StatCard title="Pendientes por ingreso" value={data?.casos.pendientesIngreso} caption="Aceptaciones activas sin ingreso" color="green" />
        <SplitStatCard
          title="Seguimientos de aceptados"
          color="amber"
          parts={[
            { label: "Próximos a vencer", value: data?.casos.proximosVencer, color: "amber" },
            { label: "Vencidos", value: data?.casos.vencidos, color: "red" },
          ]}
        />
        <StatCard title="Cancelación pacientes aceptados" value={data?.casos.cancelaciones} caption="CAN asociadas a aceptaciones" color="red" />
        <StatCard title="Ampliación pacientes aceptados" value={data?.casos.ampliaciones} caption="AMP asociadas a aceptaciones" color="sky" />
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <Panel
          title="Avisos operativos"
          action={
            <span className="rounded-full border border-border bg-secondary px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-secondary-foreground">
              {data?.avisosActivos ?? 0} activos
            </span>
          }
        >
          {(data?.avisosActivos ?? 0) === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Sin avisos operativos activos. Todo en orden ✓</p>
          ) : (
            <p className="py-8 text-center text-sm text-muted-foreground">{data?.avisosActivos} aviso(s) operativo(s) activo(s).</p>
          )}
        </Panel>
        <Panel
          title="Pendientes de notificación"
          action={
            <Button asChild variant="outline" size="sm" className="rounded-full">
              <Link to="/seguimientos">Ver seguimientos</Link>
            </Button>
          }
        >
          <p className="-mt-1 mb-3 text-center text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Remisiones entrantes
          </p>
          {(data?.notifLista?.length ?? 0) === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Sin pendientes de notificación.</p>
          ) : (
            <div className="space-y-2">
              {data?.notifLista.map((c) => {
                const nombre = [c.nombres, c.apellidos].filter(Boolean).join(" ").trim() || "Sin nombre";
                const vencido = (c.minutos ?? 0) < 0;
                return (
                  <div
                    key={c.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-border bg-background/40 p-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold uppercase text-foreground">{nombre}</p>
                      <p className="truncate text-[11px] text-muted-foreground">
                        {[c.codigo, c.especialidad].filter(Boolean).join(" · ") || "—"}
                      </p>
                      <p className="truncate text-[11px] text-muted-foreground">
                        IPS: {c.ips || "—"} · Doc: {c.documento || "—"}
                      </p>
                    </div>
                    {c.minutos !== null && (
                      <span
                        className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold ${
                          vencido
                            ? "bg-status-red/15 text-status-red"
                            : "bg-status-amber/15 text-status-amber"
                        }`}
                      >
                        {fmtVence(c.minutos)}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Panel>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Panel
          title="Indicadores rápidos del área"
          action={
            <Button asChild variant="outline" size="sm" className="rounded-full">
              <Link to="/indicadores">Ver todos</Link>
            </Button>
          }
        >
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
        <Panel
          title="Alertas de coordinación"
          leftAction={
            <Button asChild variant="outline" size="sm" className="rounded-full">
              <Link to="/remisiones">Programar</Link>
            </Button>
          }
          action={
            <Button asChild variant="outline" size="sm" className="rounded-full">
              <Link to="/remisiones">Gestionar</Link>
            </Button>
          }
        >
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
