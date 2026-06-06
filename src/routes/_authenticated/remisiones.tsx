import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
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
import { Plus, Search, RotateCw, FileSpreadsheet, FileText, FileDown, ClipboardCheck } from "lucide-react";
import { getTurno } from "@/lib/turno";
import { CasoRemisionCard, type Remision } from "@/components/remisiones/caso-remision-card";
import { NuevoRegistroDialog } from "@/components/remisiones/nuevo-registro-dialog";
import { SeguimientoDialog } from "@/components/remisiones/seguimiento-dialog";
import { fmtTranscurrido, prioridadMeta, tiempoChip } from "@/lib/remisiones-utils";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/remisiones")({
  component: RemisionesPage,
});

type Aviso = {
  id: string;
  nombre: string;
  tipoDoc: string;
  motivo: string;
  accion: string;
  origen: string;
  fuente: string;
  prioridad: "ALTO" | "MEDIO" | "BAJO";
};

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
      const { data } = await supabase.from("profiles").select("user_id, nombre").order("nombre");
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

  // Recibe el turno: excluir al usuario activo.
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

  const avisos: Aviso[] = [];

  const nombreRecibe = recibeOpciones.find((a) => a.user_id === recibe)?.nombre || "el siguiente turno";

  const guardarEntrega = () => {
    if (!recibe) {
      toast.error("Selecciona quién recibe el turno");
      return;
    }
    setConfirmEntrega(true);
  };

  return (
    <div>
      <AppHeader title="Bitácora de Remisiones Salientes" subtitle="Casos activos" />

      {/* Entrega de turno + Exportaciones */}
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
          <p className="mt-3 text-center text-[12px] italic text-muted-foreground">
            Aún no se ha registrado un turno hoy.
          </p>
        </Panel>

        <Panel title="Exportaciones">
          <div className="flex flex-wrap justify-center gap-2">
            <Button className="rounded-full" onClick={() => toast.info("Exportación Excel CRUE en preparación.")}>
              <FileSpreadsheet className="mr-1.5 h-4 w-4" /> Excel CRUE
            </Button>
            <Button variant="outline" className="rounded-full" onClick={() => toast.info("Reporte general en preparación.")}>
              <FileText className="mr-1.5 h-4 w-4" /> Reporte general
            </Button>
          </div>
          <p className="mt-3 text-center text-[12px] italic text-muted-foreground">
            Formato CRUE y reporte operativo activo. La impresión PDF se genera al guardar la entrega de turno.
          </p>
        </Panel>
      </div>

      {/* Avisos operativos */}
      <div className="mt-4">
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
            <div className="space-y-2">
              {avisos.map((a) => {
                const alto = a.prioridad === "ALTO";
                return (
                  <div
                    key={a.id}
                    className={`flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border-l-4 px-3 py-2 text-xs ${
                      alto
                        ? "border-l-status-red bg-status-red/10"
                        : "border-l-border bg-card"
                    }`}
                  >
                    <span className="font-bold uppercase text-foreground">{a.nombre}</span>
                    <span className="text-muted-foreground">{a.tipoDoc}</span>
                    <span className="text-foreground">· {a.motivo}</span>
                    <span className="text-muted-foreground">→ {a.accion}</span>
                    <span className="ml-auto flex items-center gap-1.5">
                      <Badge variant="outline" className="text-[10px]">{a.origen}</Badge>
                      <Badge variant="outline" className="text-[10px]">{a.fuente}</Badge>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                          alto ? "bg-status-red text-white" : "bg-secondary text-secondary-foreground"
                        }`}
                      >
                        {a.prioridad}
                      </span>
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </Panel>
      </div>

      {/* Tarjetas de estado */}
      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
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
            <TabsList>
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
              <div className="grid gap-3">
                {remisionesF.map((r) => (
                  <CasoRemisionCard
                    key={r.id}
                    r={r}
                    canEdit={canEdit}
                    ultimaGestion={ultGestiones?.[r.id] ?? null}
                  />
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="especiales" className="pt-4">
            <ListaGenerica
              items={(domiciliarios ?? []).map((d) => ({
                id: d.id,
                nombre: d.paciente,
                doc: d.documento,
                sub: [d.tipo_solicitud, d.ips].filter(Boolean).join(" · "),
                prioridad: d.prioridad,
                estado: d.estado,
                created_at: d.created_at,
                evolucion: d.evolucion,
              }))}
              tipoCaso="domiciliario"
              tabla="domiciliarios"
              canEdit={canEdit}
              ultGestiones={ultGestiones}
            />
          </TabsContent>

          <TabsContent value="internas" className="pt-4">
            <ListaGenerica
              items={(internas ?? []).map((d) => ({
                id: d.id,
                nombre: d.paciente,
                doc: d.documento,
                sub: [d.tipo_solicitud, d.servicio].filter(Boolean).join(" · "),
                prioridad: d.prioridad,
                estado: d.estado,
                created_at: d.created_at,
                evolucion: d.evolucion,
              }))}
              tipoCaso="referencia_interna"
              tabla="referencia_interna"
              canEdit={canEdit}
              ultGestiones={ultGestiones}
            />
          </TabsContent>

          <TabsContent value="pendientes" className="pt-4">
            <ListaGenerica
              items={(pendientes ?? []).map((d) => ({
                id: d.id,
                nombre: d.paciente_asunto,
                doc: null,
                sub: [d.tipo_pendiente, d.ips_area].filter(Boolean).join(" · "),
                prioridad: d.prioridad,
                estado: d.estado,
                created_at: d.created_at,
                evolucion: null,
              }))}
              tipoCaso="pendiente"
              canEdit={canEdit}
              ultGestiones={ultGestiones}
            />
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
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" className="rounded-full" onClick={() => setConfirmEntrega(false)}>
              Cerrar
            </Button>
            <Button
              className="rounded-full"
              onClick={() => toast.info("Generación de PDF de resumen de turno en preparación.")}
            >
              <FileDown className="mr-1.5 h-4 w-4" /> Generar PDF
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

type GenericoItem = {
  id: string;
  nombre: string | null;
  doc: string | null;
  sub: string;
  prioridad: string | null;
  estado: string | null;
  created_at: string | null;
  evolucion: string | null;
};

function ListaGenerica({
  items,
  tipoCaso,
  tabla,
  canEdit,
  ultGestiones,
}: {
  items: GenericoItem[];
  tipoCaso: string;
  tabla?: string;
  canEdit: boolean;
  ultGestiones?: Record<string, { fecha: string | null; responsable: string | null }>;
}) {
  if (items.length === 0) return <VacioModulo />;
  return (
    <div className="grid gap-3">
      {items.map((it) => (
        <GenericoCard
          key={it.id}
          it={it}
          tipoCaso={tipoCaso}
          tabla={tabla}
          canEdit={canEdit}
          ultimaGestion={ultGestiones?.[it.id] ?? null}
        />
      ))}
    </div>
  );
}

function GenericoCard({
  it,
  tipoCaso,
  tabla,
  canEdit,
  ultimaGestion,
}: {
  it: GenericoItem;
  tipoCaso: string;
  tabla?: string;
  canEdit: boolean;
  ultimaGestion?: { fecha: string | null; responsable: string | null } | null;
}) {
  const [seg, setSeg] = useState(false);
  const nombre = it.nombre || "Sin nombre";
  return (
    <div className="rounded-xl border border-border border-l-4 border-l-status-sky bg-card p-3.5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-bold uppercase text-foreground">{nombre}</p>
          <p className="text-[11px] text-muted-foreground">
            {[it.sub, it.doc && `Doc: ${it.doc}`].filter(Boolean).join(" · ") || "—"}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          {it.prioridad && <Badge variant="outline">{it.prioridad}</Badge>}
          <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-semibold text-secondary-foreground">
            {fmtTranscurrido(it.created_at)}
          </span>
        </div>
      </div>
      <p className="mt-1.5 text-xs text-muted-foreground">Estado: {it.estado || "—"}</p>
      <p className="mt-1 text-[11px] text-muted-foreground">
        <span className="font-semibold">Última gestión:</span>{" "}
        {ultimaGestion ? `${ultimaGestion.responsable || "—"}` : "Sin seguimientos registrados"}
      </p>
      {canEdit && (
        <div className="mt-3 flex gap-2">
          <Button size="sm" className="rounded-full" onClick={() => setSeg(true)}>
            <ClipboardCheck className="mr-1 h-3.5 w-3.5" /> Seguimiento
          </Button>
        </div>
      )}
      <SeguimientoDialog
        open={seg}
        onOpenChange={setSeg}
        casoId={it.id}
        tipoCaso={tipoCaso}
        paciente={nombre}
        evolucionActual={it.evolucion}
        tabla={tabla}
      />
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
