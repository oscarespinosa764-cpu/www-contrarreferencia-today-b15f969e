// Generación BAJO DEMANDA de exportables del Dashboard Operativo Salientes.
//
// CONTROL DE COSTOS: todo se construye en memoria en el navegador y se entrega
// como descarga real (jsPDF / SheetJS, 100% JS, sin servicios externos). NO se
// guarda ningún archivo permanente en el bucket ni en la base de datos.
//
// Mecanismo de descarga: jsPDF `doc.save()` y SheetJS `XLSX.writeFile()` crean
// internamente un Blob + object URL + anchor temporal con `download` y lo
// revocan tras la descarga, por lo que la descarga es confiable y limpia.

import logoAsset from "@/assets/cedim-logo.png.asset.json";
import { fmtFechaHora, fmtEdad, fmtTranscurrido } from "./remisiones-utils";
import { getPlantillaConfig, pickText, pickBool } from "./plantillas-inventario-config";
import {
  loadReporteGeneralSalientesConfig,
  getIndicatorsResolved,
  getColumnsResolved,
  INDICATOR_DEFAULT_LABELS,
  type ColumnKey,
} from "./reporte-general-salientes-config";
import type { Remision } from "@/components/remisiones/caso-remision-card";

const INSTITUCION = "CENTRO DE IMAGENES DIAGNOSTICAS CEDIM I.P.S S.A.S";
const NIT = "NIT: 900559103-5";
const PIE_DEFAULT = "SISTEMA DE REFERENCIA Y CONTRARREFERENCIA";
const TITULO_DEFAULT = "REPORTE GENERAL OPERATIVO — REMISIONES ACTIVAS";
const NAVY: [number, number, number] = [31, 56, 100];
const LIGHT_BLUE: [number, number, number] = [221, 235, 247];

const v = (x: unknown): string => (x === null || x === undefined ? "" : String(x).trim());
const hoy = () => new Date().toISOString().slice(0, 10);

// Contadores compartidos por el bloque de tarjetas superiores.
// El Reporte General usa un subconjunto de tarjetas centrado en estados
// activos de remisiones. Entrega de Turno usa el conjunto completo.
function tarjetasResumen(p: {
  activas: number;
  especiales: number;
  internas: number;
  pendientes: number;
  contadores?: Record<string, number>;
}): [string, string][] {
  const c = p.contadores ?? {};
  return [
    ["REMISIONES ACTIVAS", String(p.activas)],
    ["PENDIENTES ACEPTACIÓN", String(c.acepPendiente ?? 0)],
    ["ACEPTADO SIN AMB.", String(c.acepSinAmb ?? 0)],
    ["ACEPTADO CON AMB.", String(c.acepConAmb ?? 0)],
    ["DESISTIMIENTOS", String(c.desistimientos ?? 0)],
  ];
}

// Resumen exclusivo del Reporte General — solo estados activos de remisiones.
// No incluye desistimientos, PHD/PAD/O2 ni categorías terminales.
function tarjetasResumenActivas(p: {
  activas: number;
  contadores?: Record<string, number>;
}): [string, string][] {
  const c = p.contadores ?? {};
  return [
    ["TOTAL REMISIONES ACTIVAS", String(p.activas)],
    ["PENDIENTES DE ACEPTACIÓN", String(c.acepPendiente ?? 0)],
    ["ACEPTADAS SIN AMBULANCIA", String(c.acepSinAmb ?? 0)],
    ["ACEPTADAS CON AMBULANCIA", String(c.acepConAmb ?? 0)],
    ["EGRESADAS PEND. LLEGADA", String(c.egresPendLlegada ?? 0)],
  ];
}

// Definición canónica de REMISIÓN ACTIVA: excluye estados terminales y
// desistimientos. Se aplica tanto al resumen como a la tabla del reporte,
// garantizando una única fuente de verdad.
const ESTADOS_TERMINALES = /CERRAD|CANCEL|DESIST|DISENT|FINALIZ|ARCHIV|ANUL|LLEGADA CONFIRM/i;
export function esRemisionActiva(r: { estado?: string | null; archivado?: boolean | null }): boolean {
  if (r.archivado) return false;
  const e = String(r.estado ?? "").toUpperCase();
  if (!e) return true; // sin estado explícito se considera aún activa
  return !ESTADOS_TERMINALES.test(e);
}

