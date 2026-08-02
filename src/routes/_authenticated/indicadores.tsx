import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/backend-client";
import { useAuth } from "@/lib/auth";
import { AppHeader } from "@/components/app-header";
import { FiltersBar } from "@/components/filters/filters-bar";
import { Panel } from "@/components/stat-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Plus,
  Search,
  Pencil,
  Archive,
  Filter,
  Info,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  CircleDashed,
  TrendingUp,
  TrendingDown,
  Minus,
  X as XIcon,
} from "lucide-react";
import { toast } from "sonner";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
  AreaChart,
  Area,
} from "recharts";
import {
  type Indicador,
  type Medicion,
  type Semaforo,
  TIPOS_INDICADOR,
  UNIDADES_INDICADOR,
  SENTIDOS_INDICADOR,
  calcularResultado,
  calcularSemaforo,
  formatearPeriodo,
  SEMAFORO_LABEL,
} from "@/lib/indicadores-utils";
import {
  type ContextoTemporal,
  type PeriodoCanonico,
  type ResolucionCanonica,
  contextoDesdeFecha,
  serieCanonica,
  resolverCanonico,
  calcularCumplimiento,
  esMenorEsMejor,
  etiquetaPeriodoCorta,
  fmtNum,
} from "@/lib/indicadores-canonico";
import { obtenerFechaCorteIndicadores } from "@/lib/indicadores.functions";

export const Route = createFileRoute("/_authenticated/indicadores")({
  component: IndicadoresPage,
});

// ── Estilos y colores semánticos ──────────────────────────────────────────
const selectCls =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

// Los tokens del design system son valores oklch() completos, NO triples HSL.
// Envolverlos en hsl(var(--x)) produce un color inválido → series negras.
// Se usan directamente con fallback explícito.
const COLOR = {
  green: "var(--status-green, oklch(0.7 0.16 152))",
  amber: "var(--status-amber, oklch(0.78 0.16 75))",
  red: "var(--status-red, oklch(0.62 0.22 25))",
  sky: "var(--primary, oklch(0.3538 0.1107 253.47))",
  accent: "var(--chart-2, oklch(0.62 0.13 230))",
  muted: "var(--muted-foreground, oklch(0.52 0.03 245))",
  border: "var(--border, oklch(0.922 0.013 248))",
  popover: "var(--popover, oklch(1 0 0))",
};

const tooltipStyle = {
  background: COLOR.popover,
  border: `1px solid ${COLOR.border}`,
  borderRadius: 8,
  fontSize: 12,
  color: "var(--foreground, oklch(0.2 0.02 250))",
} as const;

const pillCls: Record<Semaforo, string> = {
  VERDE: "bg-status-green/15 text-status-green",
  AMARILLO: "bg-status-amber/15 text-status-amber",
  ROJO: "bg-status-red/15 text-status-red",
  GRIS: "bg-muted text-muted-foreground",
};

const borderCls: Record<Semaforo, string> = {
  VERDE: "border-l-status-green",
  AMARILLO: "border-l-status-amber",
  ROJO: "border-l-status-red",
  GRIS: "border-l-border",
};

const colorSemaforo = (s: Semaforo) =>
  s === "VERDE" ? COLOR.green : s === "AMARILLO" ? COLOR.amber : s === "ROJO" ? COLOR.red : COLOR.muted;


// ── Filtros ───────────────────────────────────────────────────────────────
type Filtros = {
  fechaInicio: string;
  fechaFin: string;
  turno: string;
  area: string;
  responsable: string;
  estado: "" | Semaforo;
  frecuencia: string;
  tipo: string;
};
const FILTROS_INICIAL: Filtros = {
  fechaInicio: "",
  fechaFin: "",
  turno: "",
  area: "",
  responsable: "",
  estado: "",
  frecuencia: "",
  tipo: "",
};

