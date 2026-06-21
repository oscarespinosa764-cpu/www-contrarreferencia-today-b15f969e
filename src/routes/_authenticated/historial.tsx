import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/backend-client";
import { useAuth } from "@/lib/auth";
import { AppHeader } from "@/components/app-header";
import { Panel } from "@/components/stat-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Search,
  FileSpreadsheet,
  MessageSquare,
  Hospital,
  ArrowDownLeft,
  ArrowUpRight,
  Ambulance,
  Filter,
  CalendarDays,
  ChevronDown,
  Copy,
  X,
  Check,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/historial")({
  component: HistorialPage,
});

type Vista = "entrantes" | "salientes";

type Caso = {
  id: string;
  codigo: string | null;
  tipo: string | null;
  cod_ref: string | null;
  documento: string | null;
  nombres: string | null;
  apellidos: string | null;
  ips: string | null;
  unidad: string | null;
  especialidad: string | null;
  estado: string | null;
  fecha: string | null;
  fecha_vence: string | null;
  texto_ia: string | null;
  created_at: string;
};

type Remision = {
  id: string;
  codigo_radicacion: string | null;
  documento: string | null;
  paciente: string | null;
  servicio: string | null;
  ips_receptora: string | null;
  asegurador: string | null;
  prioridad: string | null;
  estado: string | null;
  fecha_radicado: string | null;
  texto_ia: string | null;
  created_at: string;
};

type Grupo = {
  key: string;
  base: Caso;
  eventos: Caso[];
  estadoFinal: { label: string; color: StatusColor };
  activa: boolean;
  confirmable: boolean;
};

type StatusColor = "green" | "red" | "amber" | "sky";

const TIPO_FILTERS = ["TODOS", "ACEP", "NEG", "AMP", "CAN", "ING"] as const;
type TipoFilter = (typeof TIPO_FILTERS)[number];

const TIPO_LABEL: Record<TipoFilter, string> = {
  TODOS: "Todos los casos",
  ACEP: "Aceptación",
  NEG: "Negación",
  AMP: "Ampliación",
  CAN: "Cancelación",
  ING: "Ingresos",
};

const SAL_FILTERS = ["TODOS", "PENDIENTE", "ACEPTADA", "COORDINADA", "DESISTIDA"] as const;
type SalFilter = (typeof SAL_FILTERS)[number];

const SAL_LABEL: Record<SalFilter, string> = {
  TODOS: "Todos los casos",
  PENDIENTE: "Pendiente",
  ACEPTADA: "Aceptada",
  COORDINADA: "Coordinada",
  DESISTIDA: "Desistida",
};

const PERIODOS = ["Todos", "Hoy", "Esta semana", "Este mes", "Mes anterior"] as const;
type Periodo = (typeof PERIODOS)[number];

const tipoChip: Record<string, string> = {
  ACEP: "bg-status-teal/15 text-status-teal border-status-teal/40",
  NEG: "bg-status-red/15 text-status-red border-status-red/40",
  CAN: "bg-status-amber/15 text-status-amber border-status-amber/40",
  ING: "bg-status-green/15 text-status-green border-status-green/40",
  AMP: "bg-status-sky/15 text-status-sky border-status-sky/40",
};

const statusBadge: Record<StatusColor, string> = {
  green: "bg-status-green/15 text-status-green",
  red: "bg-status-red/15 text-status-red",
  amber: "bg-status-amber/15 text-status-amber",
  sky: "bg-status-sky/15 text-status-sky",
};

