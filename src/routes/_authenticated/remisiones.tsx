import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/backend-client";
import { useAuth } from "@/lib/auth";
import { AppHeader } from "@/components/app-header";
import { Panel, StatCard, SplitStatCard } from "@/components/stat-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Search, RotateCw, FileText, FileDown, Loader2 } from "lucide-react";
import { getTurno } from "@/lib/turno";
import { CasoRemisionCard, type Remision } from "@/components/remisiones/caso-remision-card";
import { CasoGenericoCard, type GenericoTipo } from "@/components/remisiones/caso-generico-card";
import { NuevoRegistroDialog } from "@/components/remisiones/nuevo-registro-dialog";
import { useAvisosOperativos } from "@/lib/use-avisos-operativos";
import { NIVEL_BADGE } from "@/lib/avisos-reglas";
import {
  descargarReporteGeneralPDF,
  descargarEntregaTurnoPDF,
} from "@/lib/salientes-export";
import { agruparPorEtapa } from "@/lib/salientes-grupos";
import { GrupoEtapa } from "@/components/remisiones/grupo-etapa";
import { registrarAuditoria } from "@/lib/auditoria.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/remisiones")({
  component: RemisionesPage,
});

function RemisionesPage() {
  const { canEdit, user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [prioridad, setPrioridad] = useState("todas");
  const [estadoFiltro, setEstadoFiltro] = useState("todos");
  const [eps, setEps] = useState("todas");
  const [tab, setTab] = useState("remisiones");
  const [turnoEntrega, setTurnoEntrega] = useState<string>(getTurno().nombre);
  const [recibe, setRecibe] = useState("");
  const [confirmEntrega, setConfirmEntrega] = useState(false);
  
  const [busyReporte, setBusyReporte] = useState(false);
  const [busyPdfTurno, setBusyPdfTurno] = useState(false);

  const { data: remisiones, isLoading } = useQuery({
    queryKey: ["remisiones"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("remisiones")
        .select("*")
        .eq("archivado", false)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Remision[];
    },
  });

  const { data: domiciliarios } = useQuery({
    queryKey: ["domiciliarios"],
    queryFn: async () => {
      const { data } = await supabase
        .from("domiciliarios")
        .select("*")
        .eq("archivado", false)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const { data: internas } = useQuery({
    queryKey: ["referencia-interna"],
    queryFn: async () => {
      const { data } = await supabase
        .from("referencia_interna")
        .select("*")
        .eq("archivado", false)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const { data: pendientes } = useQuery({
    queryKey: ["pendientes-rem"],
    queryFn: async () => {
      const { data } = await supabase
        .from("pendientes")
        .select("*")
        .eq("archivado", false)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const { data: auxiliares } = useQuery({
    queryKey: ["auxiliares-turno"],
    queryFn: async () => {
      // Regla canónica: solo usuarios ACTIVOS son seleccionables para recibir turno.
      // Se usa una función SECURITY DEFINER para que usuarios no admin también
      // puedan ver el directorio (sólo nombre/cargo/sede, sin PII).
      const { data } = await supabase.rpc("get_directorio_activos");
      return (data ?? []) as Array<{ user_id: string; nombre: string | null }>;
    },
  });

  // Jornadas de otras IPS registradas en RED/DISPONIBILIDAD (para el PDF).
  const { data: redJornadas } = useQuery({
    queryKey: ["red-jornadas-entrega"],
    queryFn: async () => {
      const { data } = await supabase
        .from("red_operativa")
        .select("entidad, servicio_especialidad, ciudad, jornada, fecha_inicio, fecha_final, estado")
        .eq("tipo_red", "jornada_especialidad")
        .eq("archivado", false)
        .neq("estado", "inactivo")
        .order("fecha_inicio", { ascending: false });
      return data ?? [];
    },
  });

  const { data: ultGestiones } = useQuery({
    queryKey: ["seguimientos-ult"],
    queryFn: async () => {
      const { data } = await supabase
        .from("seguimientos")
        .select("caso_id, created_at, nombre_usuario")
        .order("created_at", { ascending: false })
        .limit(1000);
      const map: Record<string, { fecha: string | null; responsable: string | null }> = {};
      for (const s of data ?? []) {
        if (!map[s.caso_id]) map[s.caso_id] = { fecha: s.created_at, responsable: s.nombre_usuario };
      }
      return map;
    },
  });

  // Última entrega de turno registrada (para la trazabilidad del estado).
  const { data: ultimaEntrega } = useQuery({
    queryKey: ["ultima-entrega-turno"],
    queryFn: async () => {
      const { data } = await supabase
        .from("entregas_turno")
        .select("turno, entrega_nombre, recibe_nombre, created_at")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data ?? null;
    },
  });
  const recibeOpciones = (auxiliares ?? []).filter((a) => a.user_id !== user?.id);

  const aseguradores = useMemo(() => {
    const set = new Set<string>();
    (remisiones ?? []).forEach((r) => r.asegurador && set.add(r.asegurador));
    return Array.from(set).sort();
  }, [remisiones]);

  const term = q.trim().toLowerCase();
  const remisionesF = useMemo(
    () =>
      (remisiones ?? []).filter((r) => {
        const matchTerm = term
          ? [r.paciente, r.documento, r.servicio, r.asegurador, r.estado, r.prioridad]
              .filter(Boolean)
              .join(" ")
              .toLowerCase()
              .includes(term)
          : true;
        const matchPrioridad = prioridad === "todas" || (r.prioridad || "").toLowerCase() === prioridad;
        const matchEstado = estadoFiltro === "todos" || (r.estado || "").toLowerCase().includes(estadoFiltro);
        const matchEps = eps === "todas" || (r.asegurador || "") === eps;
        return matchTerm && matchPrioridad && matchEstado && matchEps;
      }),
    [remisiones, term, prioridad, estadoFiltro, eps],
  );

  const count = (pred: (r: Remision) => boolean) => (remisiones ?? []).filter(pred).length;

  const stats = {
    activas: remisiones?.length ?? 0,
    pendientes: count((r) => (r.estado || "").toUpperCase().includes("PENDIENTE")),
    especiales: domiciliarios?.length ?? 0,
    internas: internas?.length ?? 0,
    generales: pendientes?.length ?? 0,
    acepPendiente: count((r) => /AMBULANCIA/i.test(r.estado || "") && /PENDIENTE/i.test(r.estado || "")),
    acepCoordinada: count((r) => /AMBULANCIA/i.test(r.estado || "") && /COORDINAD/i.test(r.estado || "")),
    desistIps: count((r) => /DESIST/i.test(r.estado || "") && !/GENERAL/i.test(r.estado || "")),
    desistGeneral: count((r) => /DESIST/i.test(r.estado || "") && /GENERAL/i.test(r.estado || "")),
  };

  const { combinados: avisos } = useAvisosOperativos();

  const nombreRecibe = recibeOpciones.find((a) => a.user_id === recibe)?.nombre || "el siguiente turno";

  // Al cerrar el turno NOCHE: pendientes de evolución → alertas, y evolución a ceros.
  const reiniciarEvolucionNoche = async () => {
    const ahora = new Date();
    const fechaTxt = ahora.toLocaleDateString("es-CO");
    const nowIso = ahora.toISOString();

    const { data: pend } = await supabase
      .from("pendientes")
      .select("id, caso_id, paciente_asunto, observacion_entrega")
      .eq("origen", "evolucion")
      .eq("archivado", false);

    if (pend && pend.length > 0) {
      const alertas = pend.map((p) => ({
        tipo: "Evolución pendiente",
        estado: "ABIERTA",
        fecha_alerta: nowIso,
        caso_id: p.caso_id,
        paciente: p.paciente_asunto,
        detalle:
          `Cierre de turno NOCHE (${fechaTxt}): quedó sin completar la evolución. ${p.observacion_entrega ?? ""}`.trim(),
        created_by: user?.id,
      }));
      await supabase.from("coordinacion").insert(alertas);
      await supabase
        .from("pendientes")
        .update({ archivado: true })
        .in("id", pend.map((p) => p.id));
    }

    const reset = {
      evolucion: "sin",
      evolucion_detalle: null,
      evolucion_motivo: null,
      evolucion_actualizada_at: nowIso,
    };
    await supabase.from("remisiones").update(reset).eq("archivado", false);
    await supabase.from("domiciliarios").update(reset).eq("archivado", false);
    await supabase.from("referencia_interna").update(reset).eq("archivado", false);
  };

  const guardarEntrega = async () => {
    if (!recibe) {
      toast.error("Selecciona quién recibe el turno");
      return;
    }
    const miNombre = auxiliares?.find((a) => a.user_id === user?.id)?.nombre || user?.email || null;
    const esNoche = turnoEntrega === "NOCHE";

    const { error } = await supabase.from("entregas_turno").insert({
      turno: turnoEntrega,
      entrega_por: user?.id,
      entrega_nombre: miNombre,
      recibe_por: recibe,
      recibe_nombre: nombreRecibe,
      reinicio_evolucion: esNoche,
      created_by: user?.id,
    });
    if (error) {
      toast.error(error.message);
      return;
    }

    if (esNoche) await reiniciarEvolucionNoche();

    setConfirmEntrega(true);
    qc.invalidateQueries({ queryKey: ["remisiones"] });
    qc.invalidateQueries({ queryKey: ["domiciliarios"] });
    qc.invalidateQueries({ queryKey: ["referencia-interna"] });
    qc.invalidateQueries({ queryKey: ["pendientes-rem"] });
    qc.invalidateQueries({ queryKey: ["coordinacion-alertas"] });
    qc.invalidateQueries({ queryKey: ["ultima-entrega-turno"] });
  };

  // Auditoría de exportación (no bloquea la descarga, sin datos sensibles).
  const auditarExport = async (accion: string, detalles: Record<string, unknown>) => {
    try {
      await registrarAuditoria({ data: { accion, modulo: "salientes", tabla: "remisiones", detalles } });
    } catch {
      /* la auditoría no debe bloquear la exportación */
    }
  };

  const miNombreExport = () =>
    auxiliares?.find((a) => a.user_id === user?.id)?.nombre || user?.email || "USUARIO";




  const handleReporteGeneral = async () => {
    setBusyReporte(true);
    try {
      await descargarReporteGeneralPDF({
        remisiones: remisiones ?? [],
        activas: stats.activas,
        especiales: stats.especiales,
        internas: stats.internas,
        pendientes: stats.generales,
        usuario: miNombreExport(),
        contadores: {
          acepPendiente: stats.acepPendiente,
          acepSinAmb: stats.acepPendiente,
          acepConAmb: stats.acepCoordinada,
          desistimientos: stats.desistIps + stats.desistGeneral,
        },
      });

      auditarExport("exportar_reporte_remisiones_activas", {
        tipo: "REPORTE_GENERAL_REMISIONES_ACTIVAS",
        registros_totales: remisiones?.length ?? 0,
        filtros: { estados: "activos", excluye: ["PHD", "PAD", "O2", "ESPECIALES", "terminales"] },
      });
      toast.success("Reporte general generado");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo generar el reporte. Intente nuevamente.");
    } finally {
      setBusyReporte(false);
    }
  };

  const handlePdfTurno = async () => {
    setBusyPdfTurno(true);
    try {
      await descargarEntregaTurnoPDF({
        turno: turnoEntrega,
        entrega: miNombreExport(),
        recibe: nombreRecibe,
        fecha: new Date().toLocaleString("es-CO"),
        activas: stats.activas,
        especiales: stats.especiales,
        internas: stats.internas,
        pendientes: stats.generales,
        reinicioNoche: turnoEntrega === "NOCHE",
        remisiones: remisiones ?? [],
        domiciliarios: (domiciliarios ?? []) as unknown as Record<string, unknown>[],
        refsInternas: (internas ?? []) as unknown as Record<string, unknown>[],
        pendientesGenerales: (pendientes ?? []) as unknown as Record<string, unknown>[],
        // NOVEDADES = avisos operativos activos + alertas de coordinación relevantes.
        novedades: (avisos ?? []).map((a) =>
          `• ${a.titulo}${a.detalle ? ` — ${a.detalle}` : ""} (${a.severidad})`,
        ),
        // JORNADAS OTRAS IPS = RED/DISPONIBILIDAD → Jornadas / Códigos TEP.
        jornadasOtrasIps: (redJornadas ?? []).map((j) => {
          const fechas = [j.fecha_inicio, j.fecha_final].filter(Boolean).join(" al ");
          return [
            j.servicio_especialidad,
            j.entidad,
            j.ciudad,
            j.jornada,
            fechas,
          ]
            .filter(Boolean)
            .join(" · ");
        }),
        contadores: {
          acepPendiente: stats.acepPendiente,
          acepSinAmb: stats.acepPendiente,
          acepConAmb: stats.acepCoordinada,
          desistimientos: stats.desistIps + stats.desistGeneral,
          altaPrioridad: count((r) => /ALTA|VITAL|URGENTE/i.test(r.prioridad || "")),
          sinSeguimiento: count((r) => {
            const upd = (r as unknown as Record<string, unknown>).evolucion_actualizada_at as string | undefined;
            return !upd || Date.now() - new Date(upd).getTime() > 24 * 3600 * 1000;
          }),
        },
      });
      auditarExport("exportar_pdf_entrega_turno", { turno: turnoEntrega });
      toast.success("PDF de entrega de turno generado");
      setConfirmEntrega(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo generar el PDF. Intente nuevamente.");
    } finally {
      setBusyPdfTurno(false);
    }
  };

  // Texto de trazabilidad del estado de entrega.
  const entregaEstadoTexto = ultimaEntrega
    ? `Última entrega: ${new Date(ultimaEntrega.created_at as string).toLocaleString("es-CO", {
        dateStyle: "short",
        timeStyle: "short",
      })} · Turno ${ultimaEntrega.turno} · Entregó: ${ultimaEntrega.entrega_nombre || "—"} · Recibió: ${
        ultimaEntrega.recibe_nombre || "—"
      }.`
    : "Aún no se ha registrado un turno hoy.";

  return (
    <div>
      <AppHeader title="DASHBOARD OPERATIVO SALIENTES" subtitle="Casos activos" />

      {/* Superior: Entrega de turno (con exportaciones) + Avisos operativos */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Entrega de turno">
          <div className="grid items-end gap-3 sm:grid-cols-[1fr_1fr_auto]">
            <div className="space-y-1.5">
              <Label className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                Turno que entrega
              </Label>
              <Select value={turnoEntrega} onValueChange={setTurnoEntrega}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="MAÑANA">MAÑANA</SelectItem>
                  <SelectItem value="MAÑANA / TARDE">MAÑANA / TARDE</SelectItem>
                  <SelectItem value="TARDE">TARDE</SelectItem>
                  <SelectItem value="NOCHE">NOCHE</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                Recibe el turno
              </Label>
              <Select value={recibe} onValueChange={setRecibe}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar…" />
                </SelectTrigger>
                <SelectContent>
                  {recibeOpciones.length === 0 ? (
                    <SelectItem value="__none" disabled>
                      Sin otros funcionarios
                    </SelectItem>
                  ) : (
                    recibeOpciones.map((a) => (
                      <SelectItem key={a.user_id} value={a.user_id}>
                        {a.nombre || "Sin nombre"}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
            <Button className="rounded-full" disabled={!canEdit} onClick={guardarEntrega}>
              Guardar entrega
            </Button>
          </div>

          <p className="mt-3 text-center text-[12px] italic text-muted-foreground">{entregaEstadoTexto}</p>

          <div className="mt-3 flex flex-wrap justify-center gap-2 border-t border-border pt-3">
            <Button variant="outline" className="rounded-full" onClick={handleReporteGeneral} disabled={busyReporte}>
              {busyReporte ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <FileText className="mr-1.5 h-4 w-4" />
              )}
              {busyReporte ? "Generando…" : "Reporte general"}
            </Button>
          </div>
        </Panel>

        {/* Avisos operativos (reubicado al espacio del antiguo cuadro Exportaciones) */}
        <Panel
          title="Avisos operativos"
          action={
            <span className="rounded-full bg-status-amber/15 px-2.5 py-1 text-[11px] font-semibold text-status-amber">
              {avisos.length} activos
            </span>
          }
        >
          {avisos.length === 0 ? (
            <p className="py-6 text-center text-sm italic text-muted-foreground">
              Sin avisos operativos activos para el turno.
            </p>
          ) : (
            <div className="max-h-80 space-y-2 overflow-y-auto">
              {avisos.map((a) => {
                const fuerte = a.severidad === "ALTO" || a.severidad === "CRITICO";
                return (
                  <div
                    key={a.key}
                    className={`rounded-lg border-l-4 px-3 py-2 ${
                      fuerte ? "border-l-status-red bg-status-red/10" : "border-l-status-amber bg-card"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium text-foreground">{a.titulo}</p>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${NIVEL_BADGE[a.severidad] ?? ""}`}>
                        {a.severidad}
                      </span>
                    </div>
                    {a.detalle && <p className="text-xs text-muted-foreground">{a.detalle}</p>}
                    <div className="mt-0.5 flex items-center gap-1.5">
                      <Badge variant="outline" className="text-[10px]">{a.kind === "IA" ? "AUTOMÁTICO" : "MANUAL"}</Badge>
                      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{a.sub}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Panel>
      </div>

      {/* Tarjetas de estado */}
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
        <StatCard title="Remisiones activas" value={stats.activas} caption="Hacia otras IPS" color="blue" />
        <StatCard title="Pendientes aceptación" value={stats.pendientes} caption="Esperando respuesta" color="amber" />
        <StatCard title="PHD / PAD / O2 / Especiales" value={stats.especiales} caption="Activos especiales" color="sky" />
        <StatCard title="Ref. internas" value={stats.internas} caption="Casos internos CEDIM" color="teal" />
        <StatCard title="Pend. generales" value={stats.generales} caption="Otros pendientes" color="amber" />
        <StatCard title="Acep. pendiente ambulancia" value={stats.acepPendiente} caption="Traslado por coordinar" color="amber" />
        <StatCard title="Acep. ambulancia coordinada" value={stats.acepCoordinada} caption="Traslado ya definido" color="green" />
        <SplitStatCard
          title="Desistimientos de remisión"
          color="red"
          parts={[
            { label: "IPS / depto específico", value: stats.desistIps },
            { label: "Remisión general", value: stats.desistGeneral },
          ]}
        />
      </div>

      {/* Pestañas + filtros + lista */}
      <div className="mt-5">
        <Tabs value={tab} onValueChange={setTab}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <TabsList className="flex h-auto flex-wrap">
              <TabsTrigger value="remisiones">📋 Remisiones</TabsTrigger>
              <TabsTrigger value="especiales">🚑 PHD/PAD/O2/Especiales</TabsTrigger>
              <TabsTrigger value="internas">🏥 Ref. Internas</TabsTrigger>
              <TabsTrigger value="pendientes">⏳ Pendientes</TabsTrigger>
            </TabsList>

            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="w-56 rounded-full pl-9"
                  placeholder="Buscar paciente, documento, IPS…"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                />
              </div>
              <Select value={prioridad} onValueChange={setPrioridad}>
                <SelectTrigger className="w-32 rounded-full">
                  <SelectValue placeholder="Prioridad" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todas">Prioridad</SelectItem>
                  <SelectItem value="alta">Alta</SelectItem>
                  <SelectItem value="media">Media</SelectItem>
                  <SelectItem value="baja">Baja</SelectItem>
                </SelectContent>
              </Select>
              <Select value={eps} onValueChange={setEps}>
                <SelectTrigger className="w-36 rounded-full">
                  <SelectValue placeholder="EPS / Asegurador" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todas">EPS / Asegurador</SelectItem>
                  {aseguradores.map((a) => (
                    <SelectItem key={a} value={a}>
                      {a}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={estadoFiltro} onValueChange={setEstadoFiltro}>
                <SelectTrigger className="w-28 rounded-full">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  <SelectItem value="pendiente">Pendientes</SelectItem>
                  <SelectItem value="aceptad">Aceptadas</SelectItem>
                </SelectContent>
              </Select>
              {canEdit && (
                <Button className="rounded-full" onClick={() => setOpen(true)}>
                  <Plus className="mr-1.5 h-4 w-4" /> Nuevo
                </Button>
              )}
              <Button
                variant="outline"
                size="icon"
                className="rounded-full"
                aria-label="Actualizar"
                onClick={() => {
                  qc.invalidateQueries({ queryKey: ["remisiones"] });
                  qc.invalidateQueries({ queryKey: ["domiciliarios"] });
                  qc.invalidateQueries({ queryKey: ["referencia-interna"] });
                  qc.invalidateQueries({ queryKey: ["pendientes-rem"] });
                }}
              >
                <RotateCw className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <TabsContent value="remisiones" className="pt-4">
            {isLoading ? (
              <p className="py-10 text-center text-sm text-muted-foreground">Cargando…</p>
            ) : remisionesF.length === 0 ? (
              <VacioModulo />
            ) : (
              <div className="grid gap-4">
                {agruparPorEtapa(remisionesF).map(({ etapa, items }) => (
                  <GrupoEtapa key={etapa.key} etapa={etapa} count={items.length}>
                    {items.map((r) => (
                      <CasoRemisionCard
                        key={r.id}
                        r={r}
                        canEdit={canEdit}
                        ultimaGestion={ultGestiones?.[r.id] ?? null}
                      />
                    ))}
                  </GrupoEtapa>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="especiales" className="pt-4">
            <ListaGenerica tipo="phd" items={domiciliarios ?? []} canEdit={canEdit} ultGestiones={ultGestiones} />
          </TabsContent>

          <TabsContent value="internas" className="pt-4">
            <ListaGenerica tipo="interna" items={internas ?? []} canEdit={canEdit} ultGestiones={ultGestiones} />
          </TabsContent>

          <TabsContent value="pendientes" className="pt-4">
            <ListaGenerica tipo="pendiente" items={pendientes ?? []} canEdit={canEdit} ultGestiones={ultGestiones} />
          </TabsContent>
        </Tabs>
      </div>

      {/* Modal nuevo registro */}
      <NuevoRegistroDialog open={open} onOpenChange={setOpen} />

      {/* Confirmación entrega de turno */}
      <Dialog open={confirmEntrega} onOpenChange={setConfirmEntrega}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Entrega de turno guardada</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Turno <span className="font-semibold text-foreground">{turnoEntrega}</span> entregado a{" "}
            <span className="font-semibold text-foreground">{nombreRecibe}</span>.
          </p>
          <p className="text-xs text-muted-foreground">
            Resumen de casos activos: {stats.activas} remisiones · {stats.especiales} PHD/especiales ·{" "}
            {stats.internas} ref. internas · {stats.generales} pendientes.
          </p>
          {turnoEntrega === "NOCHE" && (
            <p className="rounded-md bg-status-amber/10 px-3 py-2 text-xs font-medium text-status-amber">
              Cierre de turno NOCHE: la evolución de todos los casos se reinició a «Sin evolucionar». Las evoluciones
              que quedaron pendientes se enviaron como alertas a Coordinación.
            </p>
          )}
          <div className="flex justify-end pt-2">
            <Button className="rounded-full" onClick={handlePdfTurno} disabled={busyPdfTurno}>
              {busyPdfTurno ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <FileDown className="mr-1.5 h-4 w-4" />
              )}
              {busyPdfTurno ? "Generando…" : "Generar PDF"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ListaGenerica({
  tipo,
  items,
  canEdit,
  ultGestiones,
}: {
  tipo: GenericoTipo;
  items: Record<string, any>[];
  canEdit: boolean;
  ultGestiones?: Record<string, { fecha: string | null; responsable: string | null }>;
}) {
  if (items.length === 0) return <VacioModulo />;
  const grupos = agruparPorEtapa(
    items as Array<Record<string, any> & { estado?: string | null }>,
  );
  return (
    <div className="grid gap-4">
      {grupos.map(({ etapa, items: bucket }) => (
        <GrupoEtapa key={etapa.key} etapa={etapa} count={bucket.length}>
          {bucket.map((it) => (
            <CasoGenericoCard
              key={it.id as string}
              tipo={tipo}
              r={it}
              canEdit={canEdit}
              ultimaGestion={ultGestiones?.[it.id as string] ?? null}
            />
          ))}
        </GrupoEtapa>
      ))}
    </div>
  );
}

function VacioModulo() {
  return (
    <div className="rounded-2xl border border-border bg-card py-16 text-center shadow-sm">
      <p className="text-3xl text-muted-foreground">✓</p>
      <p className="mt-2 text-sm font-semibold text-foreground">Sin casos activos</p>
      <p className="text-xs text-muted-foreground">No hay casos en este módulo o con los filtros aplicados</p>
    </div>
  );
}