const imgCache = new Map<string, string | null>();
async function getImg(url: string): Promise<string | null> {
  if (imgCache.has(url)) return imgCache.get(url) ?? null;
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result as string);
      fr.onerror = reject;
      fr.readAsDataURL(blob);
    });
    imgCache.set(url, dataUrl);
    return dataUrl;
  } catch {
    imgCache.set(url, null);
    return null;
  }
}


// ===========================================================================
// REPORTE GENERAL OPERATIVO — SALIENTES
// ---------------------------------------------------------------------------
// Legal landscape. Encabezado institucional SIN turno, fila de tarjetas resumen
// (idéntica a Entrega de Turno) y tabla completa de REMISIONES ACTIVAS.
// Se genera BAJO DEMANDA y se descarga. NO se guarda archivo permanente.
// ===========================================================================
export async function descargarReporteGeneralPDF(params: {
  remisiones: Remision[];
  activas: number;
  especiales: number;
  internas: number;
  pendientes: number;
  usuario: string;
  contadores?: Record<string, number>;
  domiciliarios?: Record<string, unknown>[];
}): Promise<void> {
  // ── Configuración administrada (Fase 5). Nunca lanza: ante entrada
  //    inválida o ausente usa defaults (fallback seguro).
  const { config: rcfg, fallback } = await loadReporteGeneralSalientesConfig();
  if (fallback) {
    // eslint-disable-next-line no-console
    console.warn("[REPORTE_GENERAL_SALIENTES] usando configuración por defecto (fallback).");
  }
  // Compatibilidad con la sección PHD/negaciones del alcance histórico:
  // se mantiene la lectura por compatibilidad con configuraciones previas
  // aunque ya no se rendericen en este reporte.
  void pickBool;

  // Filtro canónico único: el resumen y la tabla parten de la misma lista de
  // remisiones activas, garantizando que los conteos coincidan con las filas.
  const remisionesActivas = (params.remisiones ?? []).filter((r) =>
    esRemisionActiva(r as unknown as { estado?: string | null; archivado?: boolean | null }),
  );

  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;
  const doc = new jsPDF({
    unit: "mm",
    format: rcfg.page.page_size,
    orientation: rcfg.page.orientation,
  });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const logo = rcfg.header.show_logo ? await getImg((logoAsset as { url: string }).url) : null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const finalY = (): number => (doc as any).lastAutoTable?.finalY ?? 0;

  // ── Encabezado institucional (SIN turno) ────────────────────────────────
  if (logo) doc.addImage(logo, "PNG", 12, 7, 24, 16);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(110);
  const align = rcfg.header.alignment;
  const xAlign = align === "left" ? 12 : align === "right" ? pageW - 12 : pageW / 2;
  const nitLine = `${rcfg.header.institution_identifier_label} ${rcfg.header.institution_identifier_value}`.trim();
  doc.text(rcfg.header.institution_name, xAlign, 11, { align });
  doc.text(nitLine, xAlign, 15, { align });
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(NAVY[0], NAVY[1], NAVY[2]);
  doc.text(rcfg.header.report_title, xAlign, 22, { align });
  if (rcfg.header.report_subtitle) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(90);
    doc.text(rcfg.header.report_subtitle, xAlign, 26.5, { align });
  }
  doc.setTextColor(0);
  if (rcfg.header.show_generated_by || rcfg.header.show_generated_at) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    const parts: string[] = [];
    if (rcfg.header.show_generated_by) {
      parts.push(`${rcfg.header.generated_by_label}: ${params.usuario}`);
    }
    if (rcfg.header.show_generated_at) {
      parts.push(new Date().toLocaleString("es-CO"));
    }
    doc.text(parts.join("   ·   "), xAlign, 28, { align });
  }

  // Recalcular métricas del resumen a partir de la lista filtrada, garantizando
  // que la suma de las categorías coincida con las filas de la tabla.
  const norm = (s: unknown) => String(s ?? "").toUpperCase();
  const acepPend = remisionesActivas.filter((r) => {
    const e = norm(r.estado);
    return /PENDIENTE/.test(e) && !/AMBULANCIA/.test(e);
  }).length;
  const acepSinAmb = remisionesActivas.filter((r) => {
    const e = norm(r.estado);
    return /AMBULANCIA/.test(e) && /PENDIENTE|SIN PROGRAM/.test(e);
  }).length;
  const acepConAmb = remisionesActivas.filter((r) => {
    const e = norm(r.estado);
    return /AMBULANCIA/.test(e) && /COORDINAD|CON PROGRAM/.test(e);
  }).length;
  const egresPendLlegada = remisionesActivas.filter((r) => {
    const e = norm(r.estado);
    return /EGRES/.test(e) && /PENDIENTE|LLEGADA/.test(e) && !/CONFIRM/.test(e);
  }).length;

  const indicatorValues: Record<string, number> = {
    total_activas: remisionesActivas.length,
    pendientes_aceptacion: acepPend,
    aceptadas_sin_ambulancia: acepSinAmb,
    aceptadas_con_ambulancia: acepConAmb,
    egresadas_pendientes_llegada: egresPendLlegada,
  };
  const indicators = getIndicatorsResolved(rcfg);
  const cont: [string, string][] = indicators.map((i) => [
    i.label || INDICATOR_DEFAULT_LABELS[i.key],
    String(indicatorValues[i.key] ?? 0),
  ]);
  if (cont.length > 0) {
    autoTable(doc, {
      startY: 33,
      theme: "grid",
      styles: { fontSize: 7, cellPadding: 1.2, halign: "center", lineColor: [120, 120, 120], lineWidth: 0.2 },
      body: [
        cont.map(([k]) => ({ content: k, styles: { fillColor: LIGHT_BLUE, textColor: NAVY, fontStyle: "bold" as const } })),
        cont.map(([, val]) => ({ content: val, styles: { fontStyle: "bold" as const, fontSize: 10 } })),
      ] as never,
      margin: { left: 12, right: 12 },
    });
  }
  let y = finalY() + 8;

  // ── Banda de sección REMISIONES ACTIVAS ─────────────────────────────────
  doc.setFillColor(NAVY[0], NAVY[1], NAVY[2]);
  doc.rect(8, y - 4, pageW - 16, 6, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.text("REMISIONES ACTIVAS", pageW / 2, y, { align: "center" });
  doc.setTextColor(0);
  y += 5;

  // Fuente lógica del dato POR COLUMNA (inmutable desde el editor).
  const columns = getColumnsResolved(rcfg);
  const columnGetter: Record<ColumnKey, (r: Remision, rr: Record<string, unknown>) => string> = {
    fecha_inicio: (r) => fmtFechaHora(r.fecha_inicio),
    fecha_radicado: (_r, rr) => fmtFechaHora(rr.fecha_radicado as string),
    tiempo_tramite: (r) => fmtTranscurrido(r.fecha_inicio),
    servicio: (r) => v(r.servicio),
    paciente: (r) => v(r.paciente),
    identificacion: (r) => v(r.documento),
    edad: (r) => fmtEdad(r.edad),
    cie10: (r) => v(r.cie10),
    especialidades_tratantes: (r) => v(r.especialidades_tratantes),
    especialidades_receptoras: (r) => v(r.especialidades_receptoras),
    remision_por: (_r, rr) => v(rr.remision_por),
    motivo: (_r, rr) => v(rr.especificacion),
    tipo_tramite: (_r, rr) => v(rr.tipo_tramite),
    eapb: (r) => v(r.eapb || r.asegurador),
    regimen: (r) => v(r.regimen),
    radicacion: (r) => v(r.codigo_radicacion),
    estado: (r) => v(r.estado),
    ips_receptora: (_r, rr) => v(rr.ips_receptora),
    tipo_ambulancia: (r) => v(r.tipo_ambulancia),
    soportes: (_r, rr) => v(rr.soportes),
  };
  const head = [columns.map((c) => c.label)];
  const body = remisionesActivas.map((r) => {
    const rr = r as unknown as Record<string, unknown>;
    return columns.map((c) => columnGetter[c.key](r, rr));
  });
  const columnStyles: Record<number, { cellWidth?: number; halign?: "left" | "center" | "right" }> = {};
  columns.forEach((c, idx) => {
    const s: { cellWidth?: number; halign?: "left" | "center" | "right" } = {};
    if (typeof c.width === "number") s.cellWidth = c.width;
    if (c.alignment) s.halign = c.alignment;
    if (Object.keys(s).length) columnStyles[idx] = s;
  });

  autoTable(doc, {
    startY: y,
    head: head as never,
    body: (body.length
      ? body
      : [[{ content: "Sin remisiones activas", colSpan: columns.length || 1, styles: { halign: "center", textColor: [130, 130, 130], fontStyle: "italic" } }]]) as never,
    theme: "grid",
    styles: { fontSize: rcfg.page.base_font_size, cellPadding: 0.9, overflow: "linebreak", valign: "top", lineColor: [140, 140, 140], lineWidth: 0.15 },
    headStyles: { fillColor: NAVY, textColor: [255, 255, 255], fontStyle: "bold", fontSize: rcfg.page.base_font_size, halign: "center" },
    columnStyles,
    margin: { left: rcfg.page.margin_left, right: rcfg.page.margin_right },
    tableWidth: "auto",
    showHead: rcfg.table.repeat_header ? "everyPage" : "firstPage",
  });

  // Sección PHD / PAD / O2 / ESPECIALES eliminada del alcance del Reporte
  // General por definición institucional. Este reporte muestra exclusivamente
  // Remisiones Activas.


  // ── Pie en todas las páginas ────────────────────────────────────────────
  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setDrawColor(180);
    doc.line(12, pageH - 10, pageW - 12, pageH - 10);
    doc.setFont("helvetica", "italic");
    doc.setFontSize(7);
    doc.setTextColor(90);
    if (rcfg.footer.left_text) {
      doc.text(rcfg.footer.left_text, 12, pageH - 6, { align: "left" });
    }
    doc.setFont("helvetica", "normal");
    const rightParts: string[] = [];
    if (rcfg.footer.show_page_number) {
      rightParts.push(
        rcfg.footer.show_total_pages ? `Página ${i} de ${total}` : `Página ${i}`,
      );
    }
    if (rcfg.footer.show_generated_at) {
      rightParts.push(`${rcfg.footer.generated_at_label}: ${new Date().toLocaleString("es-CO")}`);
    }
    if (rcfg.footer.show_system_name && rcfg.footer.system_name) {
      rightParts.push(rcfg.footer.system_name);
    }
    if (rightParts.length) {
      const rightAlign = rcfg.footer.alignment;
      const xR = rightAlign === "left" ? 12 : rightAlign === "center" ? pageW / 2 : pageW - 12;
      doc.text(rightParts.join(" · "), xR, pageH - 6, { align: rightAlign });
    }
    doc.setTextColor(0);
  }

  doc.save(`REPORTE_REMISIONES_ACTIVAS_${hoy()}.pdf`);
}

