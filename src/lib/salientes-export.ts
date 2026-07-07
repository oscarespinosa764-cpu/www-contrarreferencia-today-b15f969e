// Generación BAJO DEMANDA de exportables del Dashboard Operativo Salientes.
//
// CONTROL DE COSTOS: todo se construye en memoria en el navegador y se entrega
// como descarga real (jsPDF / SheetJS, 100% JS, sin servicios externos). NO se
// guarda ningún archivo permanente en el bucket ni en la base de datos.
//
// Mecanismo de descarga: jsPDF `doc.save()` y SheetJS `XLSX.writeFile()` crean
// internamente un Blob + object URL + anchor temporal con `download` y lo
// revocan tras la descarga, por lo que la descarga es confiable y limpia.

import * as XLSX from "xlsx";
import logoAsset from "@/assets/cedim-logo.png.asset.json";
import { fmtFechaHora, fmtEdad, fmtTranscurrido } from "./remisiones-utils";
import type { Remision } from "@/components/remisiones/caso-remision-card";

const INSTITUCION = "CENTRO DE IMAGENES DIAGNOSTICAS CEDIM I.P.S S.A.S";
const NIT = "NIT: 900559103-5";
const PIE = "SISTEMA DE REFERENCIA Y CONTRARREFERENCIA";
const NAVY: [number, number, number] = [31, 56, 100];
const LIGHT_BLUE: [number, number, number] = [221, 235, 247];

const v = (x: unknown): string => (x === null || x === undefined ? "" : String(x).trim());
const hoy = () => new Date().toISOString().slice(0, 10);

