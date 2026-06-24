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
  FileText,
  MessageSquare,
  Hospital,
  ArrowDownLeft,
  ArrowUpRight,
  Home,
  Stethoscope,
  
  Filter,
  CalendarDays,
  ChevronDown,
  Copy,
  X,
  Check,
} from "lucide-react";
import { toast } from "sonner";
import { fmtFechaHora, fmtEdad, fmtRadicado } from "@/lib/remisiones-utils";
import {
  buildSegMap,
  descargarLibro,
  estadoLabel,
  splitNombre,
  seccionRecibidas,
  seccionRemisiones,
  seccionPHD,
  seccionInternas,
  type SegMap,
  type Seccion,
  type GrupoEntrante,
} from "@/lib/historial-export";
import {
  generarBitacoraPDF,
  generarBitacoraConsolidadaPDF,
  type SeguimientoPDF,
  type CampoPDF,
  type BloqueCaso,
} from "@/lib/bitacora-pdf";

export const Route = createFileRoute("/_authenticated/historial")({
  component: HistorialPage,
});

type Vista = "entrantes" | "salientes" | "phd" | "interna" | "pendientes";

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
  detalle: string | null;
  eapb: string | null;
  regimen: string | null;
  edad?: string | null;
  cie10?: string | null;
  texto_ia: string | null;
  created_at: string;
};

type Remision = Record<string, unknown> & {
  id: string;
  codigo_radicacion: string | null;
  documento: string | null;
  paciente: string | null;
  servicio: string | null;
  ips_receptora: string | null;
  asegurador: string | null;
  eapb: string | null;
  prioridad: string | null;
  estado: string | null;
  fecha_radicado: string | null;
  texto_ia: string | null;
  created_at: string;
};

