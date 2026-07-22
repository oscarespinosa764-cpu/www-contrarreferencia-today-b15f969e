import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/backend-client";
import { AppHeader } from "@/components/app-header";
import { StatCard, MiniStat, SectionTitle, Panel } from "@/components/stat-card";
import { Button } from "@/components/ui/button";
import { useAvisosOperativos } from "@/lib/use-avisos-operativos";
import { NIVEL_BADGE, type Nivel } from "@/lib/avisos-reglas";
import { useAuth } from "@/lib/auth";
import { getTurno } from "@/lib/turno";
import { ArrowRight, Clock } from "lucide-react";

import {
  metricasRemisiones,
  metricasCasos,
  metricasIndicadores,
  casosNotificacion,
} from "@/lib/dashboard-metrics";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: DashboardGate,
});

function DashboardGate() {
  const { isAdmin, rolesLoaded } = useAuth();
  if (!rolesLoaded) return null;
  if (!isAdmin) return <Navigate to="/casos" replace />;
  return <Dashboard />;
}

function fmtVence(min: number): string {
  const abs = Math.abs(Math.round(min));
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  const txt = `${h}H ${m}MIN`;
  return min < 0 ? `VENCIDO HACE ${txt}` : `VENCE EN ${txt}`;
}

const ORDEN_NIVEL: Record<Nivel, number> = { CRITICO: 0, ALTO: 1, MEDIO: 2, INFO: 3 };

