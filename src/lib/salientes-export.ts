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

const v = (x: unknown): string => (x === null || x === undefined ? "" : String(x).trim());
const hoy = () => new Date().toISOString().slice(0, 10);

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
// REPORTE GENERAL — PDF operativo del turno
// ===========================================================================
export async function descargarReporteGeneralPDF(params: {
  remisiones: Remision[];
  especiales: number;
  internas: number;
  pendientes: number;
  usuario: string;
  turno: string;
}): Promise<void> {
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;
  const doc = new jsPDF({ unit: "mm", format: "letter", orientation: "landscape" });
  const pageW = doc.internal.pageSize.getWidth();
  const logo = await getImg((logoAsset as { url: string }).url);

  if (logo) doc.addImage(logo, "PNG", 14, 8, 24, 16);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(110);
  doc.text(INSTITUCION, pageW / 2, 12, { align: "center" });
  doc.text(NIT, pageW / 2, 16, { align: "center" });
  doc.setTextColor(0);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.setTextColor(NAVY[0], NAVY[1], NAVY[2]);
  doc.text("REPORTE GENERAL OPERATIVO — SALIENTES", pageW / 2, 26, { align: "center" });
  doc.setTextColor(0);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(
    `Turno: ${params.turno}   ·   Generado por: ${params.usuario}   ·   ${new Date().toLocaleString("es-CO")}`,
    pageW / 2,
    32,
    { align: "center" },
  );

  doc.setFontSize(9);
  doc.text(
    `Remisiones activas: ${params.remisiones.length}   ·   PHD/Especiales: ${params.especiales}   ·   Ref. internas: ${params.internas}   ·   Pendientes: ${params.pendientes}`,
    14,
    40,
  );

  const body = params.remisiones.map((r) => [
    fmtFechaHora(r.fecha_inicio),
    v(r.paciente),
    v(r.documento),
    v(r.eapb || r.asegurador),
    v(r.servicio),
    v(r.prioridad),
    v(r.estado),
  ]);

  autoTable(doc, {
    startY: 44,
    head: [["FECHA", "PACIENTE", "DOCUMENTO", "EAPB", "SERVICIO", "PRIORIDAD", "ESTADO"]],
    body: body.length ? (body as never) : ([["—", "Sin remisiones activas", "", "", "", "", ""]] as never),
    theme: "grid",
    styles: { fontSize: 7.5, cellPadding: 1.5 },
    headStyles: { fillColor: NAVY, textColor: [255, 255, 255], fontStyle: "bold", fontSize: 7.5 },
    margin: { left: 14, right: 14 },
  });

  const pageH = doc.internal.pageSize.getHeight();
  doc.setDrawColor(180);
  doc.line(14, pageH - 12, pageW - 14, pageH - 12);
  doc.setFont("helvetica", "italic");
  doc.setFontSize(7.5);
  doc.setTextColor(90);
  doc.text(PIE, pageW / 2, pageH - 8, { align: "center" });
  doc.setTextColor(0);

  doc.save(`Reporte_General_Turno_${hoy()}.pdf`);
}

// ===========================================================================
// ENTREGA DE TURNO — PDF de trazabilidad de la entrega
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
}): Promise<void> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "letter" });
  const pageW = doc.internal.pageSize.getWidth();
  const logo = await getImg((logoAsset as { url: string }).url);

  if (logo) doc.addImage(logo, "PNG", 14, 8, 26, 18);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(110);
  doc.text(INSTITUCION, pageW / 2, 12, { align: "center" });
  doc.text(NIT, pageW / 2, 16, { align: "center" });
  doc.setTextColor(0);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(17);
  doc.setTextColor(NAVY[0], NAVY[1], NAVY[2]);
  doc.text("ENTREGA DE TURNO", pageW / 2, 32, { align: "center" });
  doc.setTextColor(0);

  let y = 48;
  const fila = (k: string, val: string) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text(`${k}:`, 16, y);
    const kw = doc.getTextWidth(`${k}: `);
    doc.setFont("helvetica", "normal");
    const lines = doc.splitTextToSize(val || "—", pageW - 32 - kw);
    doc.text(lines, 16 + kw, y);
    y += 7 * lines.length;
  };
  fila("TURNO QUE ENTREGA", params.turno);
  fila("ENTREGA", params.entrega);
  fila("RECIBE", params.recibe);
  fila("FECHA Y HORA", params.fecha);

  y += 4;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("RESUMEN DE CASOS ACTIVOS", 16, y);
  y += 7;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  fila("REMISIONES ACTIVAS", String(params.activas));
  fila("PHD / PAD / O2 / ESPECIALES", String(params.especiales));
  fila("REFERENCIAS INTERNAS", String(params.internas));
  fila("PENDIENTES GENERALES", String(params.pendientes));

  if (params.reinicioNoche) {
    y += 4;
    doc.setFont("helvetica", "italic");
    doc.setFontSize(9);
    doc.setTextColor(150, 90, 0);
    const t = doc.splitTextToSize(
      "Cierre de turno NOCHE: la evolución de todos los casos se reinició a «Sin evolucionar». Las evoluciones pendientes se enviaron como alertas a Coordinación.",
      pageW - 32,
    );
    doc.text(t, 16, y);
    doc.setTextColor(0);
  }

  const pageH = doc.internal.pageSize.getHeight();
  doc.setDrawColor(180);
  doc.line(14, pageH - 12, pageW - 14, pageH - 12);
  doc.setFont("helvetica", "italic");
  doc.setFontSize(7.5);
  doc.setTextColor(90);
  doc.text(PIE, pageW / 2, pageH - 8, { align: "center" });
  doc.text(`Generado: ${new Date().toLocaleString("es-CO")}`, pageW - 14, pageH - 8, { align: "right" });
  doc.setTextColor(0);

  doc.save(`Entrega_Turno_${params.turno}_${hoy()}.pdf`);
}