type Generico = Record<string, unknown> & {
  id: string;
  estado: string | null;
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

const GEN_FILTERS = ["TODOS", "ABIERTO", "PENDIENTE", "GESTIONANDO", "CERRADO"] as const;
type GenFilter = (typeof GEN_FILTERS)[number];
const GEN_LABEL: Record<GenFilter, string> = {
  TODOS: "Todos los casos",
  ABIERTO: "Abierto / Inicial",
  PENDIENTE: "Pendiente",
  GESTIONANDO: "Gestionando",
  CERRADO: "Cerrado / Culminado",
};

const PERIODOS = ["Todos", "Hoy", "Esta semana", "Este mes", "Mes anterior"] as const;
type Periodo = (typeof PERIODOS)[number];

const VISTAS: { key: Vista; label: string; icon: typeof Home; color: string }[] = [
  { key: "entrantes", label: "Entrantes", icon: ArrowDownLeft, color: "bg-status-green" },
  { key: "salientes", label: "Salientes", icon: ArrowUpRight, color: "bg-status-teal" },
  { key: "phd", label: "PHD/PAD/O2/Esp.", icon: Home, color: "bg-status-sky" },
  { key: "interna", label: "Ref. Internas", icon: Stethoscope, color: "bg-status-blue" },
];

// --- Mapeo de acciones / estados para la bitácora de ENTRANTES ---
function accionEntrante(tipo: string): string {
  const t = (tipo || "").toUpperCase();
  if (t.includes("ACEP")) return "ACEPTACIÓN";
  if (t.includes("AMP")) return "AMPLIACIÓN";
  if (t.includes("CAN")) return "CANCELACIÓN";
  if (t.includes("ING")) return "INGRESO CONFIRMADO";
  if (t.includes("NEG")) return "NEGACIÓN";
  if (t.includes("CRUE")) return "CASO CRUE";
  return t || "REGISTRO";
}

function estadoEntrante(tipo: string): string {
  const t = (tipo || "").toUpperCase();
  if (t.includes("ACEP")) return "ACEPTADO";
  if (t.includes("AMP")) return "RESERVA AMPLIADA";
  if (t.includes("CAN")) return "RESERVA CANCELADA";
  if (t.includes("ING")) return "INGRESO CONFIRMADO";
  if (t.includes("NEG")) return "NEGADO";
  if (t.includes("CRUE")) return "CASO CRUE";
  return "REGISTRADO";
}

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

function estadoGenerico(estado: string | null): { label: string; color: StatusColor } {
  const e = (estado || "").toUpperCase();
  if (e.includes("COMPLET") || e.includes("CERRAD") || e.includes("CULMIN")) return { label: e || "CERRADO", color: "green" };
  if (e.includes("PARCIAL")) return { label: "CUMPLIMIENTO PARCIAL", color: "amber" };
  if (e.includes("DESIST") || e.includes("CANCELAD")) return { label: e, color: "red" };
  if (e.includes("PENDIENTE")) return { label: "PENDIENTE", color: "amber" };
  if (e.includes("GESTION")) return { label: "GESTIONANDO", color: "sky" };
  return { label: e || "ABIERTO", color: "sky" };
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

type Construido = {
  documento: string;
  paciente: string;
  fechaBase: string;
  estado: string;
  codigo: string;
  datosPaciente: CampoPDF[];
  referencia: string;
  bloque: BloqueCaso;
};

type ResultadosBitacora = {
  entrantes: Construido[];
  salientes: Construido[];
  phd: Construido[];
  internas: Construido[];
};

const v = (x: unknown): string => (x == null ? "" : String(x).trim());
const joinList = (x: unknown): string => (Array.isArray(x) ? x.filter(Boolean).join(", ") : v(x));

function HistorialPage() {
  const { canEdit, user } = useAuth();
  const usuario =
    (user?.user_metadata?.nombre as string) || user?.email || "Usuario autenticado";
  const qc = useQueryClient();
  const [vista, setVista] = useState<Vista>("entrantes");
  const [q, setQ] = useState("");
  const [tipo, setTipo] = useState<TipoFilter>("TODOS");
  const [salTipo, setSalTipo] = useState<SalFilter>("TODOS");
  const [genTipo, setGenTipo] = useState<GenFilter>("TODOS");
  const [periodo, setPeriodo] = useState<Periodo>("Todos");
  const [fechaEspecifica, setFechaEspecifica] = useState<Date | undefined>(undefined);
  const [ingresoFor, setIngresoFor] = useState<Grupo | null>(null);
  const [bitacoraOpen, setBitacoraOpen] = useState(false);

  const { data: casos, isLoading } = useQuery({
    queryKey: ["historial-casos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("casos_entrantes")
        .select(
          "id, codigo, tipo, cod_ref, documento, nombres, apellidos, ips, unidad, especialidad, estado, fecha, fecha_vence, detalle, eapb, regimen, texto_ia, created_at",
        )
        .order("created_at", { ascending: false })
        .limit(1000);
      if (error) throw error;
      return data as Caso[];
    },
  });

  const { data: remisiones, isLoading: loadingSal } = useQuery({
    queryKey: ["historial-remisiones-full"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("remisiones")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(1000);
      if (error) throw error;
      return data as Remision[];
    },
  });

  const { data: phd, isLoading: loadingPhd } = useQuery({
    queryKey: ["historial-domiciliarios"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("domiciliarios")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(1000);
      if (error) throw error;
      return data as Generico[];
    },
  });

  const { data: internas, isLoading: loadingInt } = useQuery({
    queryKey: ["historial-internas"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("referencia_interna")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(1000);
      if (error) throw error;
      return data as Generico[];
    },
  });

  const { data: pendientes, isLoading: loadingPen } = useQuery({
    queryKey: ["historial-pendientes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pendientes")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(1000);
      if (error) throw error;
      return data as Generico[];
    },
  });

  const { data: seguimientos } = useQuery({
    queryKey: ["historial-seguimientos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("seguimientos")
        .select("caso_id, tipo_caso, tipo_seguimiento, detalle, plantilla_indigo, estado_solicitud, nombre_contacto, nombre_usuario, created_at")
        .order("created_at", { ascending: true })
        .limit(5000);
      if (error) throw error;
      return data as Record<string, unknown>[];
    },
  });

  const segMap = useMemo<SegMap>(() => buildSegMap(seguimientos ?? []), [seguimientos]);

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
        if (!pasaPeriodo((r.fecha_radicado as string) || r.created_at)) return false;
        if (!term) return true;
        const hay = `${r.codigo_radicacion ?? ""} ${r.documento ?? ""} ${r.paciente ?? ""} ${r.ips_receptora ?? ""} ${r.servicio ?? ""}`.toLowerCase();
        return hay.includes(term);
      }),
    [remisiones, salTipo, periodo, fechaEspecifica, term],
  );

  const filtraGenerico = (rows: Generico[], campos: (r: Generico) => string) =>
    rows.filter((r) => {
      if (genTipo !== "TODOS") {
        const e = (r.estado || "").toUpperCase();
        if (genTipo === "CERRADO" && !/COMPLET|CERRAD|CULMIN/.test(e)) return false;
        if (genTipo !== "CERRADO" && !e.includes(genTipo)) return false;
      }
      if (!pasaPeriodo((r.fecha_inicio as string) || (r.fecha as string) || r.created_at)) return false;
      if (!term) return true;
      return campos(r).toLowerCase().includes(term);
    });

  const phdF = useMemo(
    () => filtraGenerico((phd ?? []) as Generico[], (r) => `${v(r.paciente)} ${v(r.documento)} ${v(r.tipo_solicitud)} ${v(r.eapb)} ${v(r.codigo_radicacion)}`),
    [phd, genTipo, periodo, fechaEspecifica, term],
  );
  const internasF = useMemo(
    () => filtraGenerico((internas ?? []) as Generico[], (r) => `${v(r.paciente)} ${v(r.documento)} ${v(r.tipo_solicitud)} ${v(r.servicio)} ${v(r.eapb)}`),
    [internas, genTipo, periodo, fechaEspecifica, term],
  );
  const pendientesF = useMemo(
    () => filtraGenerico((pendientes ?? []) as Generico[], (r) => `${v(r.paciente_asunto)} ${v(r.tipo_pendiente)} ${v(r.ips_area)} ${v(r.prioridad)}`),
    [pendientes, genTipo, periodo, fechaEspecifica, term],
  );

  // Mensajes recientes
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
          fecha: fmtFecha(r.created_at, r.fecha_radicado as string),
          mensaje: r.texto_ia || "",
        };
      });
  }, [vista, casos, remisiones]);

  const periodoLabel = fechaEspecifica
    ? `${pad(fechaEspecifica.getDate())}/${pad(fechaEspecifica.getMonth() + 1)}/${fechaEspecifica.getFullYear()}`
    : periodo;

  const filtroCasoLabel =
    vista === "entrantes" ? TIPO_LABEL[tipo] : vista === "salientes" ? SAL_LABEL[salTipo] : GEN_LABEL[genTipo];

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

  // ---- Auditoría de exportación ----
  const auditar = async (accion: string, detalles: Record<string, unknown>) => {
    try {
      await (supabase as unknown as { rpc: (n: string, a: Record<string, unknown>) => Promise<unknown> }).rpc(
        "registrar_auditoria",
        {
          _accion: accion,
          _modulo: "historial",
          _tabla: "varios",
          _resultado: "exito",
          _detalles: detalles,
        },
      );
    } catch {
      /* la auditoría no debe bloquear la exportación */
    }
  };

  const filtrosTexto = `Caso=${filtroCasoLabel}; Período=${periodoLabel}${term ? `; Búsqueda="${term}"` : ""}`;

  const gruposEntrantesExport = (): GrupoEntrante[] =>
    gruposF.map((g) => ({ base: g.base as unknown as GrupoEntrante["base"], eventos: g.eventos as unknown as Record<string, unknown>[], estadoLabel: g.estadoFinal.label }));

  const seccionActual = (): Seccion | null => {
    if (vista === "entrantes") return seccionRecibidas(gruposEntrantesExport());
    if (vista === "salientes") return seccionRemisiones(remisionesF as Record<string, unknown>[], segMap);
    if (vista === "phd") return seccionPHD(phdF as Record<string, unknown>[], segMap);
    if (vista === "interna") return seccionInternas(internasF as Record<string, unknown>[], segMap);
    return null;
  };

  const exportarVistaActual = () => {
    const sec = seccionActual();
    if (!sec || sec.rows.length === 0) {
      toast.info("No hay registros para exportar.");
      return;
    }
    descargarLibro([sec], usuario, filtrosTexto, `historial_${vista}`);
    auditar("exportar_excel_seccion", { vista, filtros: filtrosTexto, registros: sec.rows.length });
    toast.success("Excel generado");
  };

  const exportarTodo = () => {
    const secciones = [
      seccionRecibidas(gruposEntrantesExport()),
      seccionRemisiones(remisionesF as Record<string, unknown>[], segMap),
      seccionPHD(phdF as Record<string, unknown>[], segMap),
      seccionInternas(internasF as Record<string, unknown>[], segMap),
    ];
    const total = secciones.reduce((s, x) => s + x.rows.length, 0);
    if (total === 0) {
      toast.info("No hay registros para exportar.");
      return;
    }
    descargarLibro(secciones, usuario, filtrosTexto, "historial_bitacora_general");
    auditar("exportar_excel_unificado", { filtros: filtrosTexto, registros: total });
    toast.success("Excel unificado generado");
  };

  // ---- PDF bitácora ----
  const segPDFpara = (casoId: string, defaultEntidad = ""): SeguimientoPDF[] => {
    const arr = segMap.get(casoId) ?? [];
    return arr.map((s) => ({
      fecha: fmtFechaHora(s.created_at),
      entidad: s.contacto || defaultEntidad || "—",
      observaciones: s.detalle || "—",
      estado: s.estado || "—",
      accion: s.tipo || "—",
      funcionario: s.usuario || "—",
      _orden: new Date(s.created_at || 0).getTime(),
    }));
  };

  // ---- Constructores de bitácora (reutilizados por caso y por consolidado) ----

  const estadoFinalEntrante = (g: Grupo): string => {
    const tipos = g.eventos.map((e) => (e.tipo || "").toUpperCase());
    const has = (t: string) => tipos.some((x) => x.includes(t));
    if (has("ING")) return "Aceptado con ingreso confirmado";
    if (has("NEG")) {
      const neg = g.eventos.find((e) => (e.tipo || "").toUpperCase().includes("NEG"));
      const m = v(neg?.detalle);
      return m ? `Negado por ${m}` : "Negado";
    }
    if (has("CAN")) {
      const can = g.eventos.find((e) => (e.tipo || "").toUpperCase().includes("CAN"));
      const m = v(can?.detalle);
      return m ? `Cancelado por ${m}` : "Cancelado por vencimiento de tiempo de reserva";
    }
    if (has("AMP")) return "Aceptada con ampliación de reserva otorgada";
    if (has("ACEP")) return "Aceptado con espera de ingreso";
    if (has("CRUE")) return "Caso CRUE";
    return g.estadoFinal.label;
  };

  const buildEntrante = (g: Grupo): Construido => {
    const b = g.base;
    const ingreso = g.eventos.find((e) => (e.tipo || "").toUpperCase().includes("ING"));
    const datosPaciente: CampoPDF[] = [
      { label: "Apellidos", value: v(b.apellidos) || "—" },
      { label: "Nombres", value: v(b.nombres) || "—" },
      { label: "Tipo documento", value: "CC" },
      { label: "Número documento", value: v(b.documento) || "—" },
      { label: "Edad", value: fmtEdad(b.edad) },
      { label: "Entidad responsable / EAPB", value: v(b.eapb) || v((b as Record<string, unknown>).aseguramiento) || "—" },
      { label: "Régimen", value: v(b.regimen) || "—" },
      { label: "Teléfono", value: v((b as Record<string, unknown>).telefono) || "—" },
    ];
    const datosReferencia: CampoPDF[] = [
      { label: "Tipo de trámite", value: "REMISIONES ENTRANTES" },
      { label: "IPS remitente", value: v(b.ips) || "—" },
      { label: "Estado final del caso", value: estadoFinalEntrante(g) },
      { label: "Códigos del caso", value: g.eventos.map((e) => v(e.codigo)).filter(Boolean).join(" · ") || "—" },
      { label: "Especialidad", value: v(b.especialidad) || "—" },
      { label: "Unidad / Servicio", value: v(b.unidad) || "—" },
      { label: "Fecha y hora de ingreso", value: ingreso ? fmtFechaHora(ingreso.created_at || ingreso.fecha) : "—" },
    ];
    const seguimientos: SeguimientoPDF[] = g.eventos
      .map((e) => ({
        fecha: fmtFechaHora(e.created_at || e.fecha),
        entidad: v(e.ips) || "—",
        observaciones: v(e.detalle) || v(e.texto_ia) || "—",
        estado: estadoEntrante(e.tipo || ""),
        accion: accionEntrante(e.tipo || ""),
        funcionario: v((e as Record<string, unknown>).usuario_registro) || "—",
        _orden: new Date(e.created_at || e.fecha || 0).getTime(),
      }));
    return {
      documento: v(b.documento),
      paciente: [b.nombres, b.apellidos].filter(Boolean).join(" ") || "—",
      fechaBase: v(b.fecha) || v(b.created_at),
      estado: g.estadoFinal.label,
      codigo: g.eventos.map((e) => v(e.codigo)).filter(Boolean).join(" · "),
      referencia: v(b.documento) || v(b.codigo) || g.key,
      datosPaciente,
      bloque: { tipoDocumento: "REMISIÓN ENTRANTE", datosReferencia, seguimientos },
    };
  };

  const buildSaliente = (r: Remision): Construido => {
    const nm = splitNombre(v(r.paciente));
    const eapb = v(r.eapb) || v(r.asegurador);
    const datosPaciente: CampoPDF[] = [
      { label: "Apellidos", value: [nm.primerApellido, nm.segundoApellido].filter(Boolean).join(" ") || "—" },
      { label: "Nombres", value: [nm.primerNombre, nm.segundoNombre].filter(Boolean).join(" ") || "—" },
      { label: "Tipo documento", value: v(r.tipo_documento) || "CC" },
      { label: "Número documento", value: v(r.documento) || "—" },
      { label: "Edad", value: fmtEdad(r.edad as string) },
      { label: "Entidad responsable / EAPB / ERP", value: eapb || "—" },
      { label: "Régimen", value: v(r.regimen) || "—" },
      { label: "Teléfono", value: v(r.telefono) || "—" },
    ];
    const datosReferencia: CampoPDF[] = [
      { label: "Tipo de trámite", value: "REMISIONES SALIENTES" },
      { label: "Fecha de solicitud", value: fmtFechaHora((r.fecha_inicio as string) || r.created_at) },
      { label: "Servicio remitente", value: v(r.servicio) || "—" },
      { label: "Especialidad remitente", value: joinList(r.especialidades_tratantes) || "—" },
      { label: "Especialidad receptora", value: joinList(r.especialidades_receptoras) || "—" },
      { label: "Motivo de remisión", value: v(r.remision_por) || "—" },
      { label: "Diagnóstico CIE-10", value: v(r.cie10) || "—" },
      { label: "Tipo de ambulancia requerida", value: v(r.tipo_ambulancia) || "—" },
      { label: "Estado actual", value: estadoLabel(r.estado) },
      { label: "EAPB / ERP", value: eapb || "—" },
      { label: "Régimen", value: v(r.regimen) || "—" },
      { label: "Número de radicado", value: fmtRadicado(v(r.codigo_radicacion), r.eapb_genera_codigo as boolean) },
      { label: "Red comentada", value: redComentadaTxt(r) },
    ];
    return {
      documento: v(r.documento),
      paciente: v(r.paciente) || "—",
      fechaBase: v(r.fecha_inicio) || v(r.created_at),
      estado: estadoLabel(r.estado),
      codigo: fmtRadicado(v(r.codigo_radicacion), r.eapb_genera_codigo as boolean),
      referencia: v(r.codigo_radicacion) || v(r.documento) || r.id,
      datosPaciente,
      bloque: {
        tipoDocumento: "REMISIÓN SALIENTE",
        datosReferencia,
        seguimientos: segPDFpara(r.id, eapb || v(r.ips_receptora)),
      },
    };
  };

  const buildPHD = (r: Generico): Construido => {
    const nm = splitNombre(v(r.paciente));
    const eapb = v(r.eapb);
    const datosPaciente: CampoPDF[] = [
      { label: "Apellidos", value: [nm.primerApellido, nm.segundoApellido].filter(Boolean).join(" ") || "—" },
      { label: "Nombres", value: [nm.primerNombre, nm.segundoNombre].filter(Boolean).join(" ") || "—" },
      { label: "Tipo documento", value: v(r.tipo_documento) || "CC" },
      { label: "Número documento", value: v(r.documento) || "—" },
      { label: "Edad", value: fmtEdad(r.edad as string) },
      { label: "Entidad responsable / EAPB / ERP", value: eapb || "—" },
      { label: "Régimen", value: v(r.regimen) || "—" },
      { label: "Teléfono", value: v(r.telefono) || "—" },
    ];
    const datosReferencia: CampoPDF[] = [
      { label: "Tipo de trámite", value: "PHD/PAD/O2/ESPECIALES" },
      { label: "Fecha de solicitud", value: fmtFechaHora((r.fecha_inicio as string) || r.created_at) },
      { label: "Tipo de solicitud", value: v(r.tipo_solicitud_detalle) || v(r.tipo_solicitud) || "—" },
      { label: "Unidad especial", value: v(r.unidad_especial) || "—" },
      { label: "Servicio solicitante", value: v(r.servicio) || "—" },
      { label: "Especialidad solicitante", value: joinList(r.especialidades_tratantes) || "—" },
      { label: "Diagnóstico CIE-10", value: v(r.cie10) || "—" },
      { label: "Requiere ambulancia", value: r.requiere_ambulancia ? "SI" : "NO" },
      { label: "Tipo de ambulancia", value: v(r.tipo_ambulancia) || "—" },
      { label: "Datos familiar", value: v(r.contacto_nombre) || "—" },
      { label: "Teléfono familiar", value: v(r.contacto_telefono) || "—" },
      { label: "Parentesco familiar", value: v(r.contacto_parentesco) || "—" },
      { label: "EAPB / ERP", value: eapb || "—" },
      { label: "Régimen", value: v(r.regimen) || "—" },
      { label: "Código de radicación", value: fmtRadicado(v(r.codigo_radicacion), r.eapb_genera_codigo as boolean) },
      { label: "Estado actual", value: estadoGenerico(r.estado).label },
    ];
    return {
      documento: v(r.documento),
      paciente: v(r.paciente) || "—",
      fechaBase: v(r.fecha_inicio) || v(r.created_at),
      estado: estadoGenerico(r.estado).label,
      codigo: fmtRadicado(v(r.codigo_radicacion), r.eapb_genera_codigo as boolean),
      referencia: v(r.codigo_radicacion) || v(r.documento) || r.id,
      datosPaciente,
      bloque: {
        tipoDocumento: "PHD / PAD / O2 / ESPECIALES",
        datosReferencia,
        seguimientos: segPDFpara(r.id, eapb),
      },
    };
  };

  const buildInterna = (r: Generico): Construido => {
    const nm = splitNombre(v(r.paciente));
    const eapb = v(r.eapb) || v(r.proveedor_prestador);
    const datosPaciente: CampoPDF[] = [
      { label: "Apellidos", value: [nm.primerApellido, nm.segundoApellido].filter(Boolean).join(" ") || "—" },
      { label: "Nombres", value: [nm.primerNombre, nm.segundoNombre].filter(Boolean).join(" ") || "—" },
      { label: "Tipo documento", value: v(r.tipo_documento) || "CC" },
      { label: "Número documento", value: v(r.documento) || "—" },
      { label: "Edad", value: fmtEdad(r.edad as string) },
      { label: "Entidad responsable / EAPB / ERP", value: eapb || "—" },
      { label: "Régimen", value: v(r.regimen) || "—" },
      { label: "Teléfono", value: v(r.telefono) || "—" },
    ];
    const datosReferencia: CampoPDF[] = [
      { label: "Tipo de trámite", value: "REFERENCIA INTERNA" },
      { label: "Fecha de solicitud", value: fmtFechaHora((r.fecha_inicio as string) || r.created_at) },
      { label: "Servicio solicitante", value: v(r.servicio) || "—" },
      { label: "Tipo de solicitud", value: v(r.tipo_solicitud) || "—" },
      { label: "Tipo de ambulancia requerida", value: v(r.tipo_ambulancia) || "—" },
      { label: "Estado actual", value: estadoGenerico(r.estado).label },
    ];
    return {
      documento: v(r.documento),
      paciente: v(r.paciente) || "—",
      fechaBase: v(r.fecha_inicio) || v(r.created_at),
      estado: estadoGenerico(r.estado).label,
      codigo: "",
      referencia: v(r.documento) || r.id,
      datosPaciente,
      bloque: {
        tipoDocumento: "REFERENCIA INTERNA",
        datosReferencia,
        seguimientos: segPDFpara(r.id, v(r.servicio) || eapb),
      },
    };
  };

  const generarUno = (c: Construido, vistaAud: string) => {
    void generarBitacoraPDF({
      tipoDocumento: c.bloque.tipoDocumento,
      referencia: c.referencia,
      datosPaciente: c.datosPaciente,
      datosReferencia: c.bloque.datosReferencia,
      seguimientos: c.bloque.seguimientos,
      usuario,
    });
    auditar("exportar_pdf_bitacora", { vista: vistaAud, caso: c.referencia, documento: c.documento });
  };

  const pdfEntrante = (g: Grupo) => generarUno(buildEntrante(g), "entrantes");
  const pdfSaliente = (r: Remision) => generarUno(buildSaliente(r), "salientes");
  const pdfPHD = (r: Generico) => generarUno(buildPHD(r), "phd");
  const pdfInterna = (r: Generico) => generarUno(buildInterna(r), "interna");

  // ---- Búsqueda de bitácora por documento (con rango de fechas opcional) ----
  const recortarRango = (c: Construido, lo: number, hi: number): Construido => {
    if (lo === -Infinity && hi === Infinity) return c;
    return {
      ...c,
      bloque: {
        ...c.bloque,
        seguimientos: c.bloque.seguimientos.filter((s) => {
          const t = s._orden ?? 0;
          return t >= lo && t <= hi;
        }),
      },
    };
  };

  const buscarBitacoras = (
    doc: string,
    ini?: Date,
    fin?: Date,
  ): { entrantes: Construido[]; salientes: Construido[]; phd: Construido[]; internas: Construido[] } => {
    const d = doc.trim().toLowerCase();
    const lo = ini ? new Date(ini.getFullYear(), ini.getMonth(), ini.getDate()).getTime() : -Infinity;
    const hi = fin ? new Date(fin.getFullYear(), fin.getMonth(), fin.getDate(), 23, 59, 59, 999).getTime() : Infinity;
    const sinRango = lo === -Infinity && hi === Infinity;
    const match = (docu: unknown) => {
      const s = v(docu).toLowerCase();
      return s !== "" && s.includes(d);
    };
    const incluye = (c: Construido): boolean => {
      if (sinRango) return true;
      const bt = new Date(c.fechaBase || 0).getTime();
      const baseIn = !Number.isNaN(bt) && bt >= lo && bt <= hi;
      const segIn = c.bloque.seguimientos.some((s) => {
        const t = s._orden ?? 0;
        return t >= lo && t <= hi;
      });
      return baseIn || segIn;
    };
    const proc = (arr: Construido[]) => arr.map((c) => recortarRango(c, lo, hi)).filter(incluye);
    return {
      entrantes: proc(grupos.filter((g) => match(g.base.documento)).map(buildEntrante)),
      salientes: proc((remisiones ?? []).filter((r) => match(r.documento)).map(buildSaliente)),
      phd: proc(((phd ?? []) as Generico[]).filter((r) => match(r.documento)).map(buildPHD)),
      internas: proc(((internas ?? []) as Generico[]).filter((r) => match(r.documento)).map(buildInterna)),
    };
  };

  const pdfConstruido = (c: Construido) => generarUno(c, c.bloque.tipoDocumento);

  const pdfConsolidado = (cs: Construido[], doc: string, filtros: string) => {
    if (cs.length === 0) {
      toast.info("No hay casos para consolidar.");
      return;
    }
    void generarBitacoraConsolidadaPDF({
      referencia: doc || cs[0].documento || "consolidada",
      datosPaciente: cs[0].datosPaciente,
      bloques: cs.map((c) => c.bloque),
      usuario,
    });
    auditar("exportar_pdf_bitacora_consolidada", { documento: doc, casos: cs.length, filtros });
    toast.success("Bitácora consolidada generada");
  };



  const cargando =
    vista === "entrantes" ? isLoading
    : vista === "salientes" ? loadingSal
    : vista === "phd" ? loadingPhd
    : vista === "interna" ? loadingInt
    : loadingPen;

  const vacio =
    vista === "entrantes" ? gruposF.length === 0
    : vista === "salientes" ? remisionesF.length === 0
    : vista === "phd" ? phdF.length === 0
    : vista === "interna" ? internasF.length === 0
    : pendientesF.length === 0;

  const setQuickPeriodo = (p: Periodo) => {
    setPeriodo(p);
    setFechaEspecifica(undefined);
  };

  const tituloVista = VISTAS.find((x) => x.key === vista)?.label ?? "";
  const usaMensajes = vista === "entrantes" || vista === "salientes";

  return (
    <div>
      <AppHeader title="Referencia y Contrarreferencia" subtitle="Control de Casos Entrantes y Salientes" />

      <Panel bodyMaxHeight={null}>
        {/* Selector de vista con scroll horizontal */}
        <div className="mb-3 flex justify-center">
          <div className="inline-flex max-w-full gap-1 overflow-x-auto rounded-full border border-border bg-muted/40 p-1">
            {VISTAS.map((vw) => {
              const Icon = vw.icon;
              const active = vista === vw.key;
              return (
                <button
                  key={vw.key}
                  onClick={() => setVista(vw.key)}
                  className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-bold uppercase tracking-wide transition ${
                    active ? `${vw.color} text-white shadow-sm` : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" /> {vw.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Encabezado: título + filtros + exportar */}
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-extrabold uppercase tracking-wide text-foreground">
            HISTORIAL · {tituloVista}
          </h2>
          <div className="flex flex-wrap items-center gap-1.5">
            {/* Filtro por caso/estado */}
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
                  Filtrar por {vista === "entrantes" ? "caso" : "estado"}
                </p>
                {vista === "entrantes"
                  ? TIPO_FILTERS.map((t) => (
                      <FilterButton key={t} active={tipo === t} label={TIPO_LABEL[t]} onClick={() => setTipo(t)} />
                    ))
                  : vista === "salientes"
                    ? SAL_FILTERS.map((t) => (
                        <FilterButton key={t} active={salTipo === t} label={SAL_LABEL[t]} onClick={() => setSalTipo(t)} />
                      ))
                    : GEN_FILTERS.map((t) => (
                        <FilterButton key={t} active={genTipo === t} label={GEN_LABEL[t]} onClick={() => setGenTipo(t)} />
                      ))}
              </PopoverContent>
            </Popover>

            {/* Período + calendario */}
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 rounded-full text-[11px] font-semibold">
                  <CalendarDays className="mr-1.5 h-3.5 w-3.5" />
                  {periodoLabel}
                  <ChevronDown className="ml-1 h-3.5 w-3.5 opacity-70" />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-auto p-2">
                <p className="px-1 pb-1.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Período</p>
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

            {usaMensajes && <MensajesRecientesButton vista={vista} mensajes={mensajes} />}

            {/* Bitácora PDF por documento */}
            <Button
              size="sm"
              variant="outline"
              className="h-8 rounded-full border-status-red/40 bg-status-red/10 text-[11px] font-semibold text-status-red hover:bg-status-red/20"
              onClick={() => setBitacoraOpen(true)}
            >
              <FileText className="mr-1.5 h-3.5 w-3.5" /> Bitácora PDF
            </Button>



            {/* Exportación */}
            <Popover>
              <PopoverTrigger asChild>
                <Button size="sm" className="h-8 rounded-full bg-status-green text-white hover:bg-status-green/90">
                  <FileSpreadsheet className="mr-1.5 h-4 w-4" /> Exportar
                  <ChevronDown className="ml-1 h-3.5 w-3.5 opacity-80" />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-60 p-1.5">
                <p className="px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                  Exportar a Excel (GU-FR-50)
                </p>
                <button
                  onClick={exportarVistaActual}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-xs font-medium transition hover:bg-muted"
                >
                  <FileSpreadsheet className="h-4 w-4 text-status-green" /> Solo {tituloVista}
                </button>
                <button
                  onClick={exportarTodo}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-xs font-medium transition hover:bg-muted"
                >
                  <FileSpreadsheet className="h-4 w-4 text-status-teal" /> Todo el histórico (4 hojas)
                </button>
              </PopoverContent>
            </Popover>
          </div>
        </div>

        {/* Búsqueda */}
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="rounded-lg pl-9"
            placeholder="Buscar por documento, paciente, radicado…"
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
              <CasoCard key={g.key} grupo={g} canEdit={canEdit} onConfirmar={() => setIngresoFor(g)} onPDF={() => pdfEntrante(g)} />
            ))}
          </div>
        ) : vista === "salientes" ? (
          <div className="grid gap-2">
            {remisionesF.map((r) => (
              <RemisionCard key={r.id} remision={r} onPDF={() => pdfSaliente(r)} />
            ))}
          </div>
        ) : vista === "phd" ? (
          <div className="grid gap-2">
            {(phdF as Generico[]).map((r) => (
              <GenericoCard
                key={r.id}
                titulo={`${v(r.paciente) || "Sin nombre"}`}
                sub={[v(r.documento), v(r.tipo_solicitud_detalle) || v(r.tipo_solicitud), v(r.eapb)]}
                estado={estadoGenerico(r.estado)}
                fecha={fmtFechaHora((r.fecha_inicio as string) || r.created_at)}
                radicado={fmtRadicado(v(r.codigo_radicacion), r.eapb_genera_codigo as boolean)}
                onPDF={() => pdfPHD(r)}
              />
            ))}
          </div>
        ) : (
          <div className="grid gap-2">
            {(internasF as Generico[]).map((r) => (
              <GenericoCard
                key={r.id}
                titulo={`${v(r.paciente) || "Sin nombre"}`}
                sub={[v(r.documento), v(r.tipo_solicitud), v(r.servicio)]}
                estado={estadoGenerico(r.estado)}
                fecha={fmtFechaHora((r.fecha_inicio as string) || r.created_at)}
                onPDF={() => pdfInterna(r)}
              />
            ))}
          </div>
        )}
      </Panel>


      <IngresoDialog grupo={ingresoFor} onClose={() => setIngresoFor(null)} onConfirmar={handleConfirmarIngreso} />
      <BitacoraBuscadorDialog
        open={bitacoraOpen}
        onClose={() => setBitacoraOpen(false)}
        buscar={buscarBitacoras}
        onPDF={pdfConstruido}
        onConsolidado={pdfConsolidado}
      />

    </div>
  );
}