function Dashboard() {
  const { combinados } = useAvisosOperativos();
  const turnoActual = getTurno();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: async () => {
      const [rem, casos, dom, ri, pend, ind, med, avisos, coord, turno] = await Promise.all([
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
        supabase
          .from("historial_turnos")
          .select("turno,entrega,recibe,fecha_guardado,rango_turno,created_at")
          .order("created_at", { ascending: false })
          .limit(1),
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
        ultimoTurno: turno.data?.[0] ?? null,
      };
    },
  });

  // Agrupación de avisos operativos por caso (sourceId)
  const avisosAgrupados = useMemo(() => {
    const map = new Map<
      string,
      {
        sourceId: string;
        titulo: string;
        sub: string;
        severidad: Nivel;
        razones: string[];
        count: number;
      }
    >();
    for (const a of combinados) {
      const key = a.sourceId || a.key;
      const existing = map.get(key);
      if (!existing) {
        map.set(key, {
          sourceId: key,
          titulo: a.titulo,
          sub: a.sub,
          severidad: a.severidad,
          razones: a.detalle ? [a.detalle] : [],
          count: 1,
        });
      } else {
        existing.count += 1;
        if (a.detalle && !existing.razones.includes(a.detalle)) existing.razones.push(a.detalle);
        if ((ORDEN_NIVEL[a.severidad] ?? 9) < (ORDEN_NIVEL[existing.severidad] ?? 9)) {
          existing.severidad = a.severidad;
          existing.titulo = a.titulo;
          existing.sub = a.sub;
        }
      }
    }
    return Array.from(map.values()).sort(
      (a, b) => (ORDEN_NIVEL[a.severidad] ?? 9) - (ORDEN_NIVEL[b.severidad] ?? 9),
    );
  }, [combinados]);

  const ultimoTurno = data?.ultimoTurno;

  return (
    <div>
      <AppHeader
        title="Dashboard General"
        subtitle={`Centro Ejecutivo de Coordinación · Turno ${turnoActual.nombre} (${`${turnoActual.inicio}:00 - ${turnoActual.fin}:00`})`}
      />

      {/* PANEL INTELIGENTE — Tarjetas resumen clicables */}
      <SectionTitle>Panel inteligente de coordinación</SectionTitle>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <Link
          to="/remisiones"
          search={{ tab: "remisiones", f: "activas" }}
          className="focus:outline-none focus:ring-2 focus:ring-primary rounded-2xl"
        >
          <StatCard
            title="Remisiones salientes activas"
            value={data?.rem.activas}
            caption="En trámite hacia otras IPS · clic para ver"
            color="blue"
          />
        </Link>
        <Link
          to="/remisiones"
          search={{ tab: "remisiones", f: "pendientes" }}
          className="focus:outline-none focus:ring-2 focus:ring-primary rounded-2xl"
        >
          <StatCard
            title="Pendientes de aceptación"
            value={data?.rem.pendientesAceptacion}
            caption="Esperando respuesta de red"
            color="amber"
          />
        </Link>
        <Link
          to="/casos"
          search={{ f: "aceptados-activos" }}
          className="focus:outline-none focus:ring-2 focus:ring-primary rounded-2xl"
        >
          <StatCard
            title="Aceptaciones entrantes activas"
            value={data?.casos.pendientesIngreso}
            caption="Cupos otorgados sin ingreso confirmado"
            color="green"
          />
        </Link>
        <Link
          to="/seguimientos"
          search={{ f: "vencidos" }}
          className="focus:outline-none focus:ring-2 focus:ring-primary rounded-2xl"
        >
          <StatCard
            title="Seguimientos vencidos"
            value={data?.casos.vencidos}
            caption={`${data?.casos.proximosVencer ?? 0} próximos a vencer`}
            color="red"
          />
        </Link>
        <Link
          to="/remisiones"
          search={{ tab: "especiales", f: "activas" }}
          className="focus:outline-none focus:ring-2 focus:ring-primary rounded-2xl"
        >
          <StatCard
            title="PHD / PAD / O2 / Especiales"
            value={data?.domActivos}
            caption="Ciclos domiciliarios activos"
            color="teal"
          />
        </Link>
      </div>
      <p className="mt-2 text-[11px] italic text-muted-foreground">
        Los indicadores pueden superponerse según la condición operativa del caso.
      </p>

      {/* ESTADO Y ENTREGA DEL TURNO */}
      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <Panel
          title="Estado y entrega del turno"
          action={
            <Button asChild variant="outline" size="sm" className="rounded-full">
              <Link to="/remisiones" search={{ tab: "remisiones", accion: "entrega" }}>
                Ir a entrega de turno <ArrowRight className="ml-1 h-3.5 w-3.5" />
              </Link>
            </Button>
          }
        >
          <div className="flex items-center gap-3 rounded-xl border border-border bg-background/40 p-3">
            <Clock className="h-8 w-8 shrink-0 text-primary" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Turno actual</p>
              <p className="truncate text-sm font-bold text-foreground">
                {turnoActual.nombre} · {`${turnoActual.inicio}:00 - ${turnoActual.fin}:00`}
              </p>
            </div>
          </div>
          <div className="mt-3">
            <p className="mb-1 text-[11px] uppercase tracking-wide text-muted-foreground">
              Última entrega registrada
            </p>
            {isLoading ? (
              <p className="py-4 text-center text-sm text-muted-foreground">Cargando…</p>
            ) : !ultimoTurno ? (
              <p className="py-4 text-center text-sm italic text-muted-foreground">
                Sin entregas de turno registradas todavía.
              </p>
            ) : (
              <div className="rounded-xl border border-border bg-background/40 p-3 text-sm">
                <p className="font-bold text-foreground">
                  {ultimoTurno.turno ?? "—"}{" "}
                  {ultimoTurno.rango_turno ? (
                    <span className="text-muted-foreground">· {ultimoTurno.rango_turno}</span>
                  ) : null}
                </p>
                <p className="text-xs text-muted-foreground">
                  Entrega: <span className="font-medium text-foreground">{ultimoTurno.entrega ?? "—"}</span>
                </p>
                <p className="text-xs text-muted-foreground">
                  Recibe: <span className="font-medium text-foreground">{ultimoTurno.recibe ?? "—"}</span>
                </p>
                <p className="mt-1 text-[11px] uppercase tracking-wide text-muted-foreground">
                  {ultimoTurno.fecha_guardado
                    ? new Date(ultimoTurno.fecha_guardado).toLocaleString("es-CO")
                    : new Date(ultimoTurno.created_at as string).toLocaleString("es-CO")}
                </p>
              </div>
            )}
          </div>
        </Panel>

        {/* Alertas de entrantes (existente) */}
        <Panel
          title="Pendientes de notificación (entrantes)"
          action={
            <Button asChild variant="outline" size="sm" className="rounded-full">
              <Link to="/seguimientos">Ver seguimientos</Link>
            </Button>
          }
        >
          {(data?.notifLista?.length ?? 0) === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Sin pendientes de notificación.
            </p>
          ) : (
            <div className="max-h-72 space-y-2 overflow-y-auto">
              {data?.notifLista.slice(0, 6).map((c) => {
                const nombre =
                  [c.nombres, c.apellidos].filter(Boolean).join(" ").trim() || "Sin nombre";
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
              {(data?.notifLista.length ?? 0) > 6 && (
                <p className="pt-1 text-center text-xs text-muted-foreground">
                  +{(data?.notifLista.length ?? 0) - 6} más
                </p>
              )}
            </div>
          )}
        </Panel>
      </div>

      {/* AVISOS OPERATIVOS AGRUPADOS POR CASO */}
      <div className="mt-5">
        <Panel
          title="Avisos operativos agrupados por caso"
          action={
            <Button asChild variant="outline" size="sm" className="rounded-full">
              <Link to="/reglas">{avisosAgrupados.length} caso(s) · Ver todos</Link>
            </Button>
          }
        >
          {avisosAgrupados.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Sin avisos operativos activos. Todo en orden ✓
            </p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {avisosAgrupados.slice(0, 9).map((a) => (
                <div
                  key={a.sourceId}
                  className="rounded-xl border-l-4 border-l-status-amber bg-card px-3 py-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium text-foreground">{a.titulo}</p>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                        NIVEL_BADGE[a.severidad] ?? ""
                      }`}
                    >
                      {a.severidad}
                    </span>
                  </div>
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    {a.sub}
                  </p>
                  {a.razones.length > 0 && (
                    <ul className="mt-1 space-y-0.5">
                      {a.razones.slice(0, 3).map((r, idx) => (
                        <li key={idx} className="text-xs text-muted-foreground">
                          • {r}
                        </li>
                      ))}
                      {a.razones.length > 3 && (
                        <li className="text-[11px] italic text-muted-foreground">
                          +{a.razones.length - 3} razón(es) más
                        </li>
                      )}
                    </ul>
                  )}
                  {a.count > 1 && (
                    <p className="mt-1 text-[10px] font-semibold uppercase text-primary">
                      {a.count} señales activas en este caso
                    </p>
                  )}
                </div>
              ))}
              {avisosAgrupados.length > 9 && (
                <p className="col-span-full pt-1 text-center text-xs text-muted-foreground">
                  +{avisosAgrupados.length - 9} caso(s) más en Reglas y Alertas
                </p>
              )}
            </div>
          )}
        </Panel>
      </div>

      {/* INDICADORES + ALERTAS COORDINACIÓN */}
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Panel
          title="Indicadores rápidos del área"
          action={
            <Button asChild variant="outline" size="sm" className="rounded-full">
              <Link to="/indicadores">Ver todos los indicadores</Link>
            </Button>
          }
        >
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <MiniStat label="Total" value={data?.ind.total} color="muted" />
            <MiniStat label="En meta" value={data?.ind.enMeta} color="green" />
            <MiniStat label="Alerta" value={data?.ind.alerta} color="amber" />
            <MiniStat label="Críticos" value={data?.ind.criticos} color="red" />
          </div>
          <p className="mt-3 text-center text-[11px] text-muted-foreground">
            {data?.ind.sinMedicion ?? 0} indicador(es) sin medición reciente.
          </p>
        </Panel>
        <Panel
          title="Alertas de coordinación"
          action={
            <Button asChild variant="outline" size="sm" className="rounded-full">
              <Link to="/reglas">Gestionar</Link>
            </Button>
          }
        >
          {(data?.alertasCoord ?? 0) === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Sin alertas abiertas para coordinación.
            </p>
          ) : (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {data?.alertasCoord} alerta(s) de coordinación abierta(s).
            </p>
          )}
        </Panel>
      </div>

      {/* Métricas secundarias (contexto) */}
      <SectionTitle>Contexto operativo</SectionTitle>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Referencias internas"
          value={data?.riActivos}
          caption="Casos internos CEDIM"
          color="blue"
        />
        <StatCard
          title="Pendientes generales"
          value={data?.pendAbiertos}
          caption="Otros pendientes"
          color="amber"
        />
        <StatCard
          title="Acep. pendiente ambulancia"
          value={data?.rem.acepPendienteAmbulancia}
          caption="Traslado por coordinar"
          color="sky"
        />
        <StatCard
          title="Acep. ambulancia coordinada"
          value={data?.rem.acepAmbulanciaCoordinada}
          caption="Traslado ya definido"
          color="green"
        />
      </div>

      <div className="mt-4 flex justify-end">
        <Button
          variant="ghost"
          size="sm"
          className="rounded-full"
          onClick={() => refetch()}
        >
          Reintentar consulta
        </Button>
      </div>
    </div>
  );
}