const cardBorder: Record<StatusColor, string> = {
  green: "border-l-status-green",
  red: "border-l-status-red",
  amber: "border-l-status-amber",
  sky: "border-l-status-sky",
};

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function fmtFecha(raw: string | null | undefined, fallback?: string | null): string {
  if (!raw) return fallback ?? "";
  const d = new Date(raw);
  if (isNaN(d.getTime())) return fallback ?? "";
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function mismoDia(raw: string | null, day: Date): boolean {
  if (!raw) return false;
  const d = new Date(raw);
  if (isNaN(d.getTime())) return false;
  return (
    d.getFullYear() === day.getFullYear() &&
    d.getMonth() === day.getMonth() &&
    d.getDate() === day.getDate()
  );
}

function dentroPeriodo(raw: string | null, periodo: Periodo): boolean {
  if (periodo === "Todos") return true;
  if (!raw) return false;
  const d = new Date(raw);
  if (isNaN(d.getTime())) return false;
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (periodo === "Hoy") return d >= startToday;
  if (periodo === "Esta semana") {
    const ws = new Date(startToday);
    ws.setDate(ws.getDate() - ((ws.getDay() + 6) % 7));
    return d >= ws;
  }
  if (periodo === "Este mes") return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  if (periodo === "Mes anterior") {
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return d.getFullYear() === prev.getFullYear() && d.getMonth() === prev.getMonth();
  }
  return true;
}

function tieneTipo(eventos: Caso[], tipo: string): boolean {
  return eventos.some((e) => (e.tipo || "").toUpperCase().includes(tipo));
}

function calcularEstado(base: Caso, eventos: Caso[]): { estadoFinal: Grupo["estadoFinal"]; activa: boolean } {
  const est = (base.estado || "").toUpperCase();
  const baseTipo = (base.tipo || "").toUpperCase();
  const hasIng = tieneTipo(eventos, "ING") || est.includes("INGRESAD");
  const hasCan = tieneTipo(eventos, "CAN") || est.includes("CANCELAD");
  if (baseTipo.includes("NEG")) return { estadoFinal: { label: "CERRADA — NO ACEPTADA", color: "red" }, activa: false };
  if (hasIng) return { estadoFinal: { label: "CERRADA — INGRESÓ", color: "green" }, activa: false };
  if (hasCan) return { estadoFinal: { label: "CERRADA — CANCELADA", color: "red" }, activa: false };
  if (est.includes("CERRAD")) return { estadoFinal: { label: "CERRADA", color: "red" }, activa: false };
  return { estadoFinal: { label: "ACTIVA", color: "green" }, activa: true };
}

/** Activa => confirmable. Cancelada/vencida en las últimas 24h => confirmable. Ingresada/NEG => no. */
function esConfirmable(base: Caso, eventos: Caso[], activa: boolean): boolean {
  const baseTipo = (base.tipo || "").toUpperCase();
  if (baseTipo.includes("NEG")) return false;
  if (tieneTipo(eventos, "ING") || (base.estado || "").toUpperCase().includes("INGRESAD")) return false;
  if (activa) return true;
  const ahora = Date.now();
  const dia = 24 * 3600 * 1000;
  const canEvents = eventos
    .filter((e) => (e.tipo || "").toUpperCase().includes("CAN"))
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  if (canEvents[0]) {
    const t = new Date(canEvents[0].created_at).getTime();
    if (!isNaN(t) && ahora - t <= dia) return true;
  }
  if (base.fecha_vence) {
    const venceT = new Date(base.fecha_vence).getTime();
    if (!isNaN(venceT) && ahora >= venceT && ahora - venceT <= dia) return true;
  }
  return false;
}

function estadoSaliente(estado: string | null): { label: string; color: StatusColor } {
  const e = (estado || "").toUpperCase();
  if (e.includes("DESIST")) return { label: "DESISTIDA", color: "red" };
  if (e.includes("CANCELAD")) return { label: "CANCELADA", color: "red" };
  if (e.includes("COORDINAD")) return { label: "AMBULANCIA COORDINADA", color: "green" };
  if (e.includes("ACEPTAD")) return { label: "ACEPTADA", color: "green" };
  if (e.includes("PENDIENTE")) return { label: "PENDIENTE ACEPTACIÓN", color: "amber" };
  if (!e) return { label: "EN GESTIÓN", color: "sky" };
  return { label: e, color: "sky" };
}

type IngresoDatos = {
  transporte: string;
  placa: string;
  profesional: string;
  cargo: string;
  observaciones: string;
};

type MensajeItem = {
  id: string;
  documento: string;
  nombre: string;
  ips: string;
  estado: string;
  color: StatusColor;
  fecha: string;
  mensaje: string;
};

function HistorialPage() {
  const { canEdit } = useAuth();
  const qc = useQueryClient();
  const [vista, setVista] = useState<Vista>("entrantes");
  const [q, setQ] = useState("");
  const [tipo, setTipo] = useState<TipoFilter>("TODOS");
  const [salTipo, setSalTipo] = useState<SalFilter>("TODOS");
  const [periodo, setPeriodo] = useState<Periodo>("Todos");
  const [fechaEspecifica, setFechaEspecifica] = useState<Date | undefined>(undefined);
  const [ingresoFor, setIngresoFor] = useState<Grupo | null>(null);

  const { data: casos, isLoading } = useQuery({
    queryKey: ["historial-casos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("casos_entrantes")
        .select(
          "id, codigo, tipo, cod_ref, documento, nombres, apellidos, ips, unidad, especialidad, estado, fecha, fecha_vence, texto_ia, created_at",
        )
        .order("created_at", { ascending: false })
        .limit(1000);
      if (error) throw error;
      return data as Caso[];
    },
  });

  const { data: remisiones, isLoading: loadingSal } = useQuery({
    queryKey: ["historial-remisiones"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("remisiones")
        .select(
          "id, codigo_radicacion, documento, paciente, servicio, ips_receptora, asegurador, prioridad, estado, fecha_radicado, texto_ia, created_at",
        )
        .order("created_at", { ascending: false })
        .limit(1000);
      if (error) throw error;
      return data as Remision[];
    },
  });

  const grupos = useMemo<Grupo[]>(() => {
    const map = new Map<string, Caso[]>();
    for (const c of casos ?? []) {
      const key = (c.cod_ref || c.codigo || c.id).toUpperCase();
      const arr = map.get(key) ?? [];
      arr.push(c);
      map.set(key, arr);
    }
    const out: Grupo[] = [];
    for (const [key, eventos] of map) {
      eventos.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      const base = eventos.find((e) => !e.cod_ref) ?? eventos[0];
      const { estadoFinal, activa } = calcularEstado(base, eventos);
      const confirmable = esConfirmable(base, eventos, activa);
      out.push({ key, base, eventos, estadoFinal, activa, confirmable });
    }
    out.sort((a, b) => new Date(b.base.created_at).getTime() - new Date(a.base.created_at).getTime());
    return out;
  }, [casos]);

  const term = q.trim().toLowerCase();

  const pasaPeriodo = (raw: string | null) =>
    fechaEspecifica ? mismoDia(raw, fechaEspecifica) : dentroPeriodo(raw, periodo);

  const gruposF = useMemo(
    () =>
      grupos.filter((g) => {
        if (tipo !== "TODOS" && !tieneTipo(g.eventos, tipo)) return false;
        if (!pasaPeriodo(g.base.fecha || g.base.created_at)) return false;
        if (!term) return true;
        const hay = g.eventos
          .map((e) => `${e.codigo ?? ""} ${e.documento ?? ""} ${e.nombres ?? ""} ${e.apellidos ?? ""} ${e.ips ?? ""}`)
          .join(" ")
          .toLowerCase();
        return hay.includes(term);
      }),
    [grupos, tipo, periodo, fechaEspecifica, term],
  );

  const remisionesF = useMemo(
    () =>
      (remisiones ?? []).filter((r) => {
        if (salTipo !== "TODOS" && !(r.estado || "").toUpperCase().includes(salTipo)) return false;
        if (!pasaPeriodo(r.fecha_radicado || r.created_at)) return false;
        if (!term) return true;
        const hay = `${r.codigo_radicacion ?? ""} ${r.documento ?? ""} ${r.paciente ?? ""} ${r.ips_receptora ?? ""} ${r.servicio ?? ""}`.toLowerCase();
        return hay.includes(term);
      }),
    [remisiones, salTipo, periodo, fechaEspecifica, term],
  );

  // Mensajes recientes (últimos con gestión / texto generado)
  const mensajes = useMemo<MensajeItem[]>(() => {
    if (vista === "entrantes") {
      return (casos ?? [])
        .filter((c) => (c.texto_ia || "").trim().length > 0)
        .slice(0, 20)
        .map((c) => {
          const { estadoFinal } = calcularEstado(c, [c]);
          return {
            id: c.id,
            documento: c.documento || "—",
            nombre: [c.nombres, c.apellidos].filter(Boolean).join(" ") || "Sin nombre",
            ips: c.ips || "",
            estado: (c.tipo || estadoFinal.label).toUpperCase(),
            color: estadoFinal.color,
            fecha: fmtFecha(c.created_at, c.fecha),
            mensaje: c.texto_ia || "",
          };
        });
    }
    return (remisiones ?? [])
      .filter((r) => (r.texto_ia || "").trim().length > 0)
      .slice(0, 20)
      .map((r) => {
        const est = estadoSaliente(r.estado);
        return {
          id: r.id,
          documento: r.documento || "—",
          nombre: r.paciente || "Sin nombre",
          ips: r.ips_receptora || "",
          estado: est.label,
          color: est.color,
          fecha: fmtFecha(r.created_at, r.fecha_radicado),
          mensaje: r.texto_ia || "",
        };
      });
  }, [vista, casos, remisiones]);

  const periodoLabel = fechaEspecifica
    ? `${pad(fechaEspecifica.getDate())}/${pad(fechaEspecifica.getMonth() + 1)}/${fechaEspecifica.getFullYear()}`
    : periodo;

  const filtroCasoLabel = vista === "entrantes" ? TIPO_LABEL[tipo] : SAL_LABEL[salTipo];

  const handleConfirmarIngreso = async (g: Grupo, datos: IngresoDatos) => {
    const base = g.base;
    const { data: u } = await supabase.auth.getUser();
    const ahora = new Date();
    const detalle = [
      "CONFIRMACIÓN DE INGRESO",
      `Transporta: ${datos.transporte || "—"}`,
      `Placa: ${datos.placa || "—"}`,
      `Profesional: ${datos.profesional || "—"} (${datos.cargo || "—"})`,
      `Fecha/Hora: ${fmtFecha(ahora.toISOString())}`,
      datos.observaciones ? `Observaciones: ${datos.observaciones}` : "",
    ]
      .filter(Boolean)
      .join("\n");
    const { error } = await supabase.from("casos_entrantes").insert({
      tipo: "ING",
      estado: "INGRESADO",
      cod_ref: base.codigo,
      documento: base.documento,
      nombres: base.nombres,
      apellidos: base.apellidos,
      ips: base.ips,
      unidad: base.unidad,
      especialidad: base.especialidad,
      fecha: ahora.toISOString().slice(0, 10),
      detalle,
      created_by: u.user?.id,
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    if (base.codigo) {
      await supabase.from("casos_entrantes").update({ estado: "INGRESADO" }).eq("codigo", base.codigo);
    }
    // Si el ingreso se confirma cuando el caso ya estaba cerrado (cancelado o vencido,
    // dentro de la ventana de 24h), se genera una alerta en Coordinación para la visita IPS.
    if (!g.activa) {
      const paciente = [base.nombres, base.apellidos].filter(Boolean).join(" ") || null;
      const { error: alertaErr } = await supabase.from("coordinacion").insert({
        tipo: "VISITA IPS",
        estado: "ABIERTA",
        caso_id: base.id,
        paciente,
        documento: base.documento,
        detalle:
          `Ingreso confirmado fuera de tiempo (ventana de 24h) para el caso ${base.codigo ?? "—"}. ` +
          `Programar visita IPS a ${base.ips || "—"}. ` +
          `Recibe: ${datos.profesional || "—"}${datos.cargo ? ` (${datos.cargo})` : ""}.`,
        fecha_alerta: ahora.toISOString(),
        created_by: u.user?.id,
      });
      if (alertaErr) {
        toast.error(`Ingreso confirmado, pero no se pudo crear la alerta: ${alertaErr.message}`);
      } else {
        toast.success("Ingreso confirmado · alerta de visita IPS enviada a Coordinación");
        setIngresoFor(null);
        qc.invalidateQueries({ queryKey: ["historial-casos"] });
        qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
        qc.invalidateQueries({ queryKey: ["coordinacion-alertas"] });
        return;
      }
    }
    toast.success("Ingreso confirmado");
    setIngresoFor(null);
    qc.invalidateQueries({ queryKey: ["historial-casos"] });
    qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
  };

  const exportarExcel = () => {
    const rows =
      vista === "entrantes"
        ? gruposF.flatMap((g) =>
            g.eventos.map((e) => ({
              Codigo: e.codigo ?? "",
              Tipo: e.tipo ?? "",
              Documento: e.documento ?? "",
              Paciente: [e.nombres, e.apellidos].filter(Boolean).join(" "),
              IPS: e.ips ?? "",
              Unidad: e.unidad ?? "",
              Estado: g.estadoFinal.label,
              Fecha: fmtFecha(e.created_at, e.fecha),
            })),
          )
        : remisionesF.map((r) => ({
            Radicado: r.codigo_radicacion ?? "",
            Documento: r.documento ?? "",
            Paciente: r.paciente ?? "",
            Servicio: r.servicio ?? "",
            IPS_Receptora: r.ips_receptora ?? "",
            Asegurador: r.asegurador ?? "",
            Estado: estadoSaliente(r.estado).label,
            Fecha: fmtFecha(r.created_at, r.fecha_radicado),
          }));
    if (rows.length === 0) {
      toast.info("No hay registros para exportar.");
      return;
    }
    const headers = Object.keys(rows[0]);
    const csv = [
      headers.join(","),
      ...rows.map((r) =>
        headers.map((h) => `"${String((r as Record<string, string>)[h]).replace(/"/g, '""')}"`).join(","),
      ),
    ].join("\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `historial_${vista}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };

  const cargando = vista === "entrantes" ? isLoading : loadingSal;
  const vacio = vista === "entrantes" ? gruposF.length === 0 : remisionesF.length === 0;

  const setQuickPeriodo = (p: Periodo) => {
    setPeriodo(p);
    setFechaEspecifica(undefined);
  };

  return (
    <div>
      <AppHeader title="Referencia y Contrarreferencia" subtitle="Control de Casos Entrantes y Salientes" />

      <Panel bodyMaxHeight={null}>
        {/* Selector de vista: Entrantes / Salientes */}
        <div className="mb-3 flex items-center justify-center">
          <div className="inline-flex rounded-full border border-border bg-muted/40 p-1">
            <button
              onClick={() => setVista("entrantes")}
              className={`inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-bold uppercase tracking-wide transition ${
                vista === "entrantes" ? "bg-status-green text-white shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <ArrowDownLeft className="h-3.5 w-3.5" /> Entrantes
            </button>
            <button
              onClick={() => setVista("salientes")}
              className={`inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-bold uppercase tracking-wide transition ${
                vista === "salientes" ? "bg-status-teal text-white shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <ArrowUpRight className="h-3.5 w-3.5" /> Salientes
            </button>
          </div>
        </div>

        {/* Encabezado: título + barra compacta de filtros + Excel */}
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-extrabold uppercase tracking-wide text-foreground">
            {vista === "entrantes" ? "HISTORIAL DE REMISIONES ENTRANTES" : "HISTORIAL DE REMISIONES SALIENTES"}
          </h2>
          <div className="flex flex-wrap items-center gap-1.5">
            {/* Filtro por caso */}
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 rounded-full text-[11px] font-semibold">
                  <Filter className="mr-1.5 h-3.5 w-3.5" />
                  {filtroCasoLabel}
                  <ChevronDown className="ml-1 h-3.5 w-3.5 opacity-70" />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-52 p-1.5">
                <p className="px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                  Filtrar por caso
                </p>
                {vista === "entrantes"
                  ? TIPO_FILTERS.map((t) => (
                      <button
                        key={t}
                        onClick={() => setTipo(t)}
                        className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-xs font-medium transition hover:bg-muted ${
                          tipo === t ? "text-primary" : "text-foreground"
                        }`}
                      >
                        {TIPO_LABEL[t]}
                        {tipo === t && <Check className="h-3.5 w-3.5" />}
                      </button>
                    ))
                  : SAL_FILTERS.map((t) => (
                      <button
                        key={t}
                        onClick={() => setSalTipo(t)}
                        className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-xs font-medium transition hover:bg-muted ${
                          salTipo === t ? "text-primary" : "text-foreground"
                        }`}
                      >
                        {SAL_LABEL[t]}
                        {salTipo === t && <Check className="h-3.5 w-3.5" />}
                      </button>
                    ))}
              </PopoverContent>
            </Popover>

            {/* Filtro por período + calendario */}
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 rounded-full text-[11px] font-semibold">
                  <CalendarDays className="mr-1.5 h-3.5 w-3.5" />
                  {periodoLabel}
                  <ChevronDown className="ml-1 h-3.5 w-3.5 opacity-70" />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-auto p-2">
                <p className="px-1 pb-1.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                  Período
                </p>
                <div className="flex flex-wrap gap-1">
                  {PERIODOS.map((p) => (
                    <button
                      key={p}
                      onClick={() => setQuickPeriodo(p)}
                      className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition ${
                        !fechaEspecifica && periodo === p
                          ? "border-primary bg-primary/15 text-primary"
                          : "border-border bg-card text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
                <div className="mt-2 border-t pt-1">
                  <p className="px-1 py-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                    O elige una fecha
                  </p>
                  <Calendar
                    mode="single"
                    selected={fechaEspecifica}
                    onSelect={(d) => {
                      setFechaEspecifica(d ?? undefined);
                      if (d) setPeriodo("Todos");
                    }}
                    captionLayout="dropdown"
                  />
                </div>
              </PopoverContent>
            </Popover>

            {/* Mensajes recientes */}
            <MensajesRecientesButton vista={vista} mensajes={mensajes} />

            <Button
              size="sm"
              className="h-8 rounded-full bg-status-green text-white hover:bg-status-green/90"
              onClick={exportarExcel}
            >
              <FileSpreadsheet className="mr-1.5 h-4 w-4" /> Excel
            </Button>
          </div>
        </div>

        {/* Búsqueda */}
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="rounded-lg pl-9"
            placeholder={
              vista === "entrantes" ? "Buscar por número de documento…" : "Buscar por documento, radicado o IPS receptora…"
            }
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>

        {/* Lista */}
        {cargando ? (
          <p className="py-10 text-center text-sm text-muted-foreground">Cargando…</p>
        ) : vacio ? (
          <div className="rounded-2xl border border-border bg-card py-16 text-center shadow-sm">
            <p className="text-3xl text-muted-foreground">🔍</p>
            <p className="mt-2 text-sm font-semibold text-foreground">Sin coincidencias</p>
            <p className="text-xs text-muted-foreground">Prueba con otros términos o limpia los filtros</p>
          </div>
        ) : vista === "entrantes" ? (
          <div className="grid gap-2">
            {gruposF.map((g) => (
              <CasoCard key={g.key} grupo={g} canEdit={canEdit} onConfirmar={() => setIngresoFor(g)} />
            ))}
          </div>
        ) : (
          <div className="grid gap-2">
            {remisionesF.map((r) => (
              <RemisionCard key={r.id} remision={r} />
            ))}
          </div>
        )}
      </Panel>

      <IngresoDialog
        grupo={ingresoFor}
        onClose={() => setIngresoFor(null)}
        onConfirmar={handleConfirmarIngreso}
      />
    </div>
  );
}

function MensajesRecientesButton({ vista, mensajes }: { vista: Vista; mensajes: MensajeItem[] }) {
  const [abierto, setAbierto] = useState<string | null>(null);

  const copiar = async (texto: string) => {
    try {
      await navigator.clipboard.writeText(texto);
      toast.success("Mensaje copiado");
    } catch {
      toast.error("No se pudo copiar");
    }
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-8 rounded-full border-status-teal/40 bg-status-teal/10 text-[11px] font-semibold text-status-teal hover:bg-status-teal/20"
        >
          <MessageSquare className="mr-1.5 h-3.5 w-3.5" /> Mensajes recientes
          <ChevronDown className="ml-1 h-3.5 w-3.5 opacity-70" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[22rem] p-0">
        <div className="border-b px-3 py-2">
          <p className="text-xs font-bold uppercase tracking-wide text-foreground">
            Últimos mensajes {vista === "entrantes" ? "de gestión" : "de remisión"}
          </p>
          <p className="text-[10px] text-muted-foreground">
            Recupera el mensaje en caso de haberlo cerrado por accidente.
          </p>
        </div>
        <div className="max-h-[24rem] overflow-y-auto p-2">
          {mensajes.length === 0 ? (
            <p className="py-6 text-center text-xs text-muted-foreground">No hay mensajes recientes.</p>
          ) : (
            <div className="grid gap-1.5">
              {mensajes.map((m) => {
                const open = abierto === m.id;
                return (
                  <div key={m.id} className="rounded-lg border border-border bg-card">
                    <button
                      onClick={() => setAbierto(open ? null : m.id)}
                      className="flex w-full items-start justify-between gap-2 px-2.5 py-2 text-left"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-xs font-bold text-status-blue">{m.documento}</p>
                        <p className="truncate text-[10px] font-semibold uppercase text-muted-foreground">{m.nombre}</p>
                        {m.ips && <p className="truncate text-[10px] text-muted-foreground">{m.ips}</p>}
                      </div>
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase ${statusBadge[m.color]}`}
                      >
                        {m.estado}
                      </span>
                    </button>
                    {open && (
                      <div className="border-t px-2.5 py-2">
                        <pre className="max-h-48 overflow-y-auto whitespace-pre-wrap break-words rounded-md bg-muted/60 p-2 text-[11px] leading-snug text-foreground">
                          {m.mensaje}
                        </pre>
                        <div className="mt-2 flex items-center justify-end gap-1.5">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-[11px]"
                            onClick={() => setAbierto(null)}
                          >
                            <X className="mr-1 h-3.5 w-3.5" /> Cerrar
                          </Button>
                          <Button
                            size="sm"
                            className="h-7 bg-status-teal text-[11px] text-white hover:bg-status-teal/90"
                            onClick={() => copiar(m.mensaje)}
                          >
                            <Copy className="mr-1 h-3.5 w-3.5" /> Copiar
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function IngresoDialog({
  grupo,
  onClose,
  onConfirmar,
}: {
  grupo: Grupo | null;
  onClose: () => void;
  onConfirmar: (g: Grupo, datos: IngresoDatos) => void | Promise<void>;
}) {
  const [datos, setDatos] = useState<IngresoDatos>({
    transporte: "",
    placa: "",
    profesional: "",
    cargo: "",
    observaciones: "",
  });
  const [guardando, setGuardando] = useState(false);

  const set = (k: keyof IngresoDatos, v: string) => setDatos((d) => ({ ...d, [k]: v }));

  const submit = async () => {
    if (!grupo) return;
    setGuardando(true);
    await onConfirmar(grupo, datos);
    setGuardando(false);
    setDatos({ transporte: "", placa: "", profesional: "", cargo: "", observaciones: "" });
  };

  return (
    <Dialog open={!!grupo} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Hospital className="h-5 w-5 text-status-green" /> Confirmar ingreso
          </DialogTitle>
        </DialogHeader>
        {grupo && (
          <p className="-mt-1 text-xs text-muted-foreground">
            {grupo.base.documento} — {[grupo.base.nombres, grupo.base.apellidos].filter(Boolean).join(" ")}
          </p>
        )}
        <div className="grid gap-3 py-1">
          <div className="grid gap-1.5">
            <Label htmlFor="transporte" className="text-xs">IPS / Entidad que transporta</Label>
            <Input id="transporte" value={datos.transporte} onChange={(e) => set("transporte", e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="placa" className="text-xs">Placa del vehículo</Label>
              <Input id="placa" value={datos.placa} onChange={(e) => set("placa", e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="cargo" className="text-xs">Cargo</Label>
              <Input id="cargo" value={datos.cargo} onChange={(e) => set("cargo", e.target.value)} />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="profesional" className="text-xs">Profesional / Personal a cargo</Label>
            <Input id="profesional" value={datos.profesional} onChange={(e) => set("profesional", e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs">Fecha y hora</Label>
            <Input value={fmtFecha(new Date().toISOString())} readOnly disabled className="bg-muted/50" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="observaciones" className="text-xs">Observaciones</Label>
            <Textarea
              id="observaciones"
              rows={3}
              value={datos.observaciones}
              onChange={(e) => set("observaciones", e.target.value)}
              placeholder="Anotaciones adicionales del ingreso…"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            className="bg-status-green text-white hover:bg-status-green/90"
            onClick={submit}
            disabled={guardando}
          >
            <Hospital className="mr-1.5 h-4 w-4" /> {guardando ? "Guardando…" : "Confirmar ingreso"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CasoCard({
  grupo,
  canEdit,
  onConfirmar,
}: {
  grupo: Grupo;
  canEdit: boolean;
  onConfirmar: (g: Grupo) => void;
}) {
  const { base, eventos, estadoFinal, confirmable } = grupo;
  const nombre = [base.nombres, base.apellidos].filter(Boolean).join(" ") || "Sin nombre";
  return (
    <div className={`rounded-lg border border-border border-l-4 ${cardBorder[estadoFinal.color]} bg-card px-3 py-2 shadow-sm`}>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <div className="min-w-0">
          <span className="text-sm font-extrabold text-status-blue">{base.documento || "—"}</span>
          <span className="ml-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{nombre}</span>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2 text-right">
          {base.ips && <span className="text-[11px] font-bold text-foreground">{base.ips}</span>}
          {base.unidad && <span className="text-[11px] italic text-muted-foreground">{base.unidad}</span>}
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${statusBadge[estadoFinal.color]}`}
          >
            ● {estadoFinal.label}
          </span>
        </div>
      </div>

      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        {eventos.map((e, i) => (
          <div key={e.id} className="flex items-center gap-1.5">
            {i > 0 && <span className="text-muted-foreground">→</span>}
            <span className="inline-flex items-center gap-1.5 rounded-md border bg-background/40 px-1.5 py-0.5">
              <span
                className={`rounded border px-1 py-0.5 text-[10px] font-bold ${tipoChip[(e.tipo || "").toUpperCase()] ?? "border-border text-muted-foreground"}`}
              >
                {(e.tipo || "?").toUpperCase()}
              </span>
              <span className="font-mono text-[11px] font-semibold text-foreground">{e.codigo}</span>
              <span className="font-mono text-[10px] text-muted-foreground">{fmtFecha(e.created_at, e.fecha)}</span>
            </span>
          </div>
        ))}
        {confirmable && canEdit && (
          <Button
            size="sm"
            className="ml-auto h-7 rounded-md bg-status-green text-[11px] text-white hover:bg-status-green/90"
            onClick={() => onConfirmar(grupo)}
          >
            <Hospital className="mr-1.5 h-3.5 w-3.5" /> Confirmar Ingreso
          </Button>
        )}
      </div>
    </div>
  );
}

function RemisionCard({ remision: r }: { remision: Remision }) {
  const est = estadoSaliente(r.estado);
  return (
    <div className={`rounded-lg border border-border border-l-4 ${cardBorder[est.color]} bg-card px-3 py-2 shadow-sm`}>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <div className="min-w-0">
          <span className="text-sm font-extrabold text-status-blue">{r.documento || "—"}</span>
          <span className="ml-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {r.paciente || "Sin nombre"}
          </span>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2 text-right">
          {r.ips_receptora && <span className="text-[11px] font-bold text-foreground">{r.ips_receptora}</span>}
          {r.prioridad && <span className="text-[11px] italic text-muted-foreground">{r.prioridad}</span>}
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${statusBadge[est.color]}`}
          >
            ● {est.label}
          </span>
        </div>
      </div>

      <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5 rounded-md border bg-background/40 px-1.5 py-0.5">
          <Ambulance className="h-3.5 w-3.5 text-status-teal" />
          <span className="font-semibold text-foreground">{r.servicio || "Servicio —"}</span>
        </span>
        {r.codigo_radicacion && (
          <span className="inline-flex items-center gap-1 rounded-md border bg-background/40 px-1.5 py-0.5">
            Rad. <span className="font-mono font-semibold text-foreground">{r.codigo_radicacion}</span>
          </span>
        )}
        {r.asegurador && (
          <span className="inline-flex items-center gap-1 rounded-md border bg-background/40 px-1.5 py-0.5">{r.asegurador}</span>
        )}
        <span className="ml-auto font-mono text-[10px]">{fmtFecha(r.created_at, r.fecha_radicado)}</span>
      </div>
    </div>
  );
}