function redComentadaTxt(r: Remision): string {
  const local = joinList(r.ips_red_local);
  const nacional = joinList(r.departamentos_red_nacional);
  const partes: string[] = [];
  if (local) partes.push(`LOCAL: ${local}`);
  if (nacional) partes.push(`NACIONAL: ${nacional}`);
  return partes.length ? partes.join(" | ") : v(r.alcance_red) || "N/A";
}

function FilterButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-xs font-medium transition hover:bg-muted ${
        active ? "text-primary" : "text-foreground"
      }`}
    >
      {label}
      {active && <Check className="h-3.5 w-3.5" />}
    </button>
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
                          <Button size="sm" variant="ghost" className="h-7 text-[11px]" onClick={() => setAbierto(null)}>
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

  const set = (k: keyof IngresoDatos, val: string) => setDatos((d) => ({ ...d, [k]: val }));

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
          <Button className="bg-status-green text-white hover:bg-status-green/90" onClick={submit} disabled={guardando}>
            <Hospital className="mr-1.5 h-4 w-4" /> {guardando ? "Guardando…" : "Confirmar ingreso"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PDFButton({ onClick }: { onClick: () => void }) {
  return (
    <Button
      size="sm"
      variant="outline"
      className="h-7 rounded-md border-status-red/40 text-[11px] font-semibold text-status-red hover:bg-status-red/10"
      onClick={onClick}
    >
      <FileText className="mr-1 h-3.5 w-3.5" /> Bitácora PDF
    </Button>
  );
}

function CasoCard({
  grupo,
  canEdit,
  onConfirmar,
  onPDF,
}: {
  grupo: Grupo;
  canEdit: boolean;
  onConfirmar: (g: Grupo) => void;
  onPDF: () => void;
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
        <div className="ml-auto flex items-center gap-1.5">
          <PDFButton onClick={onPDF} />
          {confirmable && canEdit && (
            <Button
              size="sm"
              className="h-7 rounded-md bg-status-green text-[11px] text-white hover:bg-status-green/90"
              onClick={() => onConfirmar(grupo)}
            >
              <Hospital className="mr-1.5 h-3.5 w-3.5" /> Confirmar Ingreso
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function RemisionCard({ remision: r, onPDF }: { remision: Remision; onPDF: () => void }) {
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
          {r.servicio && <span className="text-[11px] italic text-muted-foreground">{r.servicio}</span>}
          {r.ips_receptora && <span className="text-[11px] font-bold text-foreground">{r.ips_receptora}</span>}
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${statusBadge[est.color]}`}
          >
            ● {est.label}
          </span>
        </div>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
        <span className="font-mono">Rad. {fmtRadicado(v(r.codigo_radicacion), r.eapb_genera_codigo as boolean)}</span>
        {(r.eapb || r.asegurador) && <span className="rounded border px-1.5 py-0.5">{r.eapb || r.asegurador}</span>}
        <span className="font-mono">{fmtFecha(r.created_at, r.fecha_radicado as string)}</span>
        <div className="ml-auto">
          <PDFButton onClick={onPDF} />
        </div>
      </div>
    </div>
  );
}