// ===========================================================================
// ENTREGA DE TURNO — REPORTE OPERATIVO (matriz tipo "TURNO MAÑANA")
// ---------------------------------------------------------------------------
// Referencia visual: TURNO_MAÑANA.pdf → orientación horizontal (legal landscape),
// encabezado institucional, bloque de entrega, contadores en tarjetas, matriz de
// remisiones activas con columnas agrupadas y secciones operativas de texto.
// Se genera BAJO DEMANDA y se descarga. NO se guarda archivo permanente.
// ===========================================================================


export async function descargarEntregaTurnoPDF(params: {
  turno: string;
  entrega: string;
  recibe: string;
  fecha: string;
  activas: number;
  especiales: number;
  internas: number;
  pendientes: number;
  reinicioNoche?: boolean;
  remisiones?: Remision[];
  domiciliarios?: Record<string, unknown>[];
  refsInternas?: Record<string, unknown>[];
  pendientesGenerales?: Record<string, unknown>[];
  observaciones?: string;
  contadores?: Record<string, number>;
  // NOVEDADES: avisos operativos activos + alertas de coordinación relevantes.
  novedades?: string[];
  // JORNADAS OTRAS IPS: tomadas de RED/DISPONIBILIDAD → Jornadas / Códigos TEP.
  jornadasOtrasIps?: string[];
}): Promise<void> {
  const cfg = await getPlantillaConfig("REPORTE_GENERAL_SALIENTES");
  const PIE = pickText(cfg, "pie_leyenda", PIE_DEFAULT);
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;
  const doc = new jsPDF({ unit: "mm", format: "legal", orientation: "landscape" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const logo = await getImg((logoAsset as { url: string }).url);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const finalY = (): number => (doc as any).lastAutoTable?.finalY ?? 0;

  // Banda de sección (ancho completo).
  const banda = (yy: number, texto: string): number => {
    if (yy > pageH - 24) {
      doc.addPage();
      yy = 16;
    }
    doc.setFillColor(NAVY[0], NAVY[1], NAVY[2]);
    doc.rect(8, yy - 4, pageW - 16, 6, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.text(texto, pageW / 2, yy, { align: "center" });
    doc.setTextColor(0);
    return yy + 5;
  };

  // Placeholder uniforme para cualquier sección sin registros: misma tipografía,
  // misma alineación, misma altura mínima y mismo espaciado bajo la barra azul.
  const PLACEHOLDER = "Sin registros para esta sección.";
  const placeholderVacio = (yy: number): number => {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(7.5);
    doc.setTextColor(130);
    doc.text(PLACEHOLDER, 10, yy + 3.5);
    doc.setTextColor(0);
    return yy + 9; // altura mínima uniforme del cuerpo vacío
  };

  // Sección de texto libre con placeholder uniforme cuando está vacía.
  const seccionTexto = (yy: number, titulo: string, contenido: string): number => {
    if (yy > pageH - 20) {
      doc.addPage();
      yy = 16;
    }
    if (titulo) yy = banda(yy, titulo);
    const txt = (contenido || "").trim();
    if (!txt) return placeholderVacio(yy) + 3;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(0);
    const lines = doc.splitTextToSize(txt, pageW - 20);
    doc.text(lines, 10, yy + 3.5);
    return yy + 4 * lines.length + 5;
  };

  // Tabla genérica (PHD, internas, pendientes).
  const tablaGenerica = (yy: number, titulo: string, items: Record<string, unknown>[]): number => {
    yy = banda(yy, titulo);
    if (!items || items.length === 0) return placeholderVacio(yy) + 3;
    const body = items.map((it) => [
      fmtFechaHora((it.fecha_inicio as string) ?? (it.created_at as string)),
      v(it.paciente ?? it.paciente_asunto),
      v(it.documento),

      v(it.servicio ?? it.tipo ?? it.asunto),
      v(it.estado ?? it.prioridad),
      v(it.observaciones ?? it.observacion_entrega ?? it.detalle),
    ]);
    autoTable(doc, {
      startY: yy,
      head: [["FECHA", "PACIENTE / ASUNTO", "DOCUMENTO", "SERVICIO / TIPO", "ESTADO", "OBSERVACIONES"]] as never,
      body: body as never,
      theme: "grid",
      styles: { fontSize: 6.5, cellPadding: 1, overflow: "linebreak", lineColor: [140, 140, 140], lineWidth: 0.15 },
      headStyles: { fillColor: NAVY, textColor: [255, 255, 255], fontStyle: "bold", fontSize: 6.5 },
      margin: { left: 8, right: 8 },
    });
    return finalY() + 4;
  };

  // ── Encabezado institucional ───────────────────────────────────────────
  if (logo) doc.addImage(logo, "PNG", 12, 7, 24, 16);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(110);
  doc.text(INSTITUCION, pageW / 2, 11, { align: "center" });
  doc.text(NIT, pageW / 2, 15, { align: "center" });
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(NAVY[0], NAVY[1], NAVY[2]);
  doc.text("ENTREGA DE TURNO · REFERENCIA Y CONTRARREFERENCIA", pageW / 2, 22, { align: "center" });
  doc.setTextColor(0);

  // ── Bloque de datos de entrega ─────────────────────────────────────────
  const lbl = (t: string) => ({ content: t, styles: { fillColor: NAVY, textColor: [255, 255, 255] as [number, number, number], fontStyle: "bold" as const } });
  autoTable(doc, {
    startY: 26,
    theme: "grid",
    styles: { fontSize: 8, cellPadding: 1.4, lineColor: [120, 120, 120], lineWidth: 0.2 },
    body: [[
      lbl("FECHA"), { content: params.fecha || "—" },
      lbl("TURNO"), { content: params.turno || "—" },
      lbl("ENTREGA TURNO"), { content: params.entrega || "—" },
      lbl("RECIBE TURNO"), { content: params.recibe || "—" },
    ]] as never,
    margin: { left: 12, right: 12 },
  });
  let y = finalY() + 3;

  // ── Contadores (tarjetas compactas) ────────────────────────────────────
  const c = params.contadores ?? {};
  const cont: [string, string][] = [
    ["REMISIONES ACTIVAS", String(params.activas)],
    ["PENDIENTES ACEPTACIÓN", String(c.acepPendiente ?? 0)],
    ["ACEPTADO SIN AMB.", String(c.acepSinAmb ?? 0)],
    ["ACEPTADO CON AMB.", String(c.acepConAmb ?? 0)],
    ["PHD/PAD/O2/ESP.", String(params.especiales)],
    ["REFERENCIAS INTERNAS", String(params.internas)],
    ["PENDIENTES GENERALES", String(params.pendientes)],
    ["DESISTIMIENTOS", String(c.desistimientos ?? 0)],
    ["ALTA PRIORIDAD", String(c.altaPrioridad ?? 0)],
    ["SIN SEG. RECIENTE", String(c.sinSeguimiento ?? 0)],
  ];
  autoTable(doc, {
    startY: y,
    theme: "grid",
    styles: { fontSize: 7, cellPadding: 1.2, halign: "center", lineColor: [120, 120, 120], lineWidth: 0.2 },
    body: [
      cont.map(([k]) => ({ content: k, styles: { fillColor: LIGHT_BLUE, textColor: NAVY, fontStyle: "bold" as const } })),
      cont.map(([, val]) => ({ content: val, styles: { fontStyle: "bold" as const, fontSize: 10 } })),
    ] as never,
    margin: { left: 12, right: 12 },
  });
  y = finalY() + 10; // separación uniforme entre tarjetas y la sección Remisiones Activas

  // ── Matriz REMISIONES ACTIVAS ──────────────────────────────────────────
  y = banda(y, "REMISIONES ACTIVAS");
  const rem = params.remisiones ?? [];
  const head = [[
    "CANT\nEVOL", "F. INICIO", "F. RADICADO", "T. TRÁMITE", "CAMA", "SERVICIO",
    "PACIENTE", "IDENT.", "EDAD", "CIE-10", "ESP. TRAT.", "ESP. RECEP.", "PRIORIDAD",
    "REMISIÓN POR", "MOTIVO", "TIPO TRÁMITE", "EAPB", "RÉGIMEN", "RADICACIÓN", "ESTADO",
    "IPS RECEPTORA", "TIPO AMB", "SOPORTES", "CONTACTO", "OBSERVACIONES",
  ]];
  const bodyRem = rem.map((r) => {
    const rr = r as unknown as Record<string, unknown>;
    const contacto = [v(r.contacto_nombre), v(r.contacto_parentesco), v(r.contacto_telefono)]
      .filter(Boolean).join(" / ");
    return [
      v(rr.evolucion),
      fmtFechaHora(r.fecha_inicio),
      fmtFechaHora(rr.fecha_radicado as string),
      fmtTranscurrido(r.fecha_inicio),
      v(rr.cama),
      v(r.servicio),
      v(r.paciente),
      v(r.documento),
      fmtEdad(r.edad),
      v(r.cie10),
      v(r.especialidades_tratantes),
      v(r.especialidades_receptoras),
      v(r.prioridad),
      v(rr.remision_por),
      v(rr.especificacion),
      v(rr.tipo_tramite),
      v(r.eapb || r.asegurador),
      v(r.regimen),
      v(r.codigo_radicacion),
      v(r.estado),
      v(rr.ips_receptora),
      v(r.tipo_ambulancia),
      v(rr.soportes),
      contacto,
      v(r.observaciones),
    ];
  });
  autoTable(doc, {
    startY: y,
    head: head as never,
    body: (bodyRem.length
      ? bodyRem
      : [[{ content: "Sin remisiones activas", colSpan: 25, styles: { halign: "center", textColor: [130, 130, 130], fontStyle: "italic" } }]]) as never,
    theme: "grid",
    styles: { fontSize: 5.3, cellPadding: 0.8, overflow: "linebreak", valign: "top", lineColor: [140, 140, 140], lineWidth: 0.15 },
    headStyles: { fillColor: NAVY, textColor: [255, 255, 255], fontStyle: "bold", fontSize: 5.3, halign: "center" },
    margin: { left: 8, right: 8 },
    tableWidth: "auto",
  });
  y = finalY() + 4;

  // ── Módulos secundarios ────────────────────────────────────────────────
  y = tablaGenerica(y, "PHD / PAD / O2 / ESPECIALES", params.domiciliarios ?? []);
  y = tablaGenerica(y, "REFERENCIAS INTERNAS", params.refsInternas ?? []);
  y = tablaGenerica(y, "PENDIENTES GENERALES DEL TURNO", params.pendientesGenerales ?? []);

  // ── Secciones operativas de texto (depuradas) ──────────────────────────
  // NOVEDADES = avisos operativos activos + alertas de coordinación + evento
  // automático de cierre nocturno (solo cuando realmente aplica).
  const cierreNoche = params.reinicioNoche
    ? "Cierre de turno NOCHE: la evolución de todos los casos se reinició a «Sin evolucionar». " +
      "Las evoluciones pendientes se enviaron como alertas a Coordinación."
    : "";
  const novedades = [...(params.novedades ?? []), cierreNoche]
    .map((s) => (s || "").trim())
    .filter(Boolean)
    .join("\n");
  y = seccionTexto(y, "NOVEDADES", novedades);
  // JORNADAS OTRAS IPS = RED/DISPONIBILIDAD → Jornadas / Códigos TEP.
  y = seccionTexto(y, "JORNADAS OTRAS IPS", (params.jornadasOtrasIps ?? []).join("\n"));
  // OBSERVACIONES DE ENTREGA = observaciones registradas al guardar la entrega.
  seccionTexto(y, "OBSERVACIONES DE ENTREGA", params.observaciones ?? "");
  // Se eliminaron INFORMACIÓN GENERAL, NOVEDADES CEDIM IPS, LÍNEAS DE CONTACTO
  // y DATOS DE AMBULANCIAS / CUPS: se consultan en RED/DISPONIBILIDAD.

  // ── Pie en todas las páginas ───────────────────────────────────────────
  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setDrawColor(180);
    doc.line(12, pageH - 10, pageW - 12, pageH - 10);
    doc.setFont("helvetica", "italic");
    doc.setFontSize(7);
    doc.setTextColor(90);
    doc.text(PIE, pageW / 2, pageH - 6, { align: "center" });
    doc.setFont("helvetica", "normal");
    doc.text(`Página ${i} de ${total} · Generado: ${new Date().toLocaleString("es-CO")}`, pageW - 12, pageH - 6, {
      align: "right",
    });
    doc.setTextColor(0);
  }

  doc.save(`Entrega_Turno_${params.turno}_${hoy()}.pdf`);
}
