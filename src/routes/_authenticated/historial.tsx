import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/backend-client";
import { registrarAuditoria } from "@/lib/auditoria.functions";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  Clock,
  ListTree,
  UserSearch,
  Eraser,
  MapPin,
  Plus,


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
  limpiarTexto,
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

type HistoricoCaso = Record<string, unknown> & {
  id: string;
  seccion: string | null;
  tipo_caso: string | null;
  fuente_hoja: string | null;
  fuente_archivo: string | null;
  radicado: string | null;
  paciente: string | null;
  documento: string | null;
  ips: string | null;
  estado: string | null;
  asegurador: string | null;
  fecha: string | null;
  detalle: string | null;
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

// Sedes (catálogo institucional). "TODAS LAS SEDES" = sin filtro de sede.
const SEDES = [
  "TODAS LAS SEDES",
  "PRINCIPAL",
  "CONSULTA ESPECIALIZADA",
  "SALA ROSA",
  "CLÍNICA GLORIA PATRICIA PINZÓN",
] as const;
// Por defecto NO se filtra por sede: el campo `unidad` de los casos entrantes
// guarda el SERVICIO (p. ej. URGENCIAS), no el nombre de la sede, de modo que un
// valor de sede por defecto ocultaba casos activos reales (bug "0 casos").
const SEDE_DEFAULT = "TODAS LAS SEDES";
// Servicios base garantizados; se complementan con el catálogo real de unidades.
const SERVICIOS_BASE = [
  "URGENCIAS",
  "HOSPITALIZACIÓN",
  "UCI",
  "QUIRÓFANO",
  "CONSULTA ESPECIALIZADA",
];

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

// Motivos de negación normalizados aceptados institucionalmente (rótulo final).
const MOTIVOS_NEGACION = [
  "RED NO CONTRATADA",
  "NO RECURSO HUMANO",
  "NO DISPONIBILIDAD DE UNIDAD",
  "NO DISPONIBILIDAD DE CAMAS POR SOBREOCUPACIÓN",
  "NO DISPONIBILIDAD DE INSUMO O TECNOLOGÍA",
  "POR NIVEL DE COMPLEJIDAD",
  "POR SOLICITUD DE AFILIACIÓN DE OFICIO",
  "FALTA DE DOCUMENTACIÓN",
  "OTRO",
];

// Mapa de normalización de claves crudas (snake_case / mayúsculas / variantes)
// hacia el rótulo institucional definitivo (1.4).
const MOTIVO_NORMALIZA: Record<string, string> = {
  RED_NO_CONTRATADA: "RED NO CONTRATADA",
  NO_RECURSO_HUMANO: "NO RECURSO HUMANO",
  NO_DISPONIBILIDAD_UNIDAD: "NO DISPONIBILIDAD DE UNIDAD",
  NO_DISPONIBILIDAD_CAMAS: "NO DISPONIBILIDAD DE CAMAS POR SOBREOCUPACIÓN",
  NO_DISPONIBILIDAD_INSUMO: "NO DISPONIBILIDAD DE INSUMO O TECNOLOGÍA",
  NIVEL_COMPLEJIDAD: "POR NIVEL DE COMPLEJIDAD",
  AFILIACION_OFICIO: "POR SOLICITUD DE AFILIACIÓN DE OFICIO",
  FALTA_DOCUMENTACION: "FALTA DE DOCUMENTACIÓN",
  OTRO: "OTRO",
};

// Quita tildes para comparaciones tolerantes.
function sinTildes(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

// Normaliza un valor CRUDO (de un campo estructurado o de `detalle`) a un motivo
// institucional. Devuelve "" si el texto NO corresponde a un motivo conocido,
// de modo que texto libre como "NO TENEMOS CONTRATO" no se use como motivo.
function normalizarMotivoNeg(raw: string | null | undefined): string {
  const clean = limpiarTexto(raw);
  if (!clean || clean === "—") return "";
  const up = sinTildes(clean).toUpperCase().trim();
  // 1. Coincidencia por clave snake_case / normalizada.
  const key = up.replace(/[\s-]+/g, "_");
  if (MOTIVO_NORMALIZA[key]) return MOTIVO_NORMALIZA[key];
  // 2. Coincidencia exacta / por inclusión con un rótulo institucional.
  const match = MOTIVOS_NEGACION.find((m) => {
    const mu = sinTildes(m).toUpperCase();
    return up === mu || up.includes(mu) || mu.includes(up);
  });
  return match || "";
}

// Detecta el motivo real de negación a partir de la RESPUESTA GENERADA
// (texto_ia), que es donde queda embebida la plantilla del motivo seleccionado.
function motivoNegDesdeTexto(textoIa: string | null | undefined): string {
  const t = sinTildes(limpiarTexto(textoIa)).toUpperCase();
  if (!t || t === "—") return "";
  if (t.includes("AFILIACION DE OFICIO") || t.includes("SIN SEGURIDAD SOCIAL"))
    return "POR SOLICITUD DE AFILIACIÓN DE OFICIO";
  if (t.includes("NIVEL DE COMPLEJIDAD")) return "POR NIVEL DE COMPLEJIDAD";
  if (t.includes("RED PRESTADORA CONTRATADA") || t.includes("NO INTEGRA LA RED"))
    return "RED NO CONTRATADA";
  if (t.includes("ALTA OCUPACION") || (t.includes("DISPONIBILIDAD DE CAMAS") && t.includes("OCUPAC")))
    return "NO DISPONIBILIDAD DE CAMAS POR SOBREOCUPACIÓN";
  if (t.includes("DISPONIBILIDAD DE LA ESPECIALIDAD")) return "NO RECURSO HUMANO";
  if (t.includes("DISPONIBILIDAD DE LA UNIDAD")) return "NO DISPONIBILIDAD DE UNIDAD";
  if (t.includes("INSUMO") || t.includes("TECNOLOG")) return "NO DISPONIBILIDAD DE INSUMO O TECNOLOGÍA";
  if (t.includes("FALTA DE DOCUMENTACION") || t.includes("DOCUMENTACION INCOMPLETA"))
    return "FALTA DE DOCUMENTACIÓN";
  return "";
}

// Determina el MOTIVO REAL de una negación entrante respetando la prioridad
// (1.3): 1) campo estructurado, 2) respuesta generada (texto_ia), 3) detalle
// SOLO si coincide con un motivo conocido. `detalle` nunca es la primera fuente.
function motivoRealNegacion(ev: Caso | undefined): string {
  if (!ev) return "";
  const r = ev as Record<string, unknown>;
  // 1. Campos estructurados posibles (compatibilidad / futuro).
  const estructCandidatos = [
    r.motivo_negacion,
    r.motivo,
    r.subtipo,
    r.clasificacion,
    r.tipo_negacion,
    r.causa_negacion,
    r.razon_negacion,
  ];
  for (const c of estructCandidatos) {
    const norm = normalizarMotivoNeg(typeof c === "string" ? c : undefined);
    if (norm) return norm;
  }
  // 2. Respuesta / plantilla generada.
  const desdeTexto = motivoNegDesdeTexto(ev.texto_ia);
  if (desdeTexto) return desdeTexto;
  // 3. Fallback: detalle, solo si normaliza a un motivo conocido.
  return normalizarMotivoNeg(ev.detalle);
}

// (compat) Devuelve un motivo normalizado a partir de un texto libre; usado por
// otros flujos (p.ej. cancelaciones) donde el texto sí representa el motivo.
function motivoNegacion(detalle: string | null | undefined): string {
  const raw = limpiarTexto(detalle);
  if (!raw || raw === "—") return "";
  const norm = normalizarMotivoNeg(raw);
  return norm || raw.trim();
}

// Texto que se mostrará en la columna OBSERVACIONES de un evento de ENTRANTES.
// Prioriza la RESPUESTA / PLANTILLA generada (texto_ia) sobre el motivo corto
// almacenado en `detalle`. Devuelve el texto limpio de marcas markdown.
function observacionEntrante(e: Caso): string {
  const generada = limpiarTexto(e.texto_ia);
  if (generada && generada !== "—") return generada;
  const det = limpiarTexto(e.detalle);
  if (det && det !== "—") return det;
  return "—";
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

// Rango de fechas (ISO) equivalente al filtro cliente `pasaPeriodo`, para
// aplicar server-side sobre `created_at` y evitar los topes de 1000/5000.
function periodoRange(periodo: Periodo, fecha?: Date): { start?: string; end?: string } {
  if (fecha) {
    const s = new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate());
    const e = new Date(s); e.setDate(e.getDate() + 1);
    return { start: s.toISOString(), end: e.toISOString() };
  }
  if (periodo === "Todos") return {};
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (periodo === "Hoy") return { start: startToday.toISOString() };
  if (periodo === "Esta semana") {
    const ws = new Date(startToday);
    ws.setDate(ws.getDate() - ((ws.getDay() + 6) % 7));
    return { start: ws.toISOString() };
  }
  if (periodo === "Este mes") {
    const s = new Date(now.getFullYear(), now.getMonth(), 1);
    return { start: s.toISOString() };
  }
  if (periodo === "Mes anterior") {
    const s = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const e = new Date(now.getFullYear(), now.getMonth(), 1);
    return { start: s.toISOString(), end: e.toISOString() };
  }
  return {};
}

const docBuscableServer = (doc: string): boolean =>
  doc.length >= 4 && /^\d+$/.test(doc);

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
  /** ID del caso en la tabla origen — usado para auditoría y export puntual. */
  casoId: string;
  /** Tabla origen: casos_entrantes | remisiones | domiciliarios | referencia_interna. */
  tabla: "casos_entrantes" | "remisiones" | "domiciliarios" | "referencia_interna";
  /** Vista de historial a la que pertenece — usado para reutilizar exportador. */
  vista: "entrantes" | "salientes" | "phd" | "interna";
};

type ResultadosBitacora = {
  entrantes: Construido[];
  salientes: Construido[];
  phd: Construido[];
  internas: Construido[];
};

const v = (x: unknown): string => (x == null ? "" : String(x).trim());
const joinList = (x: unknown): string => (Array.isArray(x) ? x.filter(Boolean).join(", ") : v(x));

const HISTORICOS_SELECT =
  "id,seccion,tipo_caso,fuente_hoja,fuente_archivo,radicado,paciente,documento,ips,estado,asegurador,fecha,detalle,created_at";

async function fetchHistoricosCasos(opts: {
  start?: string;
  end?: string;
  documento?: string;
}): Promise<HistoricoCaso[]> {
  // La tabla histórica supera los 20k registros. Para no traerla completa se
  // aplican filtros server-side (rango de `created_at` + documento cuando
  // aplica). Sin filtros: cap defensivo de 5000 registros más recientes POR
  // SECCIÓN (entrantes se importaron antes que salientes, por lo que un cap
  // global dejaba fuera todos los entrantes recientes).
  const hasFilter = !!(opts.start || opts.end || opts.documento);
  const perSection = hasFilter ? 20000 : 5000;
  const build = (seccion: string) => {
    let q = supabase
      .from("historicos_casos")
      .select(HISTORICOS_SELECT)
      .eq("archivado", false)
      .eq("seccion", seccion)
      .order("created_at", { ascending: false })
      .limit(perSection);
    if (opts.start) q = q.gte("created_at", opts.start);
    if (opts.end) q = q.lt("created_at", opts.end);
    if (opts.documento) q = q.eq("documento", opts.documento);
    return q;
  };
  const [ent, sal] = await Promise.all([build("entrante"), build("saliente")]);
  if (ent.error) throw ent.error;
  if (sal.error) throw sal.error;
  return [...((ent.data ?? []) as HistoricoCaso[]), ...((sal.data ?? []) as HistoricoCaso[])];
}


const historicoFecha = (h: HistoricoCaso): string => v(h.fecha) || v(h.created_at);
const historicoTextoMeta = (h: HistoricoCaso): string =>
  sinTildes(`${h.seccion ?? ""} ${h.tipo_caso ?? ""} ${h.fuente_hoja ?? ""} ${h.fuente_archivo ?? ""}`).toUpperCase();
const historicoTextoDetalle = (h: HistoricoCaso): string => sinTildes(h.detalle ?? "").toUpperCase();
const esHistoricoPHD = (h: HistoricoCaso): boolean => {
  const meta = historicoTextoMeta(h);
  const detalle = historicoTextoDetalle(h);
  // En los históricos antiguos PHD/PAD/O2 llega dentro de MOTIVO_ESTADO/OBSERVACIONES,
  // no como hoja separada. No se busca "ESPECIAL" en detalle porque todos los salientes
  // traen campos como ESPECIALIDAD_REMITENTE/RECEPTORA.
  return (
    /\b(PHD|PAD|O2|OXIGENO|DOMICILIARIO|DOMICILIARIOS)\b/.test(meta) ||
    /\b(PHD|PAD|O2|OXIGENO|DOMICILIARIO|DOMICILIARIOS)\b/.test(detalle) ||
    /\bESPECIALES?\b/.test(meta)
  );
};
const esHistoricoInterna = (h: HistoricoCaso): boolean => /\b(REF\.?\s*INTERNA|REFERENCIA\s*INTERNA|INTERNA)\b/.test(historicoTextoMeta(h));

function historicoAEntrante(h: HistoricoCaso): Caso {
  const fecha = historicoFecha(h);
  return {
    id: `hist-${h.id}`,
    codigo: h.radicado,
    tipo: h.tipo_caso || h.fuente_hoja || "HIST",
    cod_ref: null,
    documento: h.documento,
    nombres: h.paciente,
    apellidos: null,
    ips: h.ips,
    unidad: null,
    especialidad: null,
    estado: h.estado || estadoEntrante(h.tipo_caso || ""),
    fecha,
    fecha_vence: null,
    detalle: h.detalle || h.fuente_archivo || h.fuente_hoja || null,
    eapb: h.asegurador,
    regimen: null,
    texto_ia: null,
    created_at: v(h.created_at) || fecha,
  };
}

function historicoASaliente(h: HistoricoCaso): Remision {
  const fecha = historicoFecha(h);
  return {
    id: `hist-${h.id}`,
    codigo_radicacion: h.radicado,
    documento: h.documento,
    paciente: h.paciente,
    servicio: h.tipo_caso || h.fuente_hoja || "Histórico",
    ips_receptora: h.ips,
    asegurador: h.asegurador,
    eapb: h.asegurador,
    prioridad: null,
    estado: h.estado || "HISTÓRICO",
    fecha_radicado: fecha,
    fecha_inicio: fecha,
    texto_ia: null,
    created_at: v(h.created_at) || fecha,
    observaciones: h.detalle,
    remision_por: h.detalle,
    tipo_documento: "CC",
  } as Remision;
}

function historicoAGenerico(h: HistoricoCaso): Generico {
  const fecha = historicoFecha(h);
  return {
    id: `hist-${h.id}`,
    estado: h.estado || "HISTÓRICO",
    created_at: v(h.created_at) || fecha,
    paciente: h.paciente,
    documento: h.documento,
    tipo_documento: "CC",
    tipo_solicitud: h.tipo_caso || h.fuente_hoja || "Histórico",
    tipo_solicitud_detalle: h.detalle,
    eapb: h.asegurador,
    proveedor_prestador: h.ips,
    servicio: h.ips,
    fecha_inicio: fecha,
    fecha,
    codigo_radicacion: h.radicado,
    observaciones: h.detalle,
  };
}

function HistorialPage() {
  const { canEdit, isAdmin, user } = useAuth();
  const usuario =
    (user?.user_metadata?.nombre as string) || user?.email || "Usuario autenticado";
  const qc = useQueryClient();
  const [vista, setVista] = useState<Vista>("entrantes");
  const [tipo, setTipo] = useState<TipoFilter>("TODOS");
  const [salTipo, setSalTipo] = useState<SalFilter>("TODOS");
  const [genTipo, setGenTipo] = useState<GenFilter>("TODOS");
  const [periodo, setPeriodo] = useState<Periodo>("Todos");
  const [fechaEspecifica, setFechaEspecifica] = useState<Date | undefined>(undefined);
  const [ingresoFor, setIngresoFor] = useState<Grupo | null>(null);
  // Consulta por paciente (SEDE · documento · nombre)
  const [sede, setSede] = useState<string>(SEDE_DEFAULT);
  const [servicio] = useState<string>("TODOS LOS SERVICIOS");
  const [docBusca, setDocBusca] = useState("");
  const [buscarPacienteOpen, setBuscarPacienteOpen] = useState(false);
  // Estado inicial: barra "Últimos 10 casos" plegable + secuencia de caso desplegable.
  const [u10Abierto, setU10Abierto] = useState(false);
  const [casoExpandido, setCasoExpandido] = useState<string | null>(null);
  const [limite, setLimite] = useState(20);

  // Rango del período/fecha específica y documento normalizado, usados como
  // filtros server-side para no depender del cap de 1000/5000 registros.
  const { start: rangoStart, end: rangoEnd } = useMemo(
    () => periodoRange(periodo, fechaEspecifica),
    [periodo, fechaEspecifica],
  );
  const docTrimEarly = docBusca.trim();
  const docServer = docBuscableServer(docTrimEarly) ? docTrimEarly : "";

  const { data: casos, isLoading } = useQuery({
    queryKey: ["historial-casos", rangoStart ?? null, rangoEnd ?? null, docServer || null],
    queryFn: async () => {
      let q = supabase
        .from("casos_entrantes")
        .select(
          "id, codigo, tipo, cod_ref, documento, nombres, apellidos, ips, unidad, especialidad, estado, fecha, fecha_vence, detalle, eapb, regimen, texto_ia, created_at",
        )
        .order("created_at", { ascending: false })
        .limit(docServer ? 20000 : 3000);
      if (rangoStart) q = q.gte("created_at", rangoStart);
      if (rangoEnd) q = q.lt("created_at", rangoEnd);
      if (docServer) q = q.eq("documento", docServer);
      const { data, error } = await q;
      if (error) throw error;
      return data as Caso[];
    },
  });

  const { data: historicos, isLoading: loadingHist } = useQuery<HistoricoCaso[]>({
    queryKey: ["historicos-casos-importados", rangoStart ?? null, rangoEnd ?? null, docServer || null],
    queryFn: () => fetchHistoricosCasos({ start: rangoStart, end: rangoEnd, documento: docServer || undefined }),
  });

  const historicosEntrantes = useMemo(
    () => (historicos ?? []).filter((h) => h.seccion === "entrante").map(historicoAEntrante),
    [historicos],
  );

  const historicosSalientes = useMemo(
    () =>
      (historicos ?? [])
        .filter((h) => h.seccion === "saliente" && !esHistoricoPHD(h) && !esHistoricoInterna(h))
        .map(historicoASaliente),
    [historicos],
  );

  const historicosPhd = useMemo(
    () => (historicos ?? []).filter(esHistoricoPHD).map(historicoAGenerico),
    [historicos],
  );

  const historicosInternas = useMemo(
    () => (historicos ?? []).filter(esHistoricoInterna).map(historicoAGenerico),
    [historicos],
  );

  const { data: remisionesActivas, isLoading: loadingSal } = useQuery({
    queryKey: ["historial-remisiones-full", rangoStart ?? null, rangoEnd ?? null, docServer || null],
    queryFn: async () => {
      let q = supabase
        .from("remisiones")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(docServer || rangoStart || rangoEnd ? 20000 : 3000);
      if (rangoStart) q = q.gte("created_at", rangoStart);
      if (rangoEnd) q = q.lt("created_at", rangoEnd);
      if (docServer) q = q.eq("documento", docServer);
      const { data, error } = await q;
      if (error) throw error;
      return data as Remision[];
    },
  });

  const remisiones = useMemo<Remision[]>(
    () => [...(remisionesActivas ?? []), ...historicosSalientes],
    [remisionesActivas, historicosSalientes],
  );

  const { data: phd, isLoading: loadingPhd } = useQuery({
    queryKey: ["historial-domiciliarios", rangoStart ?? null, rangoEnd ?? null, docServer || null],
    queryFn: async () => {
      let q = supabase
        .from("domiciliarios")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(docServer || rangoStart || rangoEnd ? 20000 : 3000);
      if (rangoStart) q = q.gte("created_at", rangoStart);
      if (rangoEnd) q = q.lt("created_at", rangoEnd);
      if (docServer) q = q.eq("documento", docServer);
      const { data, error } = await q;
      if (error) throw error;
      return data as Generico[];
    },
  });

  const { data: internas, isLoading: loadingInt } = useQuery({
    queryKey: ["historial-internas", rangoStart ?? null, rangoEnd ?? null, docServer || null],
    queryFn: async () => {
      let q = supabase
        .from("referencia_interna")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(docServer || rangoStart || rangoEnd ? 20000 : 3000);
      if (rangoStart) q = q.gte("created_at", rangoStart);
      if (rangoEnd) q = q.lt("created_at", rangoEnd);
      if (docServer) q = q.eq("documento", docServer);
      const { data, error } = await q;
      if (error) throw error;
      return data as Generico[];
    },
  });

  const phdDatos = useMemo<Generico[]>(() => [...((phd ?? []) as Generico[]), ...historicosPhd], [phd, historicosPhd]);
  const internasDatos = useMemo<Generico[]>(
    () => [...((internas ?? []) as Generico[]), ...historicosInternas],
    [internas, historicosInternas],
  );

  const { data: pendientes, isLoading: loadingPen } = useQuery({
    queryKey: ["historial-pendientes", rangoStart ?? null, rangoEnd ?? null],
    queryFn: async () => {
      let q = supabase
        .from("pendientes")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(rangoStart || rangoEnd ? 20000 : 2000);
      if (rangoStart) q = q.gte("created_at", rangoStart);
      if (rangoEnd) q = q.lt("created_at", rangoEnd);
      const { data, error } = await q;
      if (error) throw error;
      return data as Generico[];
    },
  });

  // Catálogo real de servicios/unidades (para el filtro SERVICIO). Se reutiliza
  // el catálogo existente; no se crea uno paralelo.
  const { data: catServicios } = useQuery({
    queryKey: ["historial-cat-servicios"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("catalogos")
        .select("valor")
        .in("tipo", ["UNIDAD", "UNIDAD_REQUERIDA"])
        .eq("activo", true)
        .order("valor", { ascending: true });
      if (error) throw error;
      return (data ?? []).map((r) => v((r as Record<string, unknown>).valor)).filter(Boolean);
    },
  });

  const servicioOpciones = useMemo(() => {
    const set = new Set<string>(["TODOS LOS SERVICIOS", ...SERVICIOS_BASE]);
    for (const s of catServicios ?? []) set.add(s.toUpperCase());
    return Array.from(set);
  }, [catServicios]);

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
    for (const c of [...(casos ?? []), ...historicosEntrantes]) {
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
  }, [casos, historicosEntrantes]);

  // El documento de la consulta por paciente tiene prioridad sobre el buscador
  // libre; el documento normalizado alimenta el término de filtrado.
  const docTrim = docBusca.trim();
  const term = docTrim.toLowerCase();

  const servicioActivo = servicio !== "TODOS LOS SERVICIOS";
  const sedeActiva = sede !== "TODAS LAS SEDES";
  const su = sinTildes(servicio).toUpperCase();
  const seu = sinTildes(sede).toUpperCase();
  const matchServicio = (txt: string) =>
    !servicioActivo || sinTildes(txt).toUpperCase().includes(su);
  // La sede sólo excluye cuando el registro tiene un valor de unidad/sede que
  // no coincide; registros sin ese dato siempre pasan (evita ocultar todo).
  const matchSede = (txt: string) => {
    if (!sedeActiva) return true;
    const t = sinTildes(txt).toUpperCase().trim();
    return t === "" || t.includes(seu);
  };

  const busquedaActiva =
    term !== "" ||
    tipo !== "TODOS" ||
    salTipo !== "TODOS" ||
    genTipo !== "TODOS" ||
    periodo !== "Todos" ||
    !!fechaEspecifica ||
    servicioActivo;

  const pasaPeriodo = (raw: string | null) =>
    fechaEspecifica ? mismoDia(raw, fechaEspecifica) : dentroPeriodo(raw, periodo);

  // Índice de pacientes (para la búsqueda avanzada por nombre/apellido).
  const pacientesIndex = useMemo<PacienteIndex[]>(() => {
    const map = new Map<string, PacienteIndex>();
    const add = (documento: string, nombres: string, apellidos: string) => {
      const doc = documento.trim();
      if (!doc || map.has(doc)) return;
      map.set(doc, {
        documento: doc,
        nombres: nombres.trim(),
        apellidos: apellidos.trim(),
        nombre: [nombres, apellidos].filter(Boolean).join(" ").trim(),
      });
    };
    for (const c of [...(casos ?? []), ...historicosEntrantes])
      add(v(c.documento), v(c.nombres), v(c.apellidos));
    for (const r of remisiones ?? []) add(v(r.documento), v(r.paciente), "");
    for (const r of [...phdDatos, ...internasDatos]) add(v(r.documento), v(r.paciente), "");
    return Array.from(map.values());
  }, [casos, historicosEntrantes, remisiones, phdDatos, internasDatos]);

  const pacienteNombre = useMemo(() => {
    if (!docTrim) return "";
    const dn = docTrim.toLowerCase();
    return pacientesIndex.find((p) => p.documento.toLowerCase() === dn)?.nombre ?? "";
  }, [docTrim, pacientesIndex]);
  const pacienteExiste = pacienteNombre !== "" || (docTrim !== "" &&
    pacientesIndex.some((p) => p.documento.toLowerCase() === docTrim.toLowerCase()));

  const limpiarConsulta = () => {
    setDocBusca("");
    setSede(SEDE_DEFAULT);
    setTipo("TODOS");
    setSalTipo("TODOS");
    setGenTipo("TODOS");
    setPeriodo("Todos");
    setFechaEspecifica(undefined);
    setLimite(20);
    setU10Abierto(false);
    setCasoExpandido(null);
  };

  const gruposF = useMemo(
    () =>
      grupos.filter((g) => {
        if (tipo !== "TODOS" && !tieneTipo(g.eventos, tipo)) return false;
        if (!pasaPeriodo(g.base.fecha || g.base.created_at)) return false;
        if (!matchServicio(`${g.base.unidad ?? ""} ${g.base.especialidad ?? ""}`)) return false;
        if (!matchSede(`${g.base.unidad ?? ""}`)) return false;
        if (!term) return true;
        const hay = g.eventos
          .map((e) => `${e.codigo ?? ""} ${e.documento ?? ""} ${e.nombres ?? ""} ${e.apellidos ?? ""} ${e.ips ?? ""}`)
          .join(" ")
          .toLowerCase();
        return hay.includes(term);
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [grupos, tipo, periodo, fechaEspecifica, term, servicio, sede],
  );

  const remisionesF = useMemo(
    () =>
      (remisiones ?? []).filter((r) => {
        if (salTipo !== "TODOS" && !(r.estado || "").toUpperCase().includes(salTipo)) return false;
        if (!pasaPeriodo((r.fecha_radicado as string) || r.created_at)) return false;
        if (!matchServicio(`${v(r.servicio)} ${v((r as Record<string, unknown>).especialidad_receptora)}`)) return false;
        if (!term) return true;
        const hay = `${r.codigo_radicacion ?? ""} ${r.documento ?? ""} ${r.paciente ?? ""} ${r.ips_receptora ?? ""} ${r.servicio ?? ""}`.toLowerCase();
        return hay.includes(term);
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [remisiones, salTipo, periodo, fechaEspecifica, term, servicio],
  );

  const filtraGenerico = (rows: Generico[], campos: (r: Generico) => string) =>
    rows.filter((r) => {
      if (genTipo !== "TODOS") {
        const e = (r.estado || "").toUpperCase();
        if (genTipo === "CERRADO" && !/COMPLET|CERRAD|CULMIN/.test(e)) return false;
        if (genTipo !== "CERRADO" && !e.includes(genTipo)) return false;
      }
      if (!pasaPeriodo((r.fecha_inicio as string) || (r.fecha as string) || r.created_at)) return false;
      if (!matchServicio(`${v(r.servicio)} ${v(r.tipo_solicitud)} ${v((r as Record<string, unknown>).unidad)}`)) return false;
      if (!term) return true;
      return campos(r).toLowerCase().includes(term);
    });

  const phdF = useMemo(
    () => filtraGenerico(phdDatos, (r) => `${v(r.paciente)} ${v(r.documento)} ${v(r.tipo_solicitud)} ${v(r.eapb)} ${v(r.codigo_radicacion)}`),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [phdDatos, genTipo, periodo, fechaEspecifica, term, servicio],
  );
  const internasF = useMemo(
    () => filtraGenerico(internasDatos, (r) => `${v(r.paciente)} ${v(r.documento)} ${v(r.tipo_solicitud)} ${v(r.servicio)} ${v(r.eapb)}`),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [internasDatos, genTipo, periodo, fechaEspecifica, term, servicio],
  );
  const pendientesF = useMemo(
    () => filtraGenerico((pendientes ?? []) as Generico[], (r) => `${v(r.paciente_asunto)} ${v(r.tipo_pendiente)} ${v(r.ips_area)} ${v(r.prioridad)}`),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pendientes, genTipo, periodo, fechaEspecifica, term, servicio],
  );

  // Listas visibles: sin búsqueda activa, sólo los últimos `limite` (20 por
  // defecto) con botón VER MÁS; con búsqueda activa se muestran todos los
  // resultados reales.
  const cap = <T,>(arr: T[]): T[] => (busquedaActiva ? arr : arr.slice(0, limite));
  const gruposV = cap(gruposF);
  const remisionesV = cap(remisionesF);
  const phdV = cap(phdF);
  const internasV = cap(internasF);
  const fullLen =
    vista === "entrantes" ? gruposF.length
    : vista === "salientes" ? remisionesF.length
    : vista === "phd" ? phdF.length
    : vista === "interna" ? internasF.length
    : pendientesF.length;
  const hayMas = !busquedaActiva && fullLen > limite;

  const mensajeVacio = !busquedaActiva
    ? "NO HAY CASOS REGISTRADOS EN ESTA CATEGORÍA."
    : docTrim && !pacienteExiste
      ? "NO SE ENCONTRÓ UN PACIENTE CON EL DOCUMENTO INGRESADO."
      : docTrim && pacienteExiste
        ? "EL PACIENTE FUE ENCONTRADO, PERO NO TIENE REGISTROS EN ESTA CATEGORÍA Y CON LOS FILTROS ACTUALES."
        : "Sin coincidencias";


  // Mensajes recientes
  const mensajes = useMemo<MensajeItem[]>(() => {
    if (vista === "entrantes") {
      return [...(casos ?? []), ...historicosEntrantes]
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
  }, [vista, casos, historicosEntrantes, remisiones]);

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
      await registrarAuditoria({
        data: { accion, modulo: "historial", tabla: "varios", detalles },
      });
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
    // 2.1 Negación: usa el MOTIVO REAL respetando la prioridad estructurado >
    // respuesta generada (texto_ia) > detalle normalizado. `detalle` nunca es la
    // primera fuente. La negación es terminal y tiene prioridad.
    if (has("NEG")) {
      const neg = g.eventos.find((e) => (e.tipo || "").toUpperCase().includes("NEG"));
      const motivo = motivoRealNegacion(neg);
      return motivo ? `NEGACIÓN POR ${motivo}` : "NEGACIÓN";
    }
    // 2.5 CRUE.
    if (has("CRUE")) {
      const crue = g.eventos.find((e) => (e.tipo || "").toUpperCase().includes("CRUE"));
      const sub = limpiarTexto(crue?.detalle);
      return sub && sub !== "—" ? `Caso CRUE — ${sub}` : "Caso CRUE";
    }
    // 2.4 Cancelación de reserva (con motivo si existe).
    if (has("CAN")) {
      const can = g.eventos.find((e) => (e.tipo || "").toUpperCase().includes("CAN"));
      const motivo = motivoNegacion(can?.detalle);
      return motivo ? `Cancelación de reserva por ${motivo}` : "Cancelación de reserva";
    }
    // 2.2 Aceptación con ingreso confirmado.
    if (has("ING")) return "Aceptación con ingreso confirmado";
    // 2.3 Aceptación con ampliación de reserva otorgada (sin ingreso ni cancelación).
    if (has("AMP")) return "Aceptación con ampliación de reserva otorgada";
    // 2.2 Aceptación sin ingreso confirmado (redacción consistente).
    if (has("ACEP")) return "Aceptación con espera de ingreso";
    return g.estadoFinal.label;
  };

  const buildEntrante = (g: Grupo): Construido => {
    const b = g.base;
    const ingreso = g.eventos.find((e) => (e.tipo || "").toUpperCase().includes("ING"));
    const tiposEv = g.eventos.map((e) => (e.tipo || "").toUpperCase());
    // El flujo no requiere especialidad/unidad/ingreso cuando el caso termina en negación
    // o cancelación sin ingreso registrado.
    const sinIngreso =
      !ingreso && (tiposEv.some((t) => t.includes("NEG")) || tiposEv.some((t) => t.includes("CAN")));
    const naSiNoAplica = (val: string) => (sinIngreso ? "NO APLICA" : val || "—");
    const datosPaciente: CampoPDF[] = [
      { label: "Apellidos", value: v(b.apellidos) || "—" },
      { label: "Nombres", value: v(b.nombres) || "—" },
      { label: "Tipo documento", value: "CC" },
      { label: "Número documento", value: v(b.documento) || "—" },
      { label: "Edad", value: fmtEdad(b.edad) },
      { label: "Entidad responsable", value: v(b.eapb) || v((b as Record<string, unknown>).aseguramiento) || "—" },
      { label: "Régimen", value: v(b.regimen) || "—" },
      { label: "Teléfono", value: v((b as Record<string, unknown>).telefono) || "—" },
    ];
    const datosReferencia: CampoPDF[] = [
      { label: "Tipo de trámite", value: "REMISIONES ENTRANTES" },
      { label: "IPS remitente", value: v(b.ips) || "—" },
      { label: "Estado final del caso", value: estadoFinalEntrante(g) },
      { label: "Códigos del caso", value: g.eventos.map((e) => v(e.codigo)).filter(Boolean).join(" · ") || "—" },
      { label: "Especialidad", value: naSiNoAplica(v(b.especialidad)) },
      { label: "Unidad / Servicio", value: naSiNoAplica(v(b.unidad)) },
      {
        label: "Fecha y hora de ingreso",
        value: ingreso ? fmtFechaHora(ingreso.created_at || ingreso.fecha) : sinIngreso ? "NO APLICA" : "—",
      },
    ];
    const seguimientos: SeguimientoPDF[] = g.eventos
      .map((e) => ({
        fecha: fmtFechaHora(e.created_at || e.fecha),
        entidad: v(e.ips) || "—",
        observaciones: observacionEntrante(e),
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
      casoId: v(b.id) || g.key,
      tabla: "casos_entrantes",
      vista: "entrantes",
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
      { label: "Entidad responsable", value: eapb || "—" },
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
      casoId: r.id,
      tabla: "remisiones",
      vista: "salientes",
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
      { label: "Entidad responsable", value: eapb || "—" },
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
      casoId: r.id,
      tabla: "domiciliarios",
      vista: "phd",
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
      { label: "Entidad responsable", value: eapb || "—" },
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
      casoId: r.id,
      tabla: "referencia_interna",
      vista: "interna",
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
      phd: proc(phdDatos.filter((r) => match(r.documento)).map(buildPHD)),
      internas: proc(internasDatos.filter((r) => match(r.documento)).map(buildInterna)),
    };
  };

  // Eventos del paciente consultado (historia clínica cronológica tipo ÍNDIGO).
  const consultaItems = useMemo<Construido[]>(() => {
    if (!docTrim) return [];
    const r = buscarBitacoras(docTrim);
    return [...r.entrantes, ...r.salientes, ...r.phd, ...r.internas];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docTrim, grupos, remisiones, phdDatos, internasDatos]);

  const pdfConstruido = (c: Construido) => generarUno(c, c.bloque.tipoDocumento);

  const pdfConsolidado = (cs: Construido[], doc: string, filtros: string) => {
    if (cs.length === 0) {
      toast.info("No hay casos para consolidar.");
      return;
    }
    // En consolidado se inyecta "Fecha de la gestión" en cada bloque de DATOS DE REFERENCIA
    // (justo después del Tipo de trámite) para diferenciar varias gestiones del mismo paciente.
    const bloques = cs.map((c) => {
      const dr = [...c.bloque.datosReferencia];
      const idx = dr.findIndex((f) => f.label === "Tipo de trámite");
      const campoFecha: CampoPDF = { label: "Fecha de la gestión", value: fmtFechaHora(c.fechaBase) };
      if (idx >= 0) dr.splice(idx + 1, 0, campoFecha);
      else dr.unshift(campoFecha);
      return { ...c.bloque, datosReferencia: dr };
    });
    void generarBitacoraConsolidadaPDF({
      referencia: doc || cs[0].documento || "consolidada",
      datosPaciente: cs[0].datosPaciente,
      bloques,
      usuario,
    });
    auditar("exportar_pdf_bitacora_consolidada", { documento: doc, casos: cs.length, filtros });
    toast.success("Bitácora consolidada generada");
  };

  // ---- Etapa 3 · Menú contextual enriquecido -----------------------------
  const [infoCaso, setInfoCaso] = useState<Construido | null>(null);
  const [audCaso, setAudCaso] = useState<Construido | null>(null);

  const copiarCodigo = (c: Construido) => {
    const cod = (c.codigo || "").trim();
    if (!cod) {
      toast.info("Este caso no tiene código de gestión.");
      return;
    }
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      void navigator.clipboard.writeText(cod);
      toast.success(`Código copiado: ${cod}`);
      auditar("copiar_codigo_gestion", { caso: c.casoId, tabla: c.tabla, codigo: cod });
    } else {
      toast.error("El navegador no permite copiar automáticamente.");
    }
  };

  const exportarCasoExcel = (c: Construido) => {
    let sec: Seccion | null = null;
    if (c.vista === "entrantes") {
      const grupo = gruposF.find((g) => v(g.base.id) === c.casoId);
      if (grupo) {
        sec = seccionRecibidas([
          {
            base: grupo.base as unknown as GrupoEntrante["base"],
            eventos: grupo.eventos as unknown as Record<string, unknown>[],
            estadoLabel: grupo.estadoFinal.label,
          },
        ]);
      }
    } else if (c.vista === "salientes") {
      const row = (remisionesF as Remision[]).find((r) => r.id === c.casoId);
      if (row) sec = seccionRemisiones([row as unknown as Record<string, unknown>], segMap);
    } else if (c.vista === "phd") {
      const row = (phdF as Generico[]).find((r) => r.id === c.casoId);
      if (row) sec = seccionPHD([row as unknown as Record<string, unknown>], segMap);
    } else if (c.vista === "interna") {
      const row = (internasF as Generico[]).find((r) => r.id === c.casoId);
      if (row) sec = seccionInternas([row as unknown as Record<string, unknown>], segMap);
    }
    if (!sec || sec.rows.length === 0) {
      toast.info("No fue posible localizar el caso para exportar.");
      return;
    }
    const nombre = `caso_${(c.referencia || c.casoId || "sin_ref").replace(/[^\w\-]+/g, "_")}`;
    descargarLibro([sec], usuario, `Caso=${c.referencia}; Vista=${c.vista}`, nombre);
    auditar("exportar_excel_caso", { caso: c.casoId, tabla: c.tabla, vista: c.vista });
    toast.success("Excel del caso generado");
  };





  const cargando =
    vista === "entrantes" ? isLoading || loadingHist
    : vista === "salientes" ? loadingSal || loadingHist
    : vista === "phd" ? loadingPhd || loadingHist
    : vista === "interna" ? loadingInt || loadingHist
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
      <AppHeader title="Referencia y Contrarreferencia" subtitle="Historial Total" />

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
                  onClick={() => {
                    setVista(vw.key);
                    setLimite(20);
                    setCasoExpandido(null);
                  }}
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

        {/* CONSULTA POR PACIENTE (SEDE · documento · nombre) */}
        <div className="mb-3 rounded-xl border border-border bg-muted/30 p-2.5">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
            Consulta por paciente
          </p>
          <div className="flex flex-wrap items-end gap-2">
            <div className="grid gap-1">
              <Label className="text-[10px] uppercase text-muted-foreground">Sede</Label>
              <Select value={sede} onValueChange={setSede}>
                <SelectTrigger className="h-9 w-[13rem] text-xs">
                  <MapPin className="mr-1 h-3.5 w-3.5 text-muted-foreground" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SEDES.map((s) => (
                    <SelectItem key={s} value={s} className="text-xs">
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1">
              <Label className="text-[10px] uppercase text-muted-foreground">Documento del paciente</Label>
              <div className="flex items-center gap-1.5">
                <Input
                  className="h-9 w-[11rem] text-xs"
                  placeholder="N.º documento"
                  value={docBusca}
                  onChange={(e) => setDocBusca(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter") return;
                    e.preventDefault();
                    const doc = docBusca.trim();
                    if (doc === "") {
                      setBuscarPacienteOpen(true);
                      return;
                    }
                    setDocBusca(doc);
                    setLimite(20);
                    setCasoExpandido(null);
                  }}
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-9 w-9 shrink-0 p-0"
                  aria-label="BUSCAR PACIENTE"
                  title="Buscar por documento; vacío abre la búsqueda avanzada"
                  onClick={() => {
                    const doc = docBusca.trim();
                    if (doc === "") {
                      setBuscarPacienteOpen(true);
                      return;
                    }
                    setDocBusca(doc);
                    setLimite(20);
                    setCasoExpandido(null);
                  }}
                >
                  {docBusca.trim() === "" ? <UserSearch className="h-4 w-4" /> : <Search className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            {docTrim && (
              <div className="grid gap-1">
                <Label className="text-[10px] uppercase text-muted-foreground">Nombre del paciente</Label>
                <div className="flex h-9 items-center rounded-md border border-border bg-card px-2.5 text-xs font-semibold uppercase text-foreground">
                  {(pacienteNombre || "Paciente no encontrado").toUpperCase().replace(/\s+/g, " ")}
                </div>
              </div>
            )}
            <div className="ml-auto flex items-end gap-1.5">
              <Button type="button" size="sm" variant="outline" className="h-9" onClick={limpiarConsulta}>
                <Eraser className="mr-1.5 h-4 w-4" /> Limpiar búsqueda
              </Button>
            </div>
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

        {/* Consulta por paciente activa: cabecera + casos separados por case_id.
            Sin búsqueda: barra plegable "Últimos 10 casos". */}
        {docTrim ? (
          cargando ? (
            <p className="py-10 text-center text-sm text-muted-foreground">Cargando…</p>
          ) : !pacienteExiste ? (
            <div className="rounded-2xl border border-border bg-card py-14 text-center shadow-sm">
              <p className="text-sm font-semibold text-foreground">NO SE ENCONTRÓ UN PACIENTE CON EL DOCUMENTO INGRESADO.</p>
            </div>
          ) : (
            <PacienteResultado
              vista={vista}
              nombre={pacienteNombre}
              documento={docTrim}
              entrantes={gruposF}
              salientes={remisionesF as Remision[]}
              phd={phdF as Generico[]}
              internas={internasF as Generico[]}
              buildEntrante={buildEntrante}
              buildSaliente={buildSaliente}
              buildPHD={buildPHD}
              buildInterna={buildInterna}
              canEdit={canEdit}
              onConfirmar={(g) => setIngresoFor(g)}
              casoExpandido={casoExpandido}
              onToggleCaso={(k) => setCasoExpandido((p) => (p === k ? null : k))}
              onBitacoraCaso={pdfConstruido}
              onBitacoraUnificada={pdfConsolidado}
              onInfoCaso={(c) => setInfoCaso(c)}
              onCopiarCodigo={copiarCodigo}
              onExportarExcelCaso={exportarCasoExcel}
              onVerAuditoriaCaso={(c) => setAudCaso(c)}
              puedeAuditar={isAdmin}
            />
          )
        ) : cargando ? (
          <p className="py-10 text-center text-sm text-muted-foreground">Cargando…</p>
        ) : (
          <Ultimos10Bar
            abierto={u10Abierto}
            onToggle={() => setU10Abierto((o) => !o)}
            total={Math.min(fullLen, 10)}
          >
            {fullLen === 0 ? (
              <p className="py-6 text-center text-xs font-semibold text-muted-foreground">
                NO HAY CASOS REGISTRADOS EN ESTA CATEGORÍA.
              </p>
            ) : vista === "entrantes" ? (
              <div className="grid gap-2">
                {gruposF.slice(0, 10).map((g) => (
                  <CasoCard key={g.key} grupo={g} canEdit={canEdit} onConfirmar={() => setIngresoFor(g)} onPDF={() => pdfEntrante(g)} />
                ))}
              </div>
            ) : vista === "salientes" ? (
              <div className="grid gap-2">
                {(remisionesF as Remision[]).slice(0, 10).map((r) => (
                  <RemisionCard key={r.id} remision={r} onPDF={() => pdfSaliente(r)} />
                ))}
              </div>
            ) : vista === "phd" ? (
              <div className="grid gap-2">
                {(phdF as Generico[]).slice(0, 10).map((r) => (
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
                {(internasF as Generico[]).slice(0, 10).map((r) => (
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
          </Ultimos10Bar>
        )}
      </Panel>



      <IngresoDialog grupo={ingresoFor} onClose={() => setIngresoFor(null)} onConfirmar={handleConfirmarIngreso} />
      <BuscarPacienteDialog
        open={buscarPacienteOpen}
        onClose={() => setBuscarPacienteOpen(false)}
        pacientes={pacientesIndex}
        onPick={(documento) => {
          setDocBusca(documento.trim());
          setLimite(20);
        }}
      />

      <InfoCasoDialog caso={infoCaso} onClose={() => setInfoCaso(null)} />
      <AuditoriaCasoDialog caso={audCaso} onClose={() => setAudCaso(null)} habilitado={isAdmin} />

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

// (VerMasButton y MensajesRecientesButton retirados: el listado ahora usa
// "Últimos 10 casos" y los mensajes se muestran en el Dashboard Operativo Entrantes.)

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

type TramiteKey = "todos" | "entrantes" | "salientes" | "phd" | "internas";

const TRAMITE_OPS: { key: TramiteKey; label: string }[] = [
  { key: "todos", label: "Todos" },
  { key: "entrantes", label: "Entrantes" },
  { key: "salientes", label: "Salientes" },
  { key: "phd", label: "PHD/PAD/O2/Especiales" },
  { key: "internas", label: "Referencias internas" },
];



// ---- Línea de tiempo del paciente (referencia funcional ÍNDIGO) ----
type LineaEvento = {
  orden: number;
  fecha: string;
  tramite: string;
  codigo: string;
  color: StatusColor;
  accion: string;
  entidad: string;
  estado: string;
  observaciones: string;
  funcionario: string;
};

const TRAMITE_COLOR: Record<string, StatusColor> = {
  "REMISIÓN ENTRANTE": "sky",
  "REMISIÓN SALIENTE": "green",
  "PHD / PAD / O2 / ESPECIALES": "amber",
  "REFERENCIA INTERNA": "red",
};

function construirLineaTiempo(items: Construido[]): LineaEvento[] {
  const out: LineaEvento[] = [];
  for (const c of items) {
    const color = TRAMITE_COLOR[c.bloque.tipoDocumento] ?? "sky";
    if (c.bloque.seguimientos.length === 0) {
      out.push({
        orden: new Date(c.fechaBase || 0).getTime(),
        fecha: fmtFechaHora(c.fechaBase),
        tramite: c.bloque.tipoDocumento,
        codigo: c.codigo,
        color,
        accion: "REGISTRO",
        entidad: "—",
        estado: c.estado || "—",
        observaciones: "—",
        funcionario: "—",
      });
      continue;
    }
    for (const s of c.bloque.seguimientos) {
      out.push({
        orden: s._orden ?? new Date(c.fechaBase || 0).getTime(),
        fecha: s.fecha,
        tramite: c.bloque.tipoDocumento,
        codigo: c.codigo,
        color,
        accion: s.accion || "—",
        entidad: s.entidad || "—",
        estado: s.estado || "—",
        observaciones: s.observaciones || "—",
        funcionario: s.funcionario || "—",
      });
    }
  }
  out.sort((a, b) => b.orden - a.orden);
  return out;
}

function resumenPaciente(items: Construido[]): { nombre: string; campos: CampoPDF[] } {
  const c = items.find((x) => x.datosPaciente.length > 0) ?? items[0];
  if (!c) return { nombre: "", campos: [] };
  return { nombre: c.paciente, campos: c.datosPaciente };
}

function LineaTiempoPaciente({ items, documento }: { items: Construido[]; documento: string }) {
  const eventos = useMemo(() => construirLineaTiempo(items), [items]);
  const { nombre, campos } = useMemo(() => resumenPaciente(items), [items]);
  const campoVal = (label: string) => campos.find((c) => c.label === label)?.value || "—";

  if (eventos.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card py-10 text-center">
        <p className="text-sm font-semibold text-foreground">Sin eventos</p>
        <p className="text-xs text-muted-foreground">No hay movimientos registrados para este paciente.</p>
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      {/* Encabezado de identidad del paciente (ÍNDIGO) */}
      <div className="rounded-xl border border-status-blue/30 bg-status-blue/5 px-3 py-2.5">
        <p className="text-sm font-extrabold uppercase tracking-wide text-status-blue">
          {nombre || "Paciente sin nombre"}
        </p>
        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
          <span><b className="text-foreground">Documento:</b> {campoVal("Tipo documento")} {documento}</span>
          <span><b className="text-foreground">Edad:</b> {campoVal("Edad")}</span>
          <span><b className="text-foreground">Entidad:</b> {campoVal("Entidad responsable")}</span>
          <span><b className="text-foreground">Régimen:</b> {campoVal("Régimen")}</span>
          <span><b className="text-foreground">Teléfono:</b> {campoVal("Teléfono")}</span>
        </div>
        <p className="mt-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          {eventos.length} evento(s) · orden cronológico (más reciente primero)
        </p>
      </div>

      {/* Timeline */}
      <div className="relative ml-1 border-l-2 border-border pl-4">
        {eventos.map((e, i) => (
          <div key={i} className="relative pb-3 last:pb-0">
            <span
              className={`absolute -left-[1.32rem] top-1 h-3 w-3 rounded-full border-2 border-card ${cardBorder[e.color].replace("border-l-", "bg-")}`}
            />
            <div className="rounded-lg border border-border bg-card px-2.5 py-2 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide ${statusBadge[e.color]}`}>
                    {e.tramite}
                  </span>
                  {e.codigo && <span className="font-mono text-[10px] font-semibold text-status-blue">{e.codigo}</span>}
                  <span className="text-[11px] font-bold uppercase text-foreground">{e.accion}</span>
                </div>
                <span className="font-mono text-[10px] text-muted-foreground">{e.fecha}</span>
              </div>
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-muted-foreground">
                {e.entidad !== "—" && <span><b className="text-foreground">Entidad:</b> {e.entidad}</span>}
                {e.estado !== "—" && <span><b className="text-foreground">Estado:</b> {e.estado}</span>}
                {e.funcionario !== "—" && <span><b className="text-foreground">Gestor:</b> {e.funcionario}</span>}
              </div>
              {e.observaciones !== "—" && (
                <p className="mt-1 whitespace-pre-wrap break-words text-[11px] leading-snug text-foreground">
                  {e.observaciones}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function MenuBtn({
  icon: Icon,
  label,
  onClick,
  danger,
}: {
  icon: typeof FileText;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-xs font-medium transition hover:bg-muted"
    >
      <Icon className={`h-4 w-4 ${danger ? "text-status-red" : "text-muted-foreground"}`} /> {label}
    </button>
  );
}

// Cabecera del paciente con menú contextual (Ver todos / Bitácora unificada).
function PacienteCabecera({
  nombre,
  documento,
  resumen,
  totalCasos,
  onBitacoraUnificada,
}: {
  nombre: string;
  documento: string;
  resumen: { tipoDoc: string; edad: string; entidad: string; regimen: string; telefono: string };
  totalCasos: number;
  onBitacoraUnificada: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="w-full rounded-xl border border-status-blue/30 bg-status-blue/5 px-3 py-2.5 text-left transition hover:bg-status-blue/10"
        >
          <p className="text-sm font-extrabold uppercase tracking-wide text-status-blue">
            {nombre || "Paciente sin nombre"}
          </p>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
            <span><b className="text-foreground">Documento:</b> {resumen.tipoDoc} {documento}</span>
            <span><b className="text-foreground">Edad:</b> {resumen.edad}</span>
            <span><b className="text-foreground">Entidad:</b> {resumen.entidad}</span>
            <span><b className="text-foreground">Régimen:</b> {resumen.regimen}</span>
            <span><b className="text-foreground">Teléfono:</b> {resumen.telefono}</span>
          </div>
          <p className="mt-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            {totalCasos} caso(s) en esta subventana · clic para acciones
          </p>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-1.5">
        <MenuBtn icon={ListTree} label="Ver todos los casos del paciente" onClick={() => setOpen(false)} />
        <MenuBtn
          icon={FileText}
          label="Generar bitácora unificada"
          onClick={() => {
            onBitacoraUnificada();
            setOpen(false);
          }}
        />
        <p className="px-2 pb-1 pt-0.5 text-[10px] text-muted-foreground">
          La bitácora unificada incluye todos los casos de esta subventana.
        </p>
        <MenuBtn icon={X} label="Cancelar" onClick={() => setOpen(false)} danger />
      </PopoverContent>
    </Popover>
  );
}

// Fila de un caso individual con menú contextual y secuencia desplegable.
function CasoConMenu({
  expanded,
  onVerSecuencia,
  onBitacora,
  onInfo,
  onCopiarCodigo,
  onExportarExcel,
  onVerAuditoria,
  puedeAuditar,
  codigo,
  sequenceItems,
  documento,
  children,
}: {
  expanded: boolean;
  onVerSecuencia: () => void;
  onBitacora: () => void;
  onInfo: () => void;
  onCopiarCodigo: () => void;
  onExportarExcel: () => void;
  onVerAuditoria: () => void;
  puedeAuditar: boolean;
  codigo: string;
  sequenceItems: Construido[];
  documento: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const tieneCodigo = codigo.trim().length > 0;
  return (
    <div>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <div role="button" tabIndex={0} className="cursor-pointer">
            {children}
          </div>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-72 p-1.5">
          <MenuBtn
            icon={Search}
            label="Información rápida del caso"
            onClick={() => {
              onInfo();
              setOpen(false);
            }}
          />
          <MenuBtn
            icon={Clock}
            label={expanded ? "Ocultar historial completo" : "Ver historial completo"}
            onClick={() => {
              onVerSecuencia();
              setOpen(false);
            }}
          />
          <MenuBtn
            icon={FileText}
            label="Exportar bitácora PDF de este caso"
            onClick={() => {
              onBitacora();
              setOpen(false);
            }}
          />
          {tieneCodigo && (
            <MenuBtn
              icon={Copy}
              label="Copiar código de gestión"
              onClick={() => {
                onCopiarCodigo();
                setOpen(false);
              }}
            />
          )}
          <MenuBtn
            icon={FileSpreadsheet}
            label="Exportar este caso a Excel"
            onClick={() => {
              onExportarExcel();
              setOpen(false);
            }}
          />
          {puedeAuditar && (
            <MenuBtn
              icon={ListTree}
              label="Ver auditoría del caso"
              onClick={() => {
                onVerAuditoria();
                setOpen(false);
              }}
            />
          )}
          <MenuBtn icon={X} label="Cancelar" onClick={() => setOpen(false)} danger />
        </PopoverContent>
      </Popover>
      {expanded && (
        <div className="mt-1.5 rounded-lg border border-dashed border-border bg-muted/20 p-2">
          <LineaTiempoPaciente items={sequenceItems} documento={documento} />
        </div>
      )}
    </div>
  );
}


// Resumen compacto de un caso (por case_id).
function CasoResumenRow({
  c,
  indice,
  confirmable,
  canEdit,
  onConfirmar,
}: {
  c: Construido;
  indice: number;
  confirmable: boolean;
  canEdit: boolean;
  onConfirmar?: () => void;
}) {
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 shadow-sm transition hover:border-status-blue/50">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold text-muted-foreground">
            CASO {indice}
          </span>
          <span className="rounded-full bg-status-blue/10 px-2 py-0.5 text-[9px] font-bold uppercase text-status-blue">
            {c.bloque.tipoDocumento}
          </span>
          {c.codigo && <span className="font-mono text-[11px] font-semibold text-status-blue">{c.codigo}</span>}
        </div>
        <span className="font-mono text-[10px] text-muted-foreground">{fmtFechaHora(c.fechaBase)}</span>
      </div>
      <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
        <span className="text-[11px] font-semibold text-foreground">{c.estado || "—"}</span>
        {confirmable && canEdit && onConfirmar && (
          <Button
            size="sm"
            className="h-7 rounded-md bg-status-green text-[11px] text-white hover:bg-status-green/90"
            onClick={(e) => {
              e.stopPropagation();
              onConfirmar();
            }}
          >
            <Hospital className="mr-1.5 h-3.5 w-3.5" /> Confirmar Ingreso
          </Button>
        )}
      </div>
    </div>
  );
}

// Resultado de consulta por paciente: cabecera + casos separados por case_id.
function PacienteResultado({
  vista,
  nombre,
  documento,
  entrantes,
  salientes,
  phd,
  internas,
  buildEntrante,
  buildSaliente,
  buildPHD,
  buildInterna,
  canEdit,
  onConfirmar,
  casoExpandido,
  onToggleCaso,
  onBitacoraCaso,
  onBitacoraUnificada,
  onInfoCaso,
  onCopiarCodigo,
  onExportarExcelCaso,
  onVerAuditoriaCaso,
  puedeAuditar,
}: {
  vista: Vista;
  nombre: string;
  documento: string;
  entrantes: Grupo[];
  salientes: Remision[];
  phd: Generico[];
  internas: Generico[];
  buildEntrante: (g: Grupo) => Construido;
  buildSaliente: (r: Remision) => Construido;
  buildPHD: (r: Generico) => Construido;
  buildInterna: (r: Generico) => Construido;
  canEdit: boolean;
  onConfirmar: (g: Grupo) => void;
  casoExpandido: string | null;
  onToggleCaso: (key: string) => void;
  onBitacoraCaso: (c: Construido) => void;
  onBitacoraUnificada: (cs: Construido[], doc: string, filtros: string) => void;
  onInfoCaso: (c: Construido) => void;
  onCopiarCodigo: (c: Construido) => void;
  onExportarExcelCaso: (c: Construido) => void;
  onVerAuditoriaCaso: (c: Construido) => void;
  puedeAuditar: boolean;
}) {
  const rows = useMemo(() => {
    if (vista === "entrantes")
      return entrantes.map((g) => ({ key: g.key, construido: buildEntrante(g), grupo: g as Grupo | null }));
    if (vista === "salientes")
      return salientes.map((r) => ({ key: r.id, construido: buildSaliente(r), grupo: null as Grupo | null }));
    if (vista === "phd")
      return phd.map((r) => ({ key: r.id, construido: buildPHD(r), grupo: null as Grupo | null }));
    return internas.map((r) => ({ key: r.id, construido: buildInterna(r), grupo: null as Grupo | null }));
  }, [vista, entrantes, salientes, phd, internas, buildEntrante, buildSaliente, buildPHD, buildInterna]);

  const construidos = rows.map((x) => x.construido);
  const { campos } = resumenPaciente(construidos);
  const campoVal = (l: string) => campos.find((c) => c.label === l)?.value || "—";
  const resumen = {
    tipoDoc: campoVal("Tipo documento"),
    edad: campoVal("Edad"),
    entidad: campoVal("Entidad responsable"),
    regimen: campoVal("Régimen"),
    telefono: campoVal("Teléfono"),
  };

  return (
    <div className="grid gap-2.5">
      <PacienteCabecera
        nombre={nombre}
        documento={documento}
        resumen={resumen}
        totalCasos={rows.length}
        onBitacoraUnificada={() =>
          onBitacoraUnificada(construidos, documento, `Paciente=${documento}; Subventana=${vista}`)
        }
      />
      {rows.length === 0 ? (
        <div className="rounded-lg border border-border bg-card py-10 text-center">
          <p className="text-sm font-semibold text-foreground">
            EL PACIENTE FUE ENCONTRADO, PERO NO TIENE CASOS EN ESTA SUBVENTANA.
          </p>
        </div>
      ) : (
        rows.map((row, idx) => (
          <CasoConMenu
            key={row.key}
            expanded={casoExpandido === row.key}
            onVerSecuencia={() => onToggleCaso(row.key)}
            onBitacora={() => onBitacoraCaso(row.construido)}
            onInfo={() => onInfoCaso(row.construido)}
            onCopiarCodigo={() => onCopiarCodigo(row.construido)}
            onExportarExcel={() => onExportarExcelCaso(row.construido)}
            onVerAuditoria={() => onVerAuditoriaCaso(row.construido)}
            puedeAuditar={puedeAuditar}
            codigo={row.construido.codigo}
            sequenceItems={[row.construido]}
            documento={documento}
          >
            <CasoResumenRow
              c={row.construido}
              indice={idx + 1}
              confirmable={!!row.grupo?.confirmable}
              canEdit={canEdit}
              onConfirmar={row.grupo ? () => onConfirmar(row.grupo as Grupo) : undefined}
            />
          </CasoConMenu>
        ))
      )}
    </div>
  );
}

// Barra plegable "Últimos 10 casos" (estado inicial sin búsqueda).
function Ultimos10Bar({
  abierto,
  onToggle,
  total,
  children,
}: {
  abierto: boolean;
  onToggle: () => void;
  total: number;
  children: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-muted/20">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between px-3 py-2.5 text-left"
      >
        <span className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-foreground">
          <Clock className="h-4 w-4 text-muted-foreground" />
          Últimos 10 casos
          {total > 0 && <span className="text-muted-foreground">· {total} registro(s)</span>}
        </span>
        <ChevronDown className={`h-4 w-4 text-muted-foreground transition ${abierto ? "rotate-180" : ""}`} />
      </button>
      {abierto && <div className="border-t border-border p-2.5">{children}</div>}
    </div>
  );
}


// ---- Índice de pacientes (para búsqueda avanzada por nombre/apellido) ----
export type PacienteIndex = {
  documento: string;
  nombre: string;
  nombres: string;
  apellidos: string;
};

// ---- Modal BUSCAR PACIENTE (búsqueda avanzada por nombre/apellido) ----
function BuscarPacienteDialog({
  open,
  onClose,
  pacientes,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  pacientes: PacienteIndex[];
  onPick: (documento: string) => void;
}) {
  const [ident, setIdent] = useState("");
  const [n1, setN1] = useState("");
  const [n2, setN2] = useState("");
  const [a1, setA1] = useState("");
  const [a2, setA2] = useState("");
  const [buscado, setBuscado] = useState(false);
  const [sel, setSel] = useState<string | null>(null);

  const limpiar = () => {
    setIdent("");
    setN1("");
    setN2("");
    setA1("");
    setA2("");
    setBuscado(false);
    setSel(null);
  };

  const norm = (s: string) => sinTildes(s).toUpperCase().trim();
  const criterios = [ident, n1, n2, a1, a2].map(norm).filter(Boolean);

  const resultados = useMemo(() => {
    if (!buscado || criterios.length === 0) return [];
    const di = norm(ident);
    const nombreTokens = [n1, n2, a1, a2].map(norm).filter(Boolean);
    return pacientes
      .filter((p) => {
        if (di && !norm(p.documento).includes(di)) return false;
        if (nombreTokens.length) {
          const full = norm(`${p.nombres} ${p.apellidos}`);
          if (!nombreTokens.every((t) => full.includes(t))) return false;
        }
        return true;
      })
      .slice(0, 50);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buscado, pacientes, ident, n1, n2, a1, a2]);

  const aceptar = () => {
    if (!sel) {
      toast.info("Selecciona un paciente de la lista.");
      return;
    }
    onPick(sel);
    limpiar();
    onClose();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          limpiar();
          onClose();
        }
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <UserSearch className="h-5 w-5 text-status-blue" /> Buscar paciente
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-5">
          <div className="grid gap-1"><Label className="text-[11px]">Identificación</Label><Input value={ident} onChange={(e) => setIdent(e.target.value)} onKeyDown={(e) => e.key === "Enter" && setBuscado(true)} /></div>
          <div className="grid gap-1"><Label className="text-[11px]">Primer nombre</Label><Input value={n1} onChange={(e) => setN1(e.target.value)} onKeyDown={(e) => e.key === "Enter" && setBuscado(true)} /></div>
          <div className="grid gap-1"><Label className="text-[11px]">Segundo nombre</Label><Input value={n2} onChange={(e) => setN2(e.target.value)} onKeyDown={(e) => e.key === "Enter" && setBuscado(true)} /></div>
          <div className="grid gap-1"><Label className="text-[11px]">Primer apellido</Label><Input value={a1} onChange={(e) => setA1(e.target.value)} onKeyDown={(e) => e.key === "Enter" && setBuscado(true)} /></div>
          <div className="grid gap-1"><Label className="text-[11px]">Segundo apellido</Label><Input value={a2} onChange={(e) => setA2(e.target.value)} onKeyDown={(e) => e.key === "Enter" && setBuscado(true)} /></div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button size="sm" className="bg-status-blue text-white hover:bg-status-blue/90" onClick={() => setBuscado(true)}>
            <Search className="mr-1.5 h-4 w-4" /> Buscar
          </Button>
          <Button size="sm" variant="outline" onClick={limpiar}>
            <Eraser className="mr-1.5 h-4 w-4" /> Limpiar filtros
          </Button>
        </div>

        <div className="mt-1 max-h-[45vh] overflow-y-auto rounded-lg border border-border">
          {!buscado ? (
            <p className="py-8 text-center text-xs text-muted-foreground">Ingresa un criterio y presiona Buscar.</p>
          ) : criterios.length === 0 ? (
            <p className="py-8 text-center text-xs text-muted-foreground">Ingresa al menos un criterio de búsqueda.</p>
          ) : resultados.length === 0 ? (
            <p className="py-8 text-center text-xs text-muted-foreground">
              NO SE ENCONTRÓ UN PACIENTE CON LOS CRITERIOS INGRESADOS.
            </p>
          ) : (
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 bg-muted/80 text-[10px] uppercase text-muted-foreground">
                <tr>
                  <th className="px-2 py-1.5">Identificación</th>
                  <th className="px-2 py-1.5">Nombres</th>
                  <th className="px-2 py-1.5">Apellidos</th>
                </tr>
              </thead>
              <tbody>
                {resultados.map((p) => (
                  <tr
                    key={p.documento}
                    onClick={() => setSel(p.documento)}
                    onDoubleClick={() => {
                      setSel(p.documento);
                      onPick(p.documento);
                      limpiar();
                      onClose();
                    }}
                    className={`cursor-pointer border-t border-border transition ${
                      sel === p.documento ? "bg-status-blue/15" : "hover:bg-muted/50"
                    }`}
                  >
                    <td className="px-2 py-1.5 font-mono font-semibold text-status-blue">{p.documento}</td>
                    <td className="px-2 py-1.5">{p.nombres || "—"}</td>
                    <td className="px-2 py-1.5">{p.apellidos || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button className="bg-status-blue text-white hover:bg-status-blue/90" onClick={aceptar}>
            <Check className="mr-1.5 h-4 w-4" /> Aceptar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
