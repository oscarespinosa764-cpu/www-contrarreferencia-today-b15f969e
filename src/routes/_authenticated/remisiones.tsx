import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { generarTextoCaso } from "@/lib/ai.functions";
import { AppHeader } from "@/components/app-header";
import { Panel, StatCard, SplitStatCard } from "@/components/stat-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Sparkles, Plus, Search, RotateCw, FileSpreadsheet, FileText, FileDown } from "lucide-react";
import { getTurno } from "@/lib/turno";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/remisiones")({
  component: RemisionesPage,
});

function RemisionesPage() {
  const { canEdit } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [prioridad, setPrioridad] = useState("todas");
  const [estadoFiltro, setEstadoFiltro] = useState("todos");
  const [tab, setTab] = useState("remisiones");
  const [turnoEntrega, setTurnoEntrega] = useState<string>(getTurno().nombre);
  const [recibe, setRecibe] = useState("");
  const [iaTexto, setIaTexto] = useState("");
  const [iaBusy, setIaBusy] = useState(false);
  const generar = useServerFn(generarTextoCaso);

  const { data: remisiones, isLoading } = useQuery({
    queryKey: ["remisiones"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("remisiones")
        .select("*")
        .eq("archivado", false)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: auxiliares } = useQuery({
    queryKey: ["auxiliares-turno"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("user_id, nombre").order("nombre");
      return data ?? [];
    },
  });

  const term = q.trim().toLowerCase();
  const remisionesF = useMemo(
    () =>
      (remisiones ?? []).filter((r) => {
        const matchTerm = term
          ? [r.paciente, r.documento, r.servicio, r.ips_receptora, r.estado, r.prioridad]
              .filter(Boolean)
              .join(" ")
              .toLowerCase()
              .includes(term)
          : true;
        const matchPrioridad = prioridad === "todas" || (r.prioridad || "").toLowerCase() === prioridad;
        const matchEstado = estadoFiltro === "todos" || (r.estado || "").toLowerCase().includes(estadoFiltro);
        return matchTerm && matchPrioridad && matchEstado;
      }),
    [remisiones, term, prioridad, estadoFiltro],
  );

  const count = (pred: (r: NonNullable<typeof remisiones>[number]) => boolean) =>
    (remisiones ?? []).filter(pred).length;

  const stats = {
    activas: remisiones?.length ?? 0,
    pendientes: count((r) => (r.estado || "").toUpperCase().includes("PENDIENTE")),
    especiales: count((r) => /PHD|PAD|O2|ESPECIAL/i.test(`${r.servicio} ${r.estado}`)),
    internas: count((r) => /INTERN/i.test(`${r.servicio} ${r.estado}`)),
    generales: count((r) => (r.estado || "").toUpperCase().includes("GENERAL")),
    acepPendiente: count((r) => /AMBULANCIA/i.test(r.estado || "") && /PENDIENTE/i.test(r.estado || "")),
    acepCoordinada: count((r) => /AMBULANCIA/i.test(r.estado || "") && /COORDINAD/i.test(r.estado || "")),
    desistIps: count((r) => /DESIST/i.test(r.estado || "") && !/GENERAL/i.test(r.estado || "")),
    desistGeneral: count((r) => /DESIST/i.test(r.estado || "") && /GENERAL/i.test(r.estado || "")),
  };

  const handleCreate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from("remisiones").insert({
      paciente: String(f.get("paciente")),
      documento: String(f.get("documento")),
      edad: String(f.get("edad")),
      servicio: String(f.get("servicio")),
      prioridad: String(f.get("prioridad")),
      asegurador: String(f.get("asegurador")),
      ips_receptora: String(f.get("ips_receptora")),
      estado: String(f.get("estado")) || "PENDIENTE ACEPTACION",
      observaciones: String(f.get("observaciones")),
      texto_ia: iaTexto || null,
      created_by: u.user?.id,
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Remisión registrada");
    setOpen(false);
    setIaTexto("");
    qc.invalidateQueries({ queryKey: ["remisiones"] });
    qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
  };

  const handleIA = (form: HTMLFormElement) => {
    const f = new FormData(form);
    const datos = `Paciente: ${f.get("paciente")}\nDocumento: ${f.get("documento")}\nEdad: ${f.get("edad")}\nServicio: ${f.get("servicio")}\nPrioridad: ${f.get("prioridad")}\nAsegurador: ${f.get("asegurador")}\nIPS receptora: ${f.get("ips_receptora")}\nObservaciones: ${f.get("observaciones")}`;
    setIaBusy(true);
    generar({ data: { tipoCaso: "remision", datos, formato: "resumen" } })
      .then((r) => {
        if (r.error) toast.error(r.error);
        else setIaTexto(r.texto);
      })
      .catch(() => toast.error("No se pudo generar el texto"))
      .finally(() => setIaBusy(false));
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
                  {(auxiliares ?? []).map((a) => (
                    <SelectItem key={a.user_id} value={a.user_id}>
                      {a.nombre || "Sin nombre"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              className="rounded-full"
              disabled={!canEdit}
              onClick={() =>
                recibe
                  ? toast.success("Entrega de turno registrada")
                  : toast.error("Selecciona quién recibe el turno")
              }
            >
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
            <Button variant="outline" className="rounded-full" onClick={() => toast.info("Exportación PDF en preparación.")}>
              <FileDown className="mr-1.5 h-4 w-4" /> PDF
            </Button>
          </div>
          <p className="mt-3 text-center text-[12px] italic text-muted-foreground">
            Formato CRUE, reporte operativo activo e impresión del dashboard.
          </p>
        </Panel>
      </div>

      {/* Avisos operativos */}
      <div className="mt-4">
        <Panel
          title="Avisos operativos"
          action={
            <span className="rounded-full bg-status-amber/15 px-2.5 py-1 text-[11px] font-semibold text-status-amber">
              0 activos
            </span>
          }
        >
          <p className="py-6 text-center text-sm italic text-muted-foreground">
            Sin avisos operativos activos para el turno.
          </p>
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
                <Dialog open={open} onOpenChange={setOpen}>
                  <DialogTrigger asChild>
                    <Button className="rounded-full">
                      <Plus className="mr-1.5 h-4 w-4" /> Nuevo
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-h-[90vh] overflow-auto sm:max-w-2xl">
                    <DialogHeader>
                      <DialogTitle>Nueva remisión saliente</DialogTitle>
                    </DialogHeader>
                    <form onSubmit={handleCreate} className="space-y-4">
                      <div className="grid gap-4 sm:grid-cols-2">
                        <Field name="paciente" label="Paciente" required />
                        <Field name="documento" label="Documento" required />
                        <Field name="edad" label="Edad" />
                        <Field name="servicio" label="Servicio" />
                        <Field name="prioridad" label="Prioridad" />
                        <Field name="asegurador" label="Asegurador" />
                        <Field name="ips_receptora" label="IPS receptora" />
                        <Field name="estado" label="Estado" />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="observaciones">Observaciones</Label>
                        <Textarea id="observaciones" name="observaciones" rows={3} />
                      </div>
                      <div className="space-y-2 rounded-md border border-border p-3">
                        <div className="flex items-center justify-between">
                          <Label className="flex items-center gap-2">
                            <Sparkles className="h-4 w-4 text-primary" /> Texto generado por IA
                          </Label>
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            className="rounded-full"
                            disabled={iaBusy}
                            onClick={(e) => handleIA(e.currentTarget.closest("form") as HTMLFormElement)}
                          >
                            {iaBusy ? "Generando…" : "Generar resumen"}
                          </Button>
                        </div>
                        <Textarea
                          value={iaTexto}
                          onChange={(e) => setIaTexto(e.target.value)}
                          rows={4}
                          placeholder="Pulsa «Generar resumen» para crear el texto del caso con IA."
                        />
                      </div>
                      <DialogFooter>
                        <Button type="submit">Guardar remisión</Button>
                      </DialogFooter>
                    </form>
                  </DialogContent>
                </Dialog>
              )}
              <Button
                variant="outline"
                size="icon"
                className="rounded-full"
                aria-label="Actualizar"
                onClick={() => qc.invalidateQueries({ queryKey: ["remisiones"] })}
              >
                <RotateCw className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <TabsContent value="remisiones" className="pt-4">
            <ListaRemisiones isLoading={isLoading} items={remisionesF} />
          </TabsContent>
          <TabsContent value="especiales" className="pt-4">
            <VacioModulo />
          </TabsContent>
          <TabsContent value="internas" className="pt-4">
            <VacioModulo />
          </TabsContent>
          <TabsContent value="pendientes" className="pt-4">
            <VacioModulo />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function ListaRemisiones({
  isLoading,
  items,
}: {
  isLoading: boolean;
  items: { id: string; paciente: string | null; documento: string | null; servicio: string | null; ips_receptora: string | null; estado: string | null; prioridad: string | null; texto_ia: string | null }[];
}) {
  if (isLoading) {
    return <p className="py-10 text-center text-sm text-muted-foreground">Cargando…</p>;
  }
  if (items.length === 0) return <VacioModulo />;
  return (
    <div className="grid gap-3">
      {items.map((r) => (
        <div key={r.id} className="rounded-xl border border-border border-l-4 border-l-status-teal bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-bold text-foreground">{r.paciente || "Sin nombre"}</p>
            {r.prioridad && <Badge variant="outline">{r.prioridad}</Badge>}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Doc: {r.documento || "—"} · {r.servicio || "—"} · {r.ips_receptora || "—"}
          </p>
          <p className="text-xs text-muted-foreground">Estado: {r.estado || "—"}</p>
          {r.texto_ia && <p className="mt-2 rounded bg-muted p-2 text-xs text-foreground">{r.texto_ia}</p>}
        </div>
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

function Field({ name, label, required }: { name: string; label: string; required?: boolean }) {
  return (
    <div className="space-y-2">
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} name={name} required={required} />
    </div>
  );
}