function GenericoCard({
  titulo,
  sub,
  estado,
  fecha,
  radicado,
  onPDF,
}: {
  titulo: string;
  sub: string[];
  estado: { label: string; color: StatusColor };
  fecha: string;
  radicado?: string;
  onPDF: () => void;
}) {
  const subItems = sub.filter(Boolean);
  return (
    <div className={`rounded-lg border border-border border-l-4 ${cardBorder[estado.color]} bg-card px-3 py-2 shadow-sm`}>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <div className="min-w-0">
          <span className="text-sm font-extrabold text-status-blue">{titulo}</span>
        </div>
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${statusBadge[estado.color]}`}
        >
          ● {estado.label}
        </span>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
        {subItems.map((s, i) => (
          <span key={i} className="rounded border px-1.5 py-0.5">{s}</span>
        ))}
        {radicado && <span className="font-mono">Rad. {radicado}</span>}
        <span className="font-mono">{fecha}</span>
        <div className="ml-auto">
          <PDFButton onClick={onPDF} />
        </div>
      </div>
    </div>
  );
}

function parseDateInput(s: string): Date | undefined {
  if (!s) return undefined;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return undefined;
  return new Date(+m[1], +m[2] - 1, +m[3]);
}

function BitacoraBuscadorDialog({
  open,
  onClose,
  buscar,
  onPDF,
  onConsolidado,
}: {
  open: boolean;
  onClose: () => void;
  buscar: (doc: string, ini?: Date, fin?: Date) => ResultadosBitacora;
  onPDF: (c: Construido) => void;
  onConsolidado: (cs: Construido[], doc: string, filtros: string) => void;
}) {
  const [doc, setDoc] = useState("");
  const [iniStr, setIniStr] = useState("");
  const [finStr, setFinStr] = useState("");
  const [res, setRes] = useState<ResultadosBitacora | null>(null);

  const consultar = () => {
    if (!doc.trim()) {
      toast.info("Ingresa un número de documento.");
      return;
    }
    setRes(buscar(doc, parseDateInput(iniStr), parseDateInput(finStr)));
  };

  const filtrosTxt = `Documento=${doc.trim()}${iniStr ? `; Desde=${iniStr}` : ""}${finStr ? `; Hasta=${finStr}` : ""}`;
  const todos = res ? [...res.entrantes, ...res.salientes, ...res.phd, ...res.internas] : [];

  const reset = () => {
    setDoc("");
    setIniStr("");
    setFinStr("");
    setRes(null);
  };

  const grupos: { label: string; items: Construido[] }[] = res
    ? [
        { label: "Entrantes", items: res.entrantes },
        { label: "Salientes", items: res.salientes },
        { label: "PHD/PAD/O2/Esp.", items: res.phd },
        { label: "Ref. Internas", items: res.internas },
      ]
    : [];

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          reset();
          onClose();
        }
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <FileText className="h-5 w-5 text-status-red" /> Generar Bitácora PDF
          </DialogTitle>
        </DialogHeader>

        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="bit-doc" className="text-xs">
              Número de documento
            </Label>
            <div className="flex gap-2">
              <Input
                id="bit-doc"
                value={doc}
                onChange={(e) => setDoc(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && consultar()}
                placeholder="Ej. 1117545825"
              />
              <Button onClick={consultar} className="bg-status-blue text-white hover:bg-status-blue/90">
                <Search className="mr-1.5 h-4 w-4" /> Consultar
              </Button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="bit-ini" className="text-xs">
                Fecha inicio (opcional)
              </Label>
              <Input id="bit-ini" type="date" value={iniStr} onChange={(e) => setIniStr(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="bit-fin" className="text-xs">
                Fecha fin (opcional)
              </Label>
              <Input id="bit-fin" type="date" value={finStr} onChange={(e) => setFinStr(e.target.value)} />
            </div>
          </div>
        </div>

        {res && (
          <div className="mt-2 grid gap-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-muted-foreground">{todos.length} caso(s) encontrado(s)</p>
              {todos.length > 0 && (
                <Button
                  size="sm"
                  className="h-8 bg-status-teal text-[11px] text-white hover:bg-status-teal/90"
                  onClick={() => onConsolidado(todos, doc.trim(), filtrosTxt)}
                >
                  <FileText className="mr-1.5 h-3.5 w-3.5" /> Bitácora consolidada del paciente
                </Button>
              )}
            </div>

            {todos.length === 0 ? (
              <div className="rounded-lg border border-border bg-card py-10 text-center">
                <p className="text-sm font-semibold text-foreground">Sin registros</p>
                <p className="text-xs text-muted-foreground">No se hallaron casos para ese documento y rango.</p>
              </div>
            ) : (
              grupos.map((g) => (
                <div key={g.label}>
                  <p className="mb-1 text-xs font-bold uppercase tracking-wide text-status-blue">{g.label}</p>
                  {g.items.length === 0 ? (
                    <p className="rounded-md border border-dashed border-border px-2 py-1.5 text-[11px] text-muted-foreground">
                      Sin registros
                    </p>
                  ) : (
                    <div className="grid gap-1.5">
                      {g.items.map((c, i) => (
                        <div
                          key={`${g.label}-${i}`}
                          className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-card px-2.5 py-2"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-xs font-bold text-foreground">
                              {c.bloque.tipoDocumento} · {c.paciente}
                            </p>
                            <p className="truncate text-[10px] text-muted-foreground">
                              Doc {c.documento || "—"}
                              {c.codigo ? ` · ${c.codigo}` : ""} · {fmtFechaHora(c.fechaBase)} · {c.estado}
                            </p>
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 rounded-md border-status-red/40 text-[11px] font-semibold text-status-red hover:bg-status-red/10"
                            onClick={() => onPDF(c)}
                          >
                            <FileText className="mr-1 h-3.5 w-3.5" /> Bitácora PDF
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cerrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