// ── Página ────────────────────────────────────────────────────────────────
function IndicadoresPage() {
  const { isAdmin, canEdit } = useAuth();
  const qc = useQueryClient();

  const [q, setQ] = useState("");
  const [qDebounced, setQDebounced] = useState("");
  useEffect(() => {
    const id = setTimeout(() => setQDebounced(q), 250);
    return () => clearTimeout(id);
  }, [q]);

  const [filtros, setFiltros] = useState<Filtros>(FILTROS_INICIAL);
  const [filtrosOpen, setFiltrosOpen] = useState(false);
  const [orden, setOrden] = useState<"estado" | "nombre" | "cumplimiento" | "reciente">("estado");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Indicador | null>(null);
  const [detalleId, setDetalleId] = useState<string | null>(null);

  const { data: indicadores, isLoading } = useQuery({
    queryKey: ["indicadores-cfg"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("indicadores")
        .select("*")
        .eq("archivado", false)
        .order("codigo", { ascending: true });
      if (error) throw error;
      return data as Indicador[];
    },
  });

  const { data: mediciones } = useQuery({
    queryKey: ["mediciones-ind"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("mediciones_indicadores")
        .select("*")
        .order("periodo", { ascending: true });
      if (error) throw error;
      return data as Medicion[];
    },
  });

  const inds = useMemo(() => indicadores ?? [], [indicadores]);
  const meds = useMemo(() => mediciones ?? [], [mediciones]);

  // Fecha de corte autoritativa (servidor, America/Bogota). Nunca el navegador.
  const { data: corte } = useQuery({
    queryKey: ["indicadores-fecha-corte"],
    queryFn: () => obtenerFechaCorteIndicadores(),
    staleTime: 5 * 60_000,
  });

  const ctx: ContextoTemporal = useMemo(
    () => contextoDesdeFecha(corte?.fecha ?? "", corte?.hora ?? "00:00"),
    [corte],
  );

  // Mediciones filtradas por rango de fechas (aplican a tarjetas, tendencia y ranking).
  const medsFiltradas = useMemo(() => {
    const ini = filtros.fechaInicio;
    const fin = filtros.fechaFin;
    if (!ini && !fin) return meds;
    return meds.filter((m) => {
      const p = String(m.periodo || m.created_at || "").slice(0, 10);
      if (ini && p < ini) return false;
      if (fin && p > fin) return false;
      return true;
    });
  }, [meds, filtros.fechaInicio, filtros.fechaFin]);

  // FUENTE CANÓNICA: una serie por indicador, un registro por periodo.
  const seriesPorIndicador = useMemo(() => {
    const out: Record<string, PeriodoCanonico[]> = {};
    for (const ind of inds) out[ind.id] = serieCanonica(ind, medsFiltradas, ctx);
    return out;
  }, [inds, medsFiltradas, ctx]);

  // Resolución canónica visible en tarjetas y ranking.
  const resoluciones = useMemo(() => {
    const out: Record<string, ResolucionCanonica> = {};
    for (const ind of inds) out[ind.id] = resolverCanonico(seriesPorIndicador[ind.id] ?? [], ctx);
    return out;
  }, [inds, seriesPorIndicador, ctx]);

  // Opciones dinámicas para filtros (derivadas de datos reales).
  const opcionesArea = useMemo(
    () => Array.from(new Set(inds.map((i) => (i.responsable || "").trim()).filter(Boolean))).sort(),
    [inds],
  );
  const opcionesFrecuencia = useMemo(
    () => Array.from(new Set(inds.map((i) => (i.fuente || "").trim()).filter(Boolean))).sort(),
    [inds],
  );

  // Aplicar filtros + búsqueda a los indicadores activos.
  const indsFiltrados = useMemo(() => {
    const t = qDebounced.trim().toLowerCase();
    return inds.filter((i) => {
      if (!i.activo) return false;
      if (filtros.area && (i.responsable || "").trim() !== filtros.area) return false;
      if (filtros.responsable && (i.responsable || "").trim() !== filtros.responsable) return false;
      if (filtros.frecuencia && (i.fuente || "").trim() !== filtros.frecuencia) return false;
      if (filtros.tipo && (i.tipo || "").trim() !== filtros.tipo) return false;
      if (filtros.estado) {
        const sem = resoluciones[i.id]?.fila?.semaforo ?? "GRIS";
        if (sem !== filtros.estado) return false;
      }
      if (t) {
        const hay = [i.nombre, i.codigo, i.tipo, i.responsable, i.fuente]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!hay.includes(t)) return false;
      }
      return true;
    });
  }, [inds, filtros, resoluciones, qDebounced]);

  // ── Resumen ────────────────────────────────────────────────────────────
  const resumen = useMemo(() => {
    const activos = indsFiltrados;
    let verdes = 0,
      amarillos = 0,
      rojos = 0,
      sinDato = 0;
    const cumplimientos: number[] = [];
    for (const ind of activos) {
      const fila = resoluciones[ind.id]?.fila ?? null;
      const sem = fila?.semaforo ?? "GRIS";
      if (sem === "VERDE") verdes++;
      else if (sem === "AMARILLO") amarillos++;
      else if (sem === "ROJO") rojos++;
      else sinDato++;
      // Cumplimiento general = promedio del cumplimiento individual (capado a
      // 100) de los indicadores con dato canónico vigente.
      const c = fila?.cumplimiento ?? null;
      if (c !== null) cumplimientos.push(Math.min(100, Math.max(0, c)));
    }
    const total = activos.length;
    const pct = (n: number) => (total > 0 ? Math.round((n / total) * 100) : 0);
    const cumplimientoGeneral =
      cumplimientos.length > 0
        ? Math.round(cumplimientos.reduce((a, b) => a + b, 0) / cumplimientos.length)
        : null;
    return {
      total,
      verdes,
      amarillos,
      rojos,
      sinDato,
      evaluados: cumplimientos.length,
      pctVerdes: pct(verdes),
      pctAmarillos: pct(amarillos),
      pctRojos: pct(rojos),
      pctSin: pct(sinDato),
      cumplimientoGeneral,
    };
  }, [indsFiltrados, resoluciones]);

  // ── Tendencia general por periodo (mes) ────────────────────────────────
  const tendenciaGeneral = useMemo(() => {
    // Se agregan las series canónicas: un solo registro por indicador y mes.
    const porPeriodo = new Map<
      string,
      { cumplimiento: number[]; v: number; a: number; r: number; s: number }
    >();
    for (const ind of indsFiltrados) {
      for (const fila of seriesPorIndicador[ind.id] ?? []) {
        const entry =
          porPeriodo.get(fila.periodo) || { cumplimiento: [], v: 0, a: 0, r: 0, s: 0 };
        if (fila.cumplimiento !== null) {
          entry.cumplimiento.push(Math.min(100, Math.max(0, fila.cumplimiento)));
        }
        if (fila.semaforo === "VERDE") entry.v++;
        else if (fila.semaforo === "AMARILLO") entry.a++;
        else if (fila.semaforo === "ROJO") entry.r++;
        else entry.s++;
        porPeriodo.set(fila.periodo, entry);
      }
    }
    return Array.from(porPeriodo.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([per, v]) => ({
        periodo: per,
        cumplimiento:
          v.cumplimiento.length > 0
            ? Math.round(v.cumplimiento.reduce((a, b) => a + b, 0) / v.cumplimiento.length)
            : null,
        enMeta: v.v,
        alerta: v.a,
        critico: v.r,
        sinMedicion: v.s,
      }));
  }, [indsFiltrados, seriesPorIndicador]);

  // ── Ranking ────────────────────────────────────────────────────────────
  const ranking = useMemo(() => {
    const rows = indsFiltrados.map((ind) => {
      const res = resoluciones[ind.id] ?? { fila: null, origen: "SIN_DATO" as const, etiquetaPeriodo: "SIN DATO" };
      return {
        ind,
        fila: res.fila,
        res,
        sem: res.fila?.semaforo ?? "GRIS",
        cumpl: res.fila?.cumplimiento ?? null,
      };
    });
    const rank: Record<Semaforo, number> = { ROJO: 0, AMARILLO: 1, GRIS: 2, VERDE: 3 };
    const cmp = (a: (typeof rows)[number], b: (typeof rows)[number]) => {
      if (orden === "nombre") return String(a.ind.nombre).localeCompare(String(b.ind.nombre));
      if (orden === "cumplimiento") return (b.cumpl ?? -1) - (a.cumpl ?? -1);
      if (orden === "reciente") {
        return String(b.fila?.periodo ?? "").localeCompare(String(a.fila?.periodo ?? ""));
      }
      // "estado" por defecto: Crítico → Alerta → Sin medición → En meta, luego cumplimiento asc
      const dr = rank[a.sem] - rank[b.sem];
      if (dr !== 0) return dr;
      return (a.cumpl ?? Infinity) - (b.cumpl ?? Infinity);
    };
    return rows.sort(cmp);
  }, [indsFiltrados, resoluciones, orden]);


  // ── Guardado / edición ────────────────────────────────────────────────
  const onGuardarIndicador = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const payload = {
      nombre: String(f.get("nombre") || "").trim(),
      codigo: String(f.get("codigo") || "").trim() || null,
      tipo: String(f.get("tipo") || "PROPORCION"),
      descripcion: String(f.get("descripcion") || "").trim() || null,
      numerador: String(f.get("numerador") || "").trim() || null,
      denominador: String(f.get("denominador") || "").trim() || null,
      meta: f.get("meta") ? Number(f.get("meta")) : null,
      unidad: String(f.get("unidad") || "%"),
      sentido: String(f.get("sentido") || "MAYOR_ES_MEJOR"),
      responsable: String(f.get("responsable") || "").trim() || null,
      fuente: String(f.get("fuente") || "").trim() || null,
      activo: String(f.get("activo") || "SI") === "SI",
    };
    if (!payload.nombre) return toast.error("El nombre del indicador es obligatorio.");
    const { error } = editing
      ? await supabase.from("indicadores").update(payload).eq("id", editing.id)
      : await supabase.from("indicadores").insert(payload);
    if (error) return toast.error(error.message);
    toast.success(editing ? "Indicador actualizado" : "Indicador creado");
    setFormOpen(false);
    setEditing(null);
    qc.invalidateQueries({ queryKey: ["indicadores-cfg"] });
  };

  const onArchivar = async (ind: Indicador) => {
    if (!confirm(`¿Archivar el indicador "${ind.nombre}"?`)) return;
    const { error } = await supabase
      .from("indicadores")
      .update({ archivado: true })
      .eq("id", ind.id);
    if (error) return toast.error(error.message);
    toast.success("Indicador archivado");
    qc.invalidateQueries({ queryKey: ["indicadores-cfg"] });
  };

  const onGuardarMedicion = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const indId = String(f.get("indicador") || "");
    const ind = inds.find((i) => i.id === indId);
    if (!ind) return toast.error("Seleccione un indicador válido.");
    const periodo = String(f.get("periodo") || "");
    if (!periodo) return toast.error("El periodo de medición es obligatorio.");
    const num = Number(f.get("numerador") || 0);
    const den = Number(f.get("denominador") || 0);
    const resultado = calcularResultado(ind.tipo, num, den);
    const semaforo = calcularSemaforo(resultado, ind.meta, ind.sentido);
    const { error } = await supabase.from("mediciones_indicadores").insert({
      indicador_id: indId,
      periodo,
      numerador_valor: num,
      denominador_valor: den,
      resultado,
      meta: ind.meta,
      unidad: ind.unidad,
      semaforo,
      comentario: String(f.get("comentario") || "").trim() || null,
    });
    if (error) return toast.error(error.message);
    toast.success(`Medición guardada · ${resultado ?? "—"} ${ind.unidad ?? ""}`);
    form.reset();
    qc.invalidateQueries({ queryKey: ["mediciones-ind"] });
  };

  const indicadorDetalle = useMemo(
    () => inds.find((i) => i.id === detalleId) || null,
    [inds, detalleId],
  );

  const activeFiltros = Object.values(filtros).filter(Boolean).length;
  const sparkAll = tendenciaGeneral.map((p) => ({ v: p.cumplimiento ?? 0 }));

  return (
    <div>
      <AppHeader title="Indicadores" subtitle="Panel ejecutivo · KPIs, Tendencias y Cumplimiento." />

      {/* Aviso discreto */}
      <div className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <Info className="h-3.5 w-3.5" />
        Haz clic en un indicador para ver más detalles
      </div>

      {/* Barra de acciones (buscador + filtros + nuevo) */}
      <FiltersBar
        className="mt-4"
        alwaysCompact
        activeCount={activeFiltros}
        onClear={() => { setQ(""); setFiltros(FILTROS_INICIAL); }}
        primary={
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="rounded-full pl-9"
              placeholder="Buscar por nombre, código, área o responsable…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
        }
        secondary={
          <FiltrosPanel
            filtros={filtros}
            setFiltros={setFiltros}
            areas={opcionesArea}
            frecuencias={opcionesFrecuencia}
            onClear={() => setFiltros(FILTROS_INICIAL)}
            onClose={() => {}}
          />
        }
        extraActions={
          canEdit ? (
            <Button className="ml-auto rounded-full" onClick={() => { setEditing(null); setFormOpen(true); }}>
              <Plus className="mr-1.5 h-4 w-4" /> Nuevo indicador
            </Button>
          ) : null
        }
      />


      {/* Sección 1 · Resumen */}
      <section aria-label="Resumen de indicadores" className="mt-5">
        <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
          Resumen de indicadores
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5">
          <ResumenCard
            titulo="Indicadores activos"
            valor={resumen.total}
            porcentaje={100}
            color={COLOR.sky}
            icon={<Info className="h-4 w-4" />}
            spark={sparkAll}
          />
          <ResumenCard
            titulo="En meta"
            valor={resumen.verdes}
            porcentaje={resumen.pctVerdes}
            color={COLOR.green}
            icon={<CheckCircle2 className="h-4 w-4 text-status-green" />}
            spark={tendenciaGeneral.map((p) => ({ v: p.enMeta }))}
          />
          <ResumenCard
            titulo="Alerta"
            valor={resumen.amarillos}
            porcentaje={resumen.pctAmarillos}
            color={COLOR.amber}
            icon={<AlertTriangle className="h-4 w-4 text-status-amber" />}
            spark={tendenciaGeneral.map((p) => ({ v: p.alerta }))}
          />
          <ResumenCard
            titulo="Crítico"
            valor={resumen.rojos}
            porcentaje={resumen.pctRojos}
            color={COLOR.red}
            icon={<XCircle className="h-4 w-4 text-status-red" />}
            spark={tendenciaGeneral.map((p) => ({ v: p.critico }))}
          />
          <ResumenCard
            titulo="Sin medición"
            valor={resumen.sinDato}
            porcentaje={resumen.pctSin}
            color={COLOR.sky}
            icon={<CircleDashed className="h-4 w-4 text-muted-foreground" />}
            spark={tendenciaGeneral.map((p) => ({ v: p.sinMedicion }))}
          />
        </div>
      </section>

      {/* Sección 2 · Desempeño general */}
      <section aria-label="Desempeño general" className="mt-6">
        <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
          Desempeño general
        </p>
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
          <DonutCumplimiento resumen={resumen} />
          <TendenciaCumplimientoChart data={tendenciaGeneral} />
          <DonutPorEstado resumen={resumen} />
        </div>
      </section>

      {/* Sección 3 · Ranking */}
      <section aria-label="Ranking de indicadores" className="mt-6">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
            Ranking de indicadores
          </p>
          <div className="flex items-center gap-2 text-xs">
            <Label className="text-[11px] uppercase text-muted-foreground">Orden</Label>
            <select
              value={orden}
              onChange={(e) => setOrden(e.target.value as typeof orden)}
              className={selectCls + " h-8 w-auto text-xs"}
            >
              <option value="estado">Estado (crítico primero)</option>
              <option value="cumplimiento">Cumplimiento</option>
              <option value="nombre">Nombre</option>
              <option value="reciente">Última actualización</option>
            </select>
          </div>
        </div>
        {isLoading ? (
          <p className="py-10 text-center text-sm text-muted-foreground">Cargando indicadores…</p>
        ) : ranking.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
            {inds.length === 0
              ? "Sin indicadores configurados."
              : "Sin resultados para los filtros aplicados."}
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-border bg-card">
            {/* Cabecera oculta en móvil */}
            <div className="hidden grid-cols-12 gap-2 border-b border-border/60 bg-muted/30 px-4 py-2 text-[10px] font-bold uppercase tracking-wide text-muted-foreground sm:grid">
              <div className="col-span-5">Indicador</div>
              <div className="col-span-2">Resultado</div>
              <div className="col-span-3">Cumplimiento</div>
              <div className="col-span-2 text-right">Estado</div>
            </div>
            <ul className="divide-y divide-border/60">
              {ranking.map(({ ind, fila, res, sem, cumpl }) => (
                <li key={ind.id}>
                  <button
                    type="button"
                    onClick={() => setDetalleId(ind.id)}
                    className={`grid w-full grid-cols-1 gap-2 border-l-4 px-4 py-3 text-left transition-colors hover:bg-muted/40 sm:grid-cols-12 sm:items-center ${borderCls[sem]}`}
                  >
                    <div className="sm:col-span-5">
                      <p className="truncate text-sm font-bold text-foreground">{ind.nombre}</p>
                      <p className="truncate text-[11px] uppercase tracking-wide text-muted-foreground">
                        {ind.codigo || "Sin código"} · {ind.responsable || "Coordinación"}
                      </p>
                    </div>
                    <div className="text-sm sm:col-span-2">
                      {fila && fila.resultado !== null ? (
                        <>
                          <span className="font-bold text-foreground">
                            {fila.resultado} {fila.unidad}
                          </span>
                          <span className="block text-[10px] uppercase text-muted-foreground">
                            {res.etiquetaPeriodo}
                          </span>
                        </>
                      ) : fila ? (
                        <>
                          <span className="text-xs font-semibold text-muted-foreground">
                            No calculable
                          </span>
                          <span className="block text-[10px] uppercase text-muted-foreground">
                            {etiquetaPeriodoCorta(fila.periodo)}
                          </span>
                        </>
                      ) : (
                        <span className="text-xs italic text-muted-foreground">Sin datos</span>
                      )}
                    </div>

                    <div className="sm:col-span-3">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-primary"
                            style={{ width: `${Math.min(100, Math.max(0, cumpl ?? 0))}%` }}
                          />
                        </div>
                        <span className="w-10 text-right text-[11px] font-semibold text-muted-foreground">
                          {cumpl !== null ? `${Math.round(cumpl)}%` : "—"}
                        </span>
                      </div>
                    </div>
                    <div className="sm:col-span-2 sm:text-right">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${pillCls[sem]}`}
                      >
                        {SEMAFORO_LABEL[sem]}
                      </span>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* Captura mensual (rol) */}
      {canEdit && (
        <div className="mt-6">
          <Panel title="Captura mensual de indicadores" bodyMaxHeight={null}>
            <form onSubmit={onGuardarMedicion} className="grid gap-4 md:grid-cols-3">
              <div className="space-y-1.5 md:col-span-2">
                <Label>Indicador</Label>
                <select name="indicador" className={selectCls} defaultValue="" required>
                  <option value="" disabled>
                    Seleccione…
                  </option>
                  {inds
                    .filter((i) => i.activo)
                    .map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.codigo} · {i.nombre}
                      </option>
                    ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>Periodo</Label>
                <Input
                  name="periodo"
                  type="month"
                  defaultValue={new Date().toISOString().slice(0, 7)}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label>Numerador / Valor Acumulado</Label>
                <Input name="numerador" type="number" step="any" placeholder="0" />
              </div>
              <div className="space-y-1.5">
                <Label>Denominador / Casos</Label>
                <Input name="denominador" type="number" step="any" placeholder="0" />
              </div>
              <div className="space-y-1.5">
                <Label>Comentario</Label>
                <Input name="comentario" placeholder="Análisis breve o compromiso de mejora" />
              </div>
              <div className="flex justify-end md:col-span-3">
                <Button type="submit">Guardar medición</Button>
              </div>
            </form>
          </Panel>
        </div>
      )}

      {/* Modal detalle */}
      {indicadorDetalle && (
        <IndicadorDetalleModal
          open={!!detalleId}
          onOpenChange={(v) => !v && setDetalleId(null)}
          ind={indicadorDetalle}
          historial={historialIndicador(meds, indicadorDetalle.id)}
          medActual={ultimas[indicadorDetalle.id]}
          canEdit={canEdit}
          isAdmin={isAdmin}
          onEdit={() => {
            setEditing(indicadorDetalle);
            setFormOpen(true);
          }}
          onArchive={() => onArchivar(indicadorDetalle)}
        />
      )}

      <IndicadorFormDialog
        open={formOpen}
        onOpenChange={(v) => {
          setFormOpen(v);
          if (!v) setEditing(null);
        }}
        editing={editing}
        onSubmit={onGuardarIndicador}
      />
    </div>
  );
}

// ── Componentes ─────────────────────────────────────────────────────────

function ResumenCard({
  titulo,
  valor,
  porcentaje,
  color,
  icon,
  spark,
}: {
  titulo: string;
  valor: number;
  porcentaje: number;
  color: string;
  icon: React.ReactNode;
  spark: { v: number }[];
}) {
  const donutData = [
    { name: "v", value: porcentaje },
    { name: "r", value: Math.max(0, 100 - porcentaje) },
  ];
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
            {icon} <span className="truncate">{titulo}</span>
          </p>
          <p className="mt-1 text-3xl font-extrabold text-foreground">{valor}</p>
          <p className="text-[11px] text-muted-foreground">{porcentaje}% del total</p>
        </div>
        <div className="h-12 w-12 shrink-0">
          <ResponsiveContainer>
            <PieChart>
              <Pie
                data={donutData}
                dataKey="value"
                cx="50%"
                cy="50%"
                innerRadius={12}
                outerRadius={22}
                startAngle={90}
                endAngle={-270}
                stroke="none"
              >
                <Cell fill={color} />
                <Cell fill="hsl(var(--muted))" />
              </Pie>
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div className="mt-2 h-10">
        {spark.length === 0 ? (
          <p className="text-center text-[10px] italic text-muted-foreground">Sin tendencia</p>
        ) : (
          <ResponsiveContainer>
            <AreaChart data={spark} margin={{ top: 2, bottom: 2, left: 0, right: 0 }}>
              <Area type="monotone" dataKey="v" stroke={color} fill={color} fillOpacity={0.2} strokeWidth={1.5} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

type ResumenGeneral = {
  verdes: number;
  amarillos: number;
  rojos: number;
  sinDato: number;
  evaluados: number;
  pctVerdes: number;
  pctAmarillos: number;
  pctRojos: number;
  pctSin: number;
  cumplimientoGeneral: number | null;
};

function DonutCumplimiento({ resumen }: { resumen: ResumenGeneral }) {

  const data = [
    { name: "En meta", value: resumen.verdes, color: COLOR.green },
    { name: "Alerta", value: resumen.amarillos, color: COLOR.amber },
    { name: "Crítico", value: resumen.rojos, color: COLOR.red },
    { name: "Sin medición", value: resumen.sinDato, color: COLOR.muted },
  ];
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
        Cumplimiento de metas
      </p>
      <div className="mt-2 grid grid-cols-2 gap-2 items-center">
        <div className="relative h-40">
          <ResponsiveContainer>
            <PieChart>
              <Pie data={data} dataKey="value" innerRadius={44} outerRadius={64} stroke="none">
                {data.map((d) => (
                  <Cell key={d.name} fill={d.color} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-2 text-center leading-tight">
            <span className="text-lg font-extrabold text-foreground">
              {resumen.cumplimientoGeneral}%
            </span>
            <span className="text-[8px] uppercase text-muted-foreground">Cumplimiento</span>
          </div>
        </div>
        <ul className="space-y-1.5 text-xs">
          <LegendItem color={COLOR.green} label="En meta" n={resumen.verdes} p={resumen.pctVerdes} />
          <LegendItem color={COLOR.amber} label="Alerta" n={resumen.amarillos} p={resumen.pctAmarillos} />
          <LegendItem color={COLOR.red} label="Crítico" n={resumen.rojos} p={resumen.pctRojos} />
          <LegendItem color={COLOR.muted} label="Sin medición" n={resumen.sinDato} p={resumen.pctSin} />
        </ul>
      </div>
    </div>
  );
}

function LegendItem({ color, label, n, p }: { color: string; label: string; n: number; p: number }) {
  return (
    <li className="flex items-center justify-between gap-2">
      <span className="flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />
        {label}
      </span>
      <span className="font-semibold text-foreground">{n} ({p}%)</span>
    </li>
  );
}

function DonutPorEstado({ resumen }: { resumen: Parameters<typeof DonutCumplimiento>[0]["resumen"] }) {
  const data = [
    { name: "En meta", value: resumen.verdes, color: COLOR.green },
    { name: "Alerta", value: resumen.amarillos, color: COLOR.amber },
    { name: "Crítico", value: resumen.rojos, color: COLOR.red },
    { name: "Sin medición", value: resumen.sinDato, color: COLOR.muted },
  ];
  const total = resumen.verdes + resumen.amarillos + resumen.rojos + resumen.sinDato;
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
        Indicadores por estado
      </p>
      <div className="mt-2 grid grid-cols-2 gap-2 items-center">
        <div className="relative h-40">
          <ResponsiveContainer>
            <PieChart>
              <Pie data={data} dataKey="value" innerRadius={44} outerRadius={64} stroke="none">
                {data.map((d) => (
                  <Cell key={d.name} fill={d.color} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-2xl font-extrabold text-foreground">{total}</span>
            <span className="text-[9px] uppercase text-muted-foreground">Total</span>
          </div>
        </div>
        <ul className="space-y-1.5 text-xs">
          {data.map((d) => (
            <li key={d.name} className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: d.color }} />
                {d.name}
              </span>
              <span className="font-semibold text-foreground">
                {d.value} ({total > 0 ? Math.round((d.value / total) * 100) : 0}%)
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function TendenciaCumplimientoChart({
  data,
}: {
  data: {
    periodo: string;
    cumplimiento: number | null;
    enMeta: number;
    alerta: number;
    critico: number;
    sinMedicion: number;
  }[];
}) {
  const conDatos = data.filter((d) => d.cumplimiento !== null);
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
        Tendencia de cumplimiento
      </p>
      <div className="mt-2 h-40">
        {conDatos.length < 2 ? (
          <p className="flex h-full items-center justify-center text-center text-[11px] italic text-muted-foreground">
            SIN TENDENCIA SUFICIENTE PARA EL PERIODO SELECCIONADO.
          </p>
        ) : (
          <ResponsiveContainer>
            <LineChart data={data} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={COLOR.border} />
              <XAxis
                dataKey="periodo"
                tickFormatter={(v) => v.slice(5)}
                tick={{ fontSize: 10, fill: COLOR.muted }}
              />
              <YAxis
                domain={[0, 100]}
                tick={{ fontSize: 10, fill: COLOR.muted }}
                tickFormatter={(v) => `${v}%`}
              />
              <Tooltip
                contentStyle={{
                  background: "hsl(var(--popover))",
                  border: "1px solid hsl(var(--border))",
                  fontSize: 12,
                }}
                formatter={(v: number) => [`${v}%`, "Cumplimiento"]}
                labelFormatter={(l) => formatearPeriodo(String(l))}
              />
              <Line
                type="monotone"
                dataKey="cumplimiento"
                stroke={COLOR.sky}
                strokeWidth={2}
                dot={{ r: 3 }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

function FiltrosPanel({
  filtros,
  setFiltros,
  areas,
  frecuencias,
  onClear,
  onClose,
}: {
  filtros: Filtros;
  setFiltros: (f: Filtros) => void;
  areas: string[];
  frecuencias: string[];
  onClear: () => void;
  onClose: () => void;
}) {
  const update = <K extends keyof Filtros>(k: K, v: Filtros[K]) =>
    setFiltros({ ...filtros, [k]: v });
  return (
    <div className="space-y-3">
      <p className="text-[11px] font-bold uppercase text-muted-foreground">Filtros</p>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-[10px] uppercase">Desde</Label>
          <Input type="date" value={filtros.fechaInicio} onChange={(e) => update("fechaInicio", e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label className="text-[10px] uppercase">Hasta</Label>
          <Input type="date" value={filtros.fechaFin} onChange={(e) => update("fechaFin", e.target.value)} />
        </div>
      </div>
      <div className="space-y-1">
        <Label className="text-[10px] uppercase">Área / responsable</Label>
        <select className={selectCls} value={filtros.area} onChange={(e) => update("area", e.target.value)}>
          <option value="">Todas</option>
          {areas.map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-[10px] uppercase">Estado</Label>
          <select
            className={selectCls}
            value={filtros.estado}
            onChange={(e) => update("estado", e.target.value as Filtros["estado"])}
          >
            <option value="">Todos</option>
            <option value="VERDE">En meta</option>
            <option value="AMARILLO">Alerta</option>
            <option value="ROJO">Crítico</option>
            <option value="GRIS">Sin medición</option>
          </select>
        </div>
        <div className="space-y-1">
          <Label className="text-[10px] uppercase">Tipo</Label>
          <select className={selectCls} value={filtros.tipo} onChange={(e) => update("tipo", e.target.value)}>
            <option value="">Todos</option>
            {TIPOS_INDICADOR.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="space-y-1">
        <Label className="text-[10px] uppercase">Frecuencia / fuente</Label>
        <select className={selectCls} value={filtros.frecuencia} onChange={(e) => update("frecuencia", e.target.value)}>
          <option value="">Todas</option>
          {frecuencias.map((f) => (
            <option key={f} value={f}>{f}</option>
          ))}
        </select>
      </div>
      <div className="flex justify-between pt-2">
        <Button type="button" variant="ghost" size="sm" onClick={onClear}>
          Limpiar filtros
        </Button>
        <Button type="button" size="sm" onClick={onClose}>
          Aplicar
        </Button>
      </div>
    </div>
  );
}

/**
 * DETALLE DEL PERIODO SELECCIONADO.
 * Trazabilidad completa: rango, corte, numerador, denominador, resultado,
 * meta, cumplimiento, estado, fuente y conciliación oficial vs. automática.
 */
function DetallePeriodoPanel({
  fila,
  ind,
}: {
  fila: PeriodoCanonico | null;
  ind: Indicador;
}) {
  if (!fila) {
    return (
      <div className="rounded-lg border border-dashed border-border/60 p-4 text-center text-xs italic text-muted-foreground">
        SIN REGISTRO PARA EL PERIODO SELECCIONADO.
      </div>
    );
  }

  const oficial = fila.variantes.find(
    (m) => m.tipo_medicion === "MANUAL_HISTORICA_IMPORTADA" || m.tipo_medicion === "MANUAL",
  );
  const automatica = fila.variantes.find(
    (m) => m.tipo_medicion === "AUTOMATICA" || m.tipo_medicion === "AUTOMATICA_CONCILIACION",
  );
  const diferencia =
    oficial?.resultado != null && automatica?.resultado != null
      ? Number(automatica.resultado) - Number(oficial.resultado)
      : null;
  const fmt = (v: number | null | undefined) =>
    v === null || v === undefined ? "NO APLICA" : String(v);

  return (
    <div className="rounded-lg border border-border/60 bg-muted/20 p-3 sm:p-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
          Detalle del periodo seleccionado — {formatearPeriodo(fila.periodo)}
        </p>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${pillCls[fila.semaforo]}`}>
          {fila.estadoDato === "NO_CALCULABLE" ? "NO CALCULABLE" : SEMAFORO_LABEL[fila.semaforo]}
        </span>
      </div>

      <div className="mb-2 grid grid-cols-1 gap-2 text-[11px] text-muted-foreground sm:grid-cols-3">
        <span>Rango: {fila.fechaInicio} → {fila.fechaFin}</span>
        <span>
          Corte del dato: {fila.fechaCorte}
          {fila.esParcial ? " (parcial, mes en curso)" : ""}
        </span>
        <span>Actualizado: {fila.updatedAt ? new Date(fila.updatedAt).toLocaleString("es-CO") : "NO APLICA"}</span>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div>
          <p className="text-[10px] uppercase text-muted-foreground">Numerador</p>
          <p className="text-lg font-semibold tabular-nums">{fmt(fila.numerador)}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase text-muted-foreground">Denominador</p>
          <p className="text-lg font-semibold tabular-nums">{fmt(fila.denominador)}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase text-muted-foreground">Resultado</p>
          <p className="text-lg font-semibold tabular-nums">
            {fila.resultado !== null ? `${fila.resultado} ${fila.unidad}` : "NO CALCULABLE"}
          </p>
        </div>
        <div>
          <p className="text-[10px] uppercase text-muted-foreground">Meta / Cumplimiento</p>
          <p className="text-sm font-medium tabular-nums">
            {fmtNum(fila.meta, fila.unidad)} ·{" "}
            {fila.cumplimiento !== null ? `${Math.round(fila.cumplimiento)}%` : "NO APLICA"}
          </p>
          <p className="text-[10px] text-muted-foreground">
            {esMenorEsMejor(ind) ? "Menor es mejor" : "Mayor es mejor"}
          </p>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
        <span>Fuente: {fila.fuente}</span>
        {fila.fuenteMedicion && <span>Origen: {fila.fuenteMedicion}</span>}
        {fila.duplicado && (
          <span className="text-status-amber">
            {fila.duplicadoNoResoluble
              ? "DUPLICIDAD NO RESOLUBLE · se muestra la versión de mayor precedencia"
              : `Se aplicó precedencia sobre ${fila.variantes.length} registros del periodo`}
          </span>
        )}
      </div>

      {oficial && automatica && (
        <div className="mt-3 rounded-md border border-border/60 bg-background/60 p-2 text-xs">
          <p className="mb-1 text-[10px] font-bold uppercase text-muted-foreground">
            Conciliación oficial vs. automática
          </p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <div>
              <span className="text-muted-foreground">Oficial: </span>
              <span className="font-semibold tabular-nums">
                {fmt(oficial.numerador_valor)}/{fmt(oficial.denominador_valor)} · {oficial.resultado} {fila.unidad}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground">Automática: </span>
              <span className="font-semibold tabular-nums">
                {fmt(automatica.numerador_valor)}/{fmt(automatica.denominador_valor)} · {automatica.resultado} {fila.unidad}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground">Diferencia: </span>
              <span
                className={`font-semibold tabular-nums ${
                  diferencia === null
                    ? ""
                    : Math.abs(diferencia) < 0.01
                      ? "text-status-green"
                      : "text-status-amber"
                }`}
              >
                {diferencia === null ? "—" : `${diferencia > 0 ? "+" : ""}${diferencia.toFixed(2)} ${fila.unidad}`}
              </span>
            </div>
          </div>
          <p className="mt-1 text-[10px] italic text-muted-foreground">
            La medición oficial no se reemplaza; la automática se conserva como conciliación paralela.
          </p>
        </div>
      )}

      {fila.notaMetodologica && (
        <p className="mt-2 text-[10px] italic text-muted-foreground">
          Nota metodológica: {fila.notaMetodologica}
        </p>
      )}
    </div>
  );
}


function IndicadorDetalleModal({

  open,
  onOpenChange,
  ind,
  historial,
  medActual,
  canEdit,
  isAdmin,
  onEdit,
  onArchive,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  ind: Indicador;
  historial: Medicion[];
  medActual: Medicion | undefined;
  canEdit: boolean;
  isAdmin: boolean;
  onEdit: () => void;
  onArchive: () => void;
}) {
  const sem = (medActual?.semaforo as Semaforo) || "GRIS";
  const cumpl = cumplimientoIndividual(ind, medActual);
  const { ancho } = avanceContraMeta(ind, medActual);
  const menorMejor = esMenorEsMejor(ind);
  const vals = historial.map((h) => Number(h.resultado)).filter((v) => !Number.isNaN(v));
  const last = vals.at(-1);
  const prev = vals.at(-2);
  const tendVariacion =
    last !== undefined && prev !== undefined && prev !== 0
      ? Math.round(((last - prev) / prev) * 100)
      : null;
  const mejora =
    tendVariacion === null
      ? null
      : menorMejor
        ? tendVariacion < 0
        : tendVariacion > 0;

  const [pagina, setPagina] = useState(1);
  const PAGE = 6;
  const historialDesc = useMemo(() => [...historial].reverse(), [historial]);
  const totalPag = Math.max(1, Math.ceil(historialDesc.length / PAGE));
  const pagRows = historialDesc.slice((pagina - 1) * PAGE, pagina * PAGE);

  const chartData = historial.map((h) => ({
    periodo: h.periodo ?? "",
    resultado: h.resultado ?? null,
    meta: h.meta ?? ind.meta ?? null,
    cumplimiento: cumplimientoIndividual(ind, h),
  }));

  const showOr = (v: string | number | null | undefined) =>
    v === null || v === undefined || String(v).trim() === "" ? (
      <span className="italic text-muted-foreground">NO CONFIGURADO</span>
    ) : (
      String(v)
    );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] min-w-0 flex-col gap-0 overflow-hidden p-0 sm:max-w-5xl">
        <DialogHeader className="shrink-0 border-b border-border/60 px-4 py-3 pr-10 text-left sm:px-6">
          <DialogTitle className="break-words text-base leading-snug">
            {ind.nombre}
          </DialogTitle>
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
            {ind.codigo || "Sin código"} · {ind.responsable || "Coordinación"}
            {medActual?.created_at
              ? ` · Última actualización: ${new Date(medActual.created_at).toLocaleString("es-CO")}`
              : ""}
          </p>
        </DialogHeader>

        <div className="min-w-0 flex-1 space-y-4 overflow-y-auto overflow-x-hidden px-4 py-4 scrollbar-invisible sm:px-6">
          {/* KPIs */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <KPI
              label="Cumplimiento actual"
              value={cumpl !== null ? `${Math.round(cumpl)}%` : "—"}
              caption={SEMAFORO_LABEL[sem]}
              tone={sem}
            />
            <KPI
              label="Meta"
              value={ind.meta != null ? `${ind.meta} ${ind.unidad || ""}` : "—"}
              caption={menorMejor ? "Máximo permitido" : "Objetivo mínimo"}
            />
            <KPI
              label="Resultado"
              value={
                medActual?.resultado !== null && medActual?.resultado !== undefined
                  ? `${medActual.resultado} ${medActual.unidad || ind.unidad || ""}`
                  : "SIN DATOS"
              }
              caption={medActual?.periodo ? formatearPeriodo(medActual.periodo) : "Sin periodo"}
            />
            <KPI
              label="Tendencia"
              value={
                tendVariacion === null
                  ? "Sin cambio"
                  : `${tendVariacion > 0 ? "+" : ""}${tendVariacion}%`
              }
              caption={mejora === null ? "Sin comparativo" : mejora ? "Mejora" : "Por revisar"}
              icon={
                mejora === null ? (
                  <Minus className="h-4 w-4" />
                ) : mejora ? (
                  <TrendingUp className="h-4 w-4 text-status-green" />
                ) : (
                  <TrendingDown className="h-4 w-4 text-status-red" />
                )
              }
            />
          </div>

          {/* Numerador / Denominador + conciliación oficial vs automático */}
          <NumDenPanel historial={historial} medActual={medActual} ind={ind} />



          {/* Avance vs meta */}
          <div className="rounded-2xl border border-border bg-card p-3">
            <div className="mb-1 flex items-center justify-between text-[11px] uppercase text-muted-foreground">
              <span>Avance contra meta</span>
              <span>{cumpl !== null ? `${Math.round(cumpl)}%` : "—"}</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary" style={{ width: `${ancho}%` }} />
            </div>
            {cumpl !== null && cumpl > 100 && (
              <p className="mt-1 text-[11px] text-status-green">
                RESULTADO {Math.round(cumpl - 100)}% MEJOR QUE LA META
              </p>
            )}
          </div>

          {/* Gráficas */}
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <div className="rounded-2xl border border-border bg-card p-3">
              <p className="mb-1 text-[10px] font-bold uppercase text-muted-foreground">
                Evolución del cumplimiento
              </p>
              <div className="h-56">
                {chartData.filter((c) => c.cumplimiento !== null).length < 2 ? (
                  <p className="flex h-full items-center justify-center text-center text-[11px] italic text-muted-foreground">
                    SIN TENDENCIA SUFICIENTE PARA EL PERIODO SELECCIONADO.
                  </p>
                ) : (
                  <ResponsiveContainer>
                    <LineChart data={chartData} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={COLOR.border} />
                      <XAxis dataKey="periodo" tickFormatter={(v) => v.slice(5)} tick={{ fontSize: 10, fill: COLOR.muted }} />
                      <YAxis tick={{ fontSize: 10, fill: COLOR.muted }} tickFormatter={(v) => `${v}%`} />
                      <Tooltip
                        contentStyle={{
                          background: "hsl(var(--popover))",
                          border: "1px solid hsl(var(--border))",
                          fontSize: 12,
                        }}
                        formatter={(v: number, name: string) => [
                          name === "cumplimiento" ? `${Math.round(Number(v))}%` : v,
                          name,
                        ]}
                        labelFormatter={(l) => formatearPeriodo(String(l))}
                      />
                      <Line type="monotone" dataKey="cumplimiento" stroke={COLOR.sky} strokeWidth={2} dot={{ r: 3 }} />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
            <div className="rounded-2xl border border-border bg-card p-3">
              <p className="mb-1 text-[10px] font-bold uppercase text-muted-foreground">
                Resultado vs meta
              </p>
              <div className="h-56">
                {chartData.length === 0 ? (
                  <p className="flex h-full items-center justify-center text-center text-[11px] italic text-muted-foreground">
                    Sin mediciones registradas.
                  </p>
                ) : (
                  <ResponsiveContainer>
                    <BarChart data={chartData} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={COLOR.border} />
                      <XAxis dataKey="periodo" tickFormatter={(v) => v.slice(5)} tick={{ fontSize: 10, fill: COLOR.muted }} />
                      <YAxis tick={{ fontSize: 10, fill: COLOR.muted }} />
                      <Tooltip
                        contentStyle={{
                          background: "hsl(var(--popover))",
                          border: "1px solid hsl(var(--border))",
                          fontSize: 12,
                        }}
                        labelFormatter={(l) => formatearPeriodo(String(l))}
                      />
                      <Bar dataKey="resultado" radius={[4, 4, 0, 0]}>
                        {chartData.map((c, i) => {
                          const s = calcularSemaforo(c.resultado ?? null, c.meta ?? null, ind.sentido);
                          const color =
                            s === "VERDE" ? COLOR.green : s === "AMARILLO" ? COLOR.amber : s === "ROJO" ? COLOR.red : COLOR.muted;
                          return <Cell key={i} fill={color} />;
                        })}
                      </Bar>
                      {ind.meta != null && (
                        <ReferenceLine
                          y={ind.meta}
                          stroke={COLOR.sky}
                          strokeDasharray="4 4"
                          label={{ value: `Meta ${ind.meta}`, fill: COLOR.sky, fontSize: 10, position: "insideTopRight" }}
                        />
                      )}
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          </div>

          {/* Detalle técnico */}
          <div className="rounded-2xl border border-border bg-card p-3">
            <p className="mb-2 text-[10px] font-bold uppercase text-muted-foreground">Detalle del indicador</p>
            <dl className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
              <Field label="Numerador">{showOr(ind.numerador)}</Field>
              <Field label="Denominador">{showOr(ind.denominador)}</Field>
              <Field label="Fórmula">{showOr(ind.tipo)}</Field>
              <Field label="Unidad">{showOr(ind.unidad)}</Field>
              <Field label="Frecuencia / fuente">{showOr(ind.fuente)}</Field>
              <Field label="Responsable">{showOr(ind.responsable)}</Field>
              <Field label="Tipo de evaluación">{menorMejor ? "MENOR ES MEJOR" : "MAYOR ES MEJOR"}</Field>
              <Field label="Descripción">{showOr(ind.descripcion)}</Field>
            </dl>
          </div>

          {/* Historial */}
          <div className="rounded-2xl border border-border bg-card p-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[10px] font-bold uppercase text-muted-foreground">Historial de resultados</p>
              {totalPag > 1 && (
                <div className="flex items-center gap-1 text-[11px]">
                  <Button size="sm" variant="ghost" onClick={() => setPagina(Math.max(1, pagina - 1))} disabled={pagina === 1}>
                    ‹
                  </Button>
                  <span>{pagina} / {totalPag}</span>
                  <Button size="sm" variant="ghost" onClick={() => setPagina(Math.min(totalPag, pagina + 1))} disabled={pagina === totalPag}>
                    ›
                  </Button>
                </div>
              )}
            </div>
            {historial.length === 0 ? (
              <p className="py-4 text-center text-xs italic text-muted-foreground">Sin mediciones registradas.</p>
            ) : (
              <div className="overflow-x-auto scrollbar-invisible">
                <table className="w-full min-w-[520px] text-xs">
                  <thead>
                    <tr className="border-b border-border/60 text-left uppercase text-muted-foreground">
                      <th className="py-1.5 pr-2">Periodo</th>
                      <th className="py-1.5 pr-2">Resultado</th>
                      <th className="py-1.5 pr-2">Meta</th>
                      <th className="py-1.5 pr-2">Cumplimiento</th>
                      <th className="py-1.5 pr-2">Estado</th>
                      <th className="py-1.5 pr-2">Registro</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagRows.map((m) => {
                      const c = cumplimientoIndividual(ind, m);
                      const s = (m.semaforo as Semaforo) || "GRIS";
                      return (
                        <tr key={m.id} className="border-b border-border/40">
                          <td className="py-1.5 pr-2">{m.periodo ? formatearPeriodo(m.periodo) : "—"}</td>
                          <td className="py-1.5 pr-2 font-semibold">{m.resultado ?? "—"} {m.unidad || ""}</td>
                          <td className="py-1.5 pr-2">{m.meta ?? ind.meta ?? "—"}</td>
                          <td className="py-1.5 pr-2">{c !== null ? `${Math.round(c)}%` : "—"}</td>
                          <td className="py-1.5 pr-2">
                            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${pillCls[s]}`}>
                              {SEMAFORO_LABEL[s]}
                            </span>
                          </td>
                          <td className="py-1.5 pr-2 text-muted-foreground">
                            {m.created_at ? new Date(m.created_at).toLocaleDateString("es-CO") : "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="shrink-0 border-t border-border/60 px-4 py-3 sm:px-6">
          {canEdit && (
            <>
              <Button variant="outline" size="sm" onClick={onEdit}>
                <Pencil className="mr-1 h-3.5 w-3.5" /> Editar
              </Button>
              {isAdmin && (
                <Button
                  variant="outline"
                  size="sm"
                  className="text-status-red hover:text-status-red"
                  onClick={onArchive}
                >
                  <Archive className="mr-1 h-3.5 w-3.5" /> Archivar
                </Button>
              )}
            </>
          )}
          <Button size="sm" onClick={() => onOpenChange(false)}>
            <XIcon className="mr-1 h-3.5 w-3.5" /> Cerrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function KPI({
  label,
  value,
  caption,
  tone,
  icon,
}: {
  label: string;
  value: React.ReactNode;
  caption?: string;
  tone?: Semaforo;
  icon?: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-3">
      <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-extrabold text-foreground">{value}</p>
      <p className={`mt-0.5 flex items-center gap-1 text-[11px] ${tone ? "" : "text-muted-foreground"}`}>
        {icon}
        {tone ? (
          <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${pillCls[tone]}`}>
            {caption ?? SEMAFORO_LABEL[tone]}
          </span>
        ) : (
          caption
        )}
      </p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-border/60 bg-background/40 px-2.5 py-1.5">
      <dt className="text-[10px] font-bold uppercase text-muted-foreground">{label}</dt>
      <dd className="text-foreground">{children}</dd>
    </div>
  );
}

function IndicadorFormDialog({
  open,
  onOpenChange,
  editing,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: Indicador | null;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{editing ? "Editar indicador" : "Nuevo indicador"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Nombre del indicador</Label>
            <Input name="nombre" defaultValue={editing?.nombre ?? ""} required />
          </div>
          <div className="space-y-1.5">
            <Label>Código</Label>
            <Input name="codigo" defaultValue={editing?.codigo ?? ""} placeholder="IND-XXX-000" />
          </div>
          <div className="space-y-1.5">
            <Label>Tipo</Label>
            <select name="tipo" className={selectCls} defaultValue={editing?.tipo ?? "PROPORCION"}>
              {TIPOS_INDICADOR.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Descripción</Label>
            <Textarea name="descripcion" rows={2} defaultValue={editing?.descripcion ?? ""} />
          </div>
          <div className="space-y-1.5">
            <Label>Numerador</Label>
            <Input name="numerador" defaultValue={editing?.numerador ?? ""} placeholder="Qué se cuenta" />
          </div>
          <div className="space-y-1.5">
            <Label>Denominador</Label>
            <Input name="denominador" defaultValue={editing?.denominador ?? ""} placeholder="Base de medición" />
          </div>
          <div className="space-y-1.5">
            <Label>Meta</Label>
            <Input name="meta" type="number" step="any" defaultValue={editing?.meta ?? ""} />
          </div>
          <div className="space-y-1.5">
            <Label>Unidad</Label>
            <select name="unidad" className={selectCls} defaultValue={editing?.unidad ?? "%"}>
              {UNIDADES_INDICADOR.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>Sentido</Label>
            <select name="sentido" className={selectCls} defaultValue={editing?.sentido ?? "MAYOR_ES_MEJOR"}>
              {SENTIDOS_INDICADOR.map((s) => (
                <option key={s} value={s}>
                  {s === "MAYOR_ES_MEJOR" ? "Mayor es mejor" : "Menor es mejor"}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>Estado</Label>
            <select name="activo" className={selectCls} defaultValue={editing?.activo === false ? "NO" : "SI"}>
              <option value="SI">Activo</option>
              <option value="NO">Inactivo</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>Responsable</Label>
            <Input name="responsable" defaultValue={editing?.responsable ?? "Coordinación de referencia"} />
          </div>
          <div className="space-y-1.5">
            <Label>Fuente</Label>
            <Input name="fuente" defaultValue={editing?.fuente ?? "Bitácora operativa"} />
          </div>
          <DialogFooter className="sm:col-span-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit">{editing ? "Guardar cambios" : "Guardar indicador"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
