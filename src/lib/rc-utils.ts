// ══════════════════════════════════════════════════════════════════
//  Referencia y Contrarreferencia — utilidades núcleo
//  Replica la lógica de Code.gs / Index del sistema original (CEDIM IPS)
// ══════════════════════════════════════════════════════════════════

export interface Caso {
  id: string;
  codigo: string;
  tipo: string;
  documento: string | null;
  ips: string | null;
  medico: string | null;
  especialidad: string | null;
  unidad: string | null;
  aseguramiento: string | null;
  detalle: string | null;
  estado: string | null;
  fecha: string | null;
  fecha_vence: string | null;
  hrs_reserva: string | null;
  cod_ref: string | null;
  nombres: string | null;
  apellidos: string | null;
  eapb: string | null;
  regimen: string | null;
  archivado: boolean;
  created_at: string;
}

export interface UnidadCat {
  nombre: string;
  horas: number;
  horasAmp: number;
}
export interface MedicoCat {
  nombre: string;
  titulo: string;
  especialidad?: string;
}
export interface MotivoCanCat {
  nombre: string;
  justificacion: string;
}
export interface IpsCiudades {
  nombre: string;
  ciudades: string[];
}
export interface Plantilla {
  indicativo: string;
  categoria: string;
  subcategoria: string;
  nombre: string;
  mensaje: string;
}

// ─── Fechas ──────────────────────────────────────────────────────
export function fmtFechaHora(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function fechaCasoStr(c: Caso): string {
  // created_at lleva la marca completa de tiempo
  const d = c.created_at ? new Date(c.created_at) : null;
  return d ? fmtFechaHora(d) : c.fecha || "";
}

export function fmtMinutos(min: number | null): string {
  if (min === null || min === undefined || isNaN(min) || min <= 0) return "TIEMPO DE INGRESO VENCIDO";
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `${h}h ${m}min restantes` : `${m} min restantes`;
}

export function fmtDuracion(minIn: number): string {
  let min = minIn;
  if (min < 0) min = Math.abs(min);
  if (min < 1) return "menos de 1 min";
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h < 24) return `${h}h${m > 0 ? ` ${m}min` : ""}`;
  const d = Math.floor(h / 24);
  const hh = h % 24;
  return `${d}d${hh > 0 ? ` ${hh}h` : ""}`;
}

// ─── Vencimiento (considera la AMP más reciente) ─────────────────
export interface Vencimiento {
  fechaVence: string;
  fechaVenceDate: Date | null;
  hrs: string;
  minRest: number | null;
  amp: Caso | null;
}

export function calcularVencimiento(caso: Caso, todos: Caso[]): Vencimiento {
  const amps = todos.filter((c) => c.tipo === "AMP" && c.cod_ref === caso.codigo);
  let venceEff = caso.fecha_vence;
  let hrsEff = caso.hrs_reserva || "";
  let ampEnc: Caso | null = null;
  if (amps.length > 0) {
    amps.sort((a, b) => (b.codigo || "").localeCompare(a.codigo || ""));
    ampEnc = amps[0];
    venceEff = ampEnc.fecha_vence;
    hrsEff = ampEnc.hrs_reserva || "";
  }
  if (!venceEff) return { fechaVence: "", fechaVenceDate: null, hrs: hrsEff, minRest: null, amp: ampEnc };
  const d = new Date(venceEff);
  const minRest = Math.floor((d.getTime() - Date.now()) / 60000);
  return { fechaVence: fmtFechaHora(d), fechaVenceDate: d, hrs: hrsEff, minRest, amp: ampEnc };
}

// ─── Horas de reserva según unidad ───────────────────────────────
export function calcHrsReserva(unidad: string, tipo: string, unidades: UnidadCat[]): number {
  const v = (unidad || "").toUpperCase().trim();
  const u = unidades.find((x) => x.nombre.toUpperCase() === v);
  if (u) return tipo === "AMP" ? u.horasAmp || u.horas : u.horas;
  if (v.includes("UCI") || v.includes("INTENSIVO") || v.includes("UCIN")) return 8;
  return 12;
}

// ─── Generación de código TIPO-AAAAMM-NNN ────────────────────────
export function nextCodigo(todos: Caso[], tipo: string, ahora: Date): string {
  const yy = ahora.getFullYear();
  const mm = String(ahora.getMonth() + 1).padStart(2, "0");
  const mes = `${yy}${mm}`;
  let maxSeq = 0;
  for (const c of todos) {
    const code = String(c.codigo || "");
    if (!code) continue;
    const parts = code.split("-");
    if (parts.length !== 3) continue;
    if (parts[0] !== tipo) continue;
    if (parts[1].indexOf(mes) !== 0) continue;
    if (parts[1].length !== 6 && parts[1].length !== 8) continue;
    const n = parseInt(parts[2], 10);
    if (!isNaN(n) && n > maxSeq) maxSeq = n;
  }
  const n = maxSeq + 1;
  const seq = n < 10 ? `00${n}` : n < 100 ? `0${n}` : `${n}`;
  return `${tipo}-${mes}-${seq}`;
}