// Contadores compartidos por el bloque de tarjetas superiores (Reporte General
// y Entrega de Turno usan exactamente la misma fila resumen).
function tarjetasResumen(p: {
  activas: number;
  especiales: number;
  internas: number;
  pendientes: number;
  contadores?: Record<string, number>;
}): [string, string][] {
  const c = p.contadores ?? {};
  return [
    // Reporte General: solo 5 tarjetas resumen (institucionales, proporcionadas).
    ["REMISIONES ACTIVAS", String(p.activas)],
    ["PENDIENTES ACEPTACIÓN", String(c.acepPendiente ?? 0)],
    ["ACEPTADO SIN AMB.", String(c.acepSinAmb ?? 0)],
    ["ACEPTADO CON AMB.", String(c.acepConAmb ?? 0)],
    ["DESISTIMIENTOS", String(c.desistimientos ?? 0)],
  ];
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
// EXCEL CRUE — listado de remisiones salientes activas (formato operativo)
// ===========================================================================
export function descargarExcelCRUE(remisiones: Remision[]): void {
  if (!remisiones || remisiones.length === 0) {
    throw new Error("No se encontraron remisiones activas para exportar.");
  }
  const headers = [
    "FECHA INICIO",
    "PACIENTE",
    "TIPO DOC",
    "DOCUMENTO",
    "EDAD",
    "CIE-10",
    "EAPB / ASEGURADOR",
    "RÉGIMEN",
    "SERVICIO",
    "PRIORIDAD",
    "ESTADO",
    "ESP. TRATANTES",
    "ESP. RECEPTORAS",
    "TIPO AMBULANCIA",
    "RADICADO",
  ];
  const rows = remisiones.map((r) => [
    fmtFechaHora(r.fecha_inicio),
    v(r.paciente),
    v(r.tipo_documento),
    v(r.documento),
    fmtEdad(r.edad),
    v(r.cie10),
    v(r.eapb || r.asegurador),
    v(r.regimen),
    v(r.servicio),
    v(r.prioridad),
    v(r.estado),
    v(r.especialidades_tratantes),
    v(r.especialidades_receptoras),
    v(r.tipo_ambulancia),
    v(r.codigo_radicacion),
  ]);

  const meta = [
    [INSTITUCION],
    [NIT],
    ["FORMATO CRUE — REMISIONES SALIENTES ACTIVAS"],
    [`Generado: ${new Date().toLocaleString("es-CO")}`],
    [],
  ];
  const aoa = [...meta, headers, ...rows];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = headers.map((h, i) => ({
    wch: Math.max(h.length, ...rows.map((row) => v(row[i]).length)) + 2,
  }));
  const ref = ws["!ref"];
  if (ref) ws["!autofilter"] = { ref: `A6:O6` };
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "CRUE");
  XLSX.writeFile(wb, `Excel_CRUE_${hoy()}.xlsx`);
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
}): Promise<void> {
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;
  const doc = new jsPDF({ unit: "mm", format: "legal", orientation: "landscape" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const logo = await getImg((logoAsset as { url: string }).url);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const finalY = (): number => (doc as any).lastAutoTable?.finalY ?? 0;

  // ── Encabezado institucional (SIN turno) ────────────────────────────────
  if (logo) doc.addImage(logo, "PNG", 12, 7, 24, 16);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(110);
  doc.text(INSTITUCION, pageW / 2, 11, { align: "center" });
  doc.text(NIT, pageW / 2, 15, { align: "center" });
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(NAVY[0], NAVY[1], NAVY[2]);
  doc.text("REPORTE GENERAL OPERATIVO — SALIENTES", pageW / 2, 22, { align: "center" });
  doc.setTextColor(0);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(
    `Generado por: ${params.usuario}   ·   ${new Date().toLocaleString("es-CO")}`,
    pageW / 2,
    28,
    { align: "center" },
  );

  // ── Tarjetas resumen (idénticas a Entrega de Turno) ─────────────────────
  const cont = tarjetasResumen(params);
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
  let y = finalY() + 8; // separación visual antes de la sección

  // ── Banda de sección REMISIONES ACTIVAS ─────────────────────────────────
  doc.setFillColor(NAVY[0], NAVY[1], NAVY[2]);
  doc.rect(8, y - 4, pageW - 16, 6, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.text("REMISIONES ACTIVAS", pageW / 2, y, { align: "center" });
  doc.setTextColor(0);
  y += 5;

  const head = [[
    "F. INICIO", "F. RADICADO", "T. TRÁMITE", "SERVICIO", "PACIENTE", "IDENT.", "EDAD",
    "CIE-10", "ESP. TRAT.", "ESP. RECEP.", "REMISIÓN POR", "MOTIVO", "TIPO TRÁMITE",
    "EAPB", "RÉGIMEN", "RADICACIÓN", "ESTADO", "IPS RECEPTORA", "TIPO AMB", "SOPORTES",
  ]];
  const body = (params.remisiones ?? []).map((r) => {
    const rr = r as unknown as Record<string, unknown>;
    return [
      fmtFechaHora(r.fecha_inicio),
      fmtFechaHora(rr.fecha_radicado as string),
      fmtTranscurrido(r.fecha_inicio),
      v(r.servicio),
      v(r.paciente),
      v(r.documento),
      fmtEdad(r.edad),
      v(r.cie10),
      v(r.especialidades_tratantes),
      v(r.especialidades_receptoras),
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
    ];
  });

  autoTable(doc, {
    startY: y,
    head: head as never,
    body: (body.length
      ? body
      : [[{ content: "Sin remisiones activas", colSpan: 20, styles: { halign: "center", textColor: [130, 130, 130], fontStyle: "italic" } }]]) as never,
    theme: "grid",
    styles: { fontSize: 5.6, cellPadding: 0.9, overflow: "linebreak", valign: "top", lineColor: [140, 140, 140], lineWidth: 0.15 },
    headStyles: { fillColor: NAVY, textColor: [255, 255, 255], fontStyle: "bold", fontSize: 5.6, halign: "center" },
    margin: { left: 8, right: 8 },
    tableWidth: "auto",
  });

  // ── Pie en todas las páginas ────────────────────────────────────────────
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

  doc.save(`Reporte_General_Operativo_Salientes_${hoy()}.pdf`);
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

  // ── Secciones operativas de texto ──────────────────────────────────────
  const noche = params.reinicioNoche
    ? "Cierre de turno NOCHE: la evolución de todos los casos se reinició a «Sin evolucionar». " +
      "Las evoluciones pendientes se enviaron como alertas a Coordinación."
    : "";
  y = seccionTexto(y, "NOVEDADES", noche);
  y = seccionTexto(y, "JORNADAS OTRAS IPS", "");
  y = seccionTexto(y, "INFORMACIÓN GENERAL", "");
  y = seccionTexto(y, "NOVEDADES CEDIM IPS", "");
  y = seccionTexto(y, "LÍNEAS DE CONTACTO", "Referencia y Contrarreferencia · (608) 4366810 EXT: 2007");
  y = seccionTexto(y, "DATOS DE AMBULANCIAS / CUPS", "");
  seccionTexto(y, "OBSERVACIONES DE ENTREGA", params.observaciones ?? "");

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