// ─── Caso ACEP activo del documento ──────────────────────────────
export function buscarAcepActivo(todos: Caso[], doc: string): Caso | null {
  const activos = todos.filter((c) => c.documento === doc && c.tipo === "ACEP" && c.estado === "ACTIVO");
  if (!activos.length) return null;
  activos.sort((a, b) => (b.codigo || "").localeCompare(a.codigo || ""));
  const cand = activos[0];
  const ven = calcularVencimiento(cand, todos);
  if (ven.minRest === null || isNaN(ven.minRest) || ven.minRest <= 0) return null;
  return cand;
}

/** Devuelve la aceptación más reciente del paciente, sin importar si el cupo sigue vigente. */
export function buscarAcepReciente(todos: Caso[], doc: string): Caso | null {
  const aceps = todos.filter((c) => c.documento === doc && c.tipo === "ACEP");
  if (!aceps.length) return null;
  aceps.sort((a, b) => (b.codigo || "").localeCompare(a.codigo || ""));
  return aceps[0];
}

// ─── Plantillas ──────────────────────────────────────────────────
export function formatearMensajeHTML(texto: string): string {
  if (!texto) return "";
  let html = String(texto).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  html = html.replace(/==([^=\n]+)==/g, '<mark style="background-color:#fef08a;color:#000;padding:0 2px">$1</mark>');
  html = html.replace(/\*([^*\n]+)\*/g, "<strong>$1</strong>");
  return html.replace(/\n/g, "<br>");
}

export function limpiarMarcadores(texto: string): string {
  if (!texto) return "";
  return String(texto).replace(/==([^=\n]+)==/g, "$1").replace(/\*([^*\n]+)\*/g, "$1");
}

function procesarBloques(texto: string): string {
  if (!texto) return "";
  return texto.replace(/\{\{#([A-Z_0-9]+)\}\}([\s\S]*?)\{\{\/\1\}\}/g, (_, varName, contenido) => {
    const reVar = new RegExp("\\{\\{" + varName + "\\}\\}");
    if (reVar.test(contenido)) return "";
    const limpio = contenido.replace(/\s/g, "");
    return limpio ? contenido : "";
  });
}

export interface BuildMsgData {
  tipo: string;
  documento?: string;
  ips?: string;
  medico?: string;
  especialidad?: string;
  unidad?: string;
  aseguramiento?: string;
  detalle?: string;
  codRef?: string;
  motivoNeg?: string;
  motivoCancelacion?: string;
  justificacionCancelacion?: string;
  fechaRecontacto?: string;
  horaRecontacto?: string;
  codigoCrue?: string;
  contactoIps?: string;
  motivosCrue?: string[] | null;
  eapb?: string;
  regimen?: string;
}

export interface BuildMsgResult {
  codigo: string;
  fecha: string;
  fechaVence: string;
  hrsReserva: string;
}

function aseguramientoCategoria(seg: string): string {
  const s = (seg || "").toUpperCase();
  if (s.includes("SOAT") || s.includes("ADRES")) return "SOAT/ADRES";
  if (s.includes("ARL") || s.includes("POLIZA") || s.includes("PÓLIZA")) return "ARL/POLIZA ESTUDIANTIL";
  return "EPS";
}

function findPlantilla(plantillas: Plantilla[], data: BuildMsgData): Plantilla | undefined {
  let indicativo = "";
  let categoria = "";
  if (data.tipo === "ACEP") {
    indicativo = "ACEPTACIONES";
    categoria = aseguramientoCategoria(data.aseguramiento || "");
  } else if (data.tipo === "NEG") {
    indicativo = "NEGACIONES";
    categoria = data.motivoNeg || "";
  } else if (data.tipo === "AMP") {
    indicativo = "AMPLIACIONES";
  } else if (data.tipo === "CAN") {
    indicativo = "CANCELACIONES";
  } else if (data.tipo === "CRUE_ACEP") {
    indicativo = "CRUE";
    categoria = "ACEPTACION DIRECCIONAMIENTO";
  } else if (data.tipo === "CRUE_NR") {
    indicativo = "CRUE";
    categoria = "NO REQUERIMIENTO";
  } else if (data.tipo === "CRUE_NEG") {
    indicativo = "CRUE";
    categoria = "NEGACION DIRECCIONAMIENTO";
  }
  let found = plantillas.find(
    (p) => p.indicativo === indicativo && (categoria ? (p.categoria || "") === categoria : true),
  );
  if (!found && (data.tipo === "CAN" || data.tipo === "AMP")) {
    found = plantillas.find((p) => p.indicativo === indicativo);
  }
  return found;
}

export function buildMensaje(
  plantillas: Plantilla[],
  medicos: MedicoCat[],
  r: BuildMsgResult,
  data: BuildMsgData,
): string {
  const pl = findPlantilla(plantillas, data);
  if (!pl || !pl.mensaje) return "";

  let tituloMed = "Dr(a).";
  if (data.medico) {
    const med = medicos.find((m) => m.nombre && m.nombre.toLowerCase() === (data.medico || "").toLowerCase());
    if (med && med.titulo) tituloMed = med.titulo;
  }

  let fechaRecF = "";
  if (data.fechaRecontacto) {
    const dd = new Date(data.fechaRecontacto + "T00:00");
    fechaRecF = dd.toLocaleDateString("es-CO", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });
  }

  let motivoVisible = data.motivoCancelacion || "";
  let justificacionTxt = data.justificacionCancelacion || "";
  if (motivoVisible.toUpperCase() === "OTRO") {
    motivoVisible = (data.detalle || data.justificacionCancelacion || "").trim() || "OTRO";
    justificacionTxt = "";
  }

  const out = pl.mensaje
    .replace(/\{\{TITULO_MEDICO\}\}/g, tituloMed)
    .replace(/\{\{DOCUMENTO\}\}/g, data.documento || "")
    .replace(/\{\{IPS\}\}/g, data.ips || "")
    .replace(/\{\{CODIGO\}\}/g, r.codigo || "")
    .replace(/\{\{FECHA\}\}/g, r.fecha || "")
    .replace(/\{\{FECHA_ACEP\}\}/g, r.fecha || "")
    .replace(/\{\{FECHA_VENCE\}\}/g, r.fechaVence || "")
    .replace(/\{\{MEDICO\}\}/g, data.medico || "")
    .replace(/\{\{ESPECIALIDAD\}\}/g, data.especialidad || "")
    .replace(/\{\{UNIDAD\}\}/g, data.unidad || "")
    .replace(/\{\{TIEMPO_RESERVA\}\}/g, String(r.hrsReserva || ""))
    .replace(/\{\{COD_REF\}\}/g, data.codRef || "")
    .replace(/\{\{ESPECIALIDAD_REQUERIDA\}\}/g, data.especialidad || "")
    .replace(/\{\{UNIDAD_REQUERIDA\}\}/g, data.unidad || "")
    .replace(/\{\{FECHA_RECONTACTO\}\}/g, fechaRecF)
    .replace(/\{\{HORA_RECONTACTO\}\}/g, data.horaRecontacto || "")
    .replace(/\{\{MOTIVO_CANCELACION\}\}/g, motivoVisible)
    .replace(/\{\{JUSTIFICACION_CANCELACION\}\}/g, justificacionTxt)
    .replace(/\{\{DETALLE\}\}/g, data.detalle || "")
    .replace(/\{\{NOTAS\}\}/g, data.detalle || "")
    .replace(/\{\{OBSERVACIONES\}\}/g, data.detalle || "")
    .replace(/\{\{CODIGO_CRUE\}\}/g, data.codigoCrue || "")
    .replace(/\{\{EAPB\}\}/g, data.eapb || "")
    .replace(/\{\{CONTACTO_IPS\}\}/g, data.contactoIps || "")
    .replace(/\{\{MOTIVO_1\}\}/g, (data.motivosCrue && data.motivosCrue[0]) || "")
    .replace(/\{\{MOTIVO_2\}\}/g, (data.motivosCrue && data.motivosCrue[1]) || "")
    .replace(/\{\{MOTIVO_3\}\}/g, (data.motivosCrue && data.motivosCrue[2]) || "");

  return procesarBloques(out);
}

// ─── Copia dual (HTML para Gmail, texto plano para WhatsApp) ─────
export async function copiarDual(textoMarcado: string): Promise<boolean> {
  const textoPlano = limpiarMarcadores(textoMarcado);
  const html =
    '<div style="font-family:\'Segoe UI\',sans-serif;white-space:pre-wrap">' +
    formatearMensajeHTML(textoMarcado) +
    "</div>";
  try {
    if (navigator.clipboard && typeof window !== "undefined" && (window as any).ClipboardItem) {
      const item = new (window as any).ClipboardItem({
        "text/html": new Blob([html], { type: "text/html" }),
        "text/plain": new Blob([textoPlano], { type: "text/plain" }),
      });
      await navigator.clipboard.write([item]);
      return true;
    }
  } catch {
    /* fallback */
  }
  try {
    await navigator.clipboard.writeText(textoPlano);
    return true;
  } catch {
    return false;
  }
}

export const ASEGURAMIENTOS = ["EPS", "SOAT-ADRES", "ARL-POLIZA"];
export const TIPO_LABEL: Record<string, string> = {
  ACEP: "CASO ACEPTADO",
  NEG: "CASO NEGADO",
  AMP: "AMPLIACIÓN REGISTRADA",
  CAN: "CANCELACIÓN REGISTRADA",
  CRUE_ACEP: "ACEPTACIÓN DE DIRECCIONAMIENTO CRUE",
  CRUE_NR: "NO REQUERIMIENTO DE DIRECCIONAMIENTO",
  CRUE_NEG: "NEGACIÓN AL DIRECCIONAMIENTO CRUE",
};
