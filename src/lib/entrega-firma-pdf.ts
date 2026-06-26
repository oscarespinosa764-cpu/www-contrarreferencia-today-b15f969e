// Generación BAJO DEMANDA de los PDF de entrega documental (CEDIM IPS).
//
// IMPORTANTE (control de costos): estos PDF se construyen en memoria en el
// navegador y se entregan para descarga. NO se guardan en el bucket ni en la
// base de datos. jsPDF es 100% JavaScript (sin servicios externos, sin IA).

import logoAsset from "@/assets/cedim-logo.png.asset.json";

const INSTITUCION = "CENTRO DE IMAGENES DIAGNOSTICAS CEDIM I.P.S S.A.S";
const NIT = "NIT: 900559103-5";
const PIE = "SISTEMA DE REFERENCIA Y CONTRARREFERENCIA";

const TEXTO_ACEPTACION =
  "Declaro que recibo la documentación relacionada en la lista de chequeo para el traslado " +
  "del paciente y que la información registrada corresponde a la entrega realizada.";

export type DocumentoChecklist = { label: string; marcado: boolean };

export type EntregaDatos = {
  paciente: string;
  documento: string;
  ips_receptora: string;
  empresa_traslado: string;
  fecha_entrega: string;
  documentos: DocumentoChecklist[];
  caso_ref?: string;
};

export type FirmaDatos = {
  nombre: string;
  cargo: string;
  empresa: string;
  documento: string;
  telefono: string;
  firma_data: string;
  firmado_at: string;
  codigo_verificacion: string;
  pdf_hash?: string;
};

let logoCache: string | null | undefined;
async function getLogo(): Promise<string | null> {
  if (logoCache !== undefined) return logoCache;
  try {
    const res = await fetch((logoAsset as { url: string }).url);
    const blob = await res.blob();
    logoCache = await new Promise<string>((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result as string);
      fr.onerror = reject;
      fr.readAsDataURL(blob);
    });
  } catch {
    logoCache = null;
  }
  return logoCache;
}

function fmtFecha(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" });
}

type Doc = import("jspdf").jsPDF;

async function nuevoDoc(titulo: string): Promise<Doc> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "letter" });
  const pageW = doc.internal.pageSize.getWidth();
  const logo = await getLogo();
  if (logo) doc.addImage(logo, "PNG", 14, 8, 20, 14.5);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text(INSTITUCION, pageW / 2, 12, { align: "center" });
  doc.setFontSize(11);
  doc.text(titulo, pageW / 2, 18, { align: "center" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text(NIT, pageW - 14, 12, { align: "right" });
  doc.setDrawColor(180);
  doc.line(14, 25, pageW - 14, 25);
  return doc;
}

function pie(doc: Doc) {
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  doc.setFontSize(7);
  doc.setTextColor(120);
  doc.text(PIE, pageW / 2, pageH - 8, { align: "center" });
  doc.text(`Generado: ${new Date().toLocaleString("es-CO")}`, pageW - 14, pageH - 8, {
    align: "right",
  });
  doc.setTextColor(0);
}

function bloqueDatos(doc: Doc, y: number, filas: [string, string][]): number {
  const pageW = doc.internal.pageSize.getWidth();
  doc.setFontSize(9);
  for (const [k, v] of filas) {
    doc.setFont("helvetica", "bold");
    doc.text(`${k}:`, 16, y);
    doc.setFont("helvetica", "normal");
    const lines = doc.splitTextToSize(v || "—", pageW - 70);
    doc.text(lines, 60, y);
    y += 6 * lines.length;
  }
  return y;
}

function descargar(doc: Doc, nombre: string) {
  doc.save(nombre);
}

/** Portada — "ENTREGA DE PACIENTE / REMISIÓN". On demand, no persiste. */
export async function descargarPortadaPDF(d: EntregaDatos) {
  const doc = await nuevoDoc("PORTADA — ENTREGA DE PACIENTE / REMISIÓN");
  let y = 34;
  y = bloqueDatos(doc, y, [
    ["Paciente", d.paciente],
    ["Documento", d.documento],
    ["IPS receptora", d.ips_receptora],
    ["Empresa de traslado", d.empresa_traslado],
    ["Fecha/hora de entrega", d.fecha_entrega],
    ["Referencia", d.caso_ref ?? ""],
  ]);
  y += 6;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("DOCUMENTACIÓN RELACIONADA", 16, y);
  y += 6;
  doc.setFont("helvetica", "normal");
  for (const it of d.documentos) {
    doc.text(`${it.marcado ? "[X]" : "[ ]"}  ${it.label}`, 18, y);
    y += 6;
  }
  pie(doc);
  descargar(doc, `Portada-Entrega-${(d.documento || "remision").replace(/\s+/g, "")}.pdf`);
}

/** Lista de chequeo documental (sin firmar). On demand, no persiste. */
export async function descargarChecklistPDF(d: EntregaDatos) {
  const doc = await nuevoDoc("LISTA DE CHEQUEO DE DOCUMENTACIÓN — REFERENCIA");
  let y = 34;
  y = bloqueDatos(doc, y, [
    ["Paciente", d.paciente],
    ["Documento", d.documento],
    ["IPS receptora", d.ips_receptora],
    ["Empresa de traslado", d.empresa_traslado],
    ["Fecha/hora de entrega", d.fecha_entrega],
  ]);
  y += 4;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("DOCUMENTOS ENTREGADOS", 16, y);
  y += 7;
  doc.setFont("helvetica", "normal");
  for (const it of d.documentos) {
    doc.rect(18, y - 3.5, 4, 4);
    if (it.marcado) doc.text("X", 19, y);
    doc.text(it.label, 25, y);
    y += 7;
  }
  pie(doc);
  descargar(doc, `Checklist-${(d.documento || "remision").replace(/\s+/g, "")}.pdf`);
}

/** PDF FINAL firmado por QR. On demand, no persiste. */
export async function descargarFirmadoPDF(d: EntregaDatos, f: FirmaDatos) {
  const doc = await nuevoDoc("LISTA DE CHEQUEO FIRMADA — ENTREGA DOCUMENTAL");
  const pageW = doc.internal.pageSize.getWidth();
  let y = 34;
  y = bloqueDatos(doc, y, [
    ["Paciente", d.paciente],
    ["Documento", d.documento],
    ["IPS receptora", d.ips_receptora],
    ["Empresa de traslado", d.empresa_traslado],
    ["Fecha/hora de entrega", d.fecha_entrega],
  ]);
  y += 3;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("DOCUMENTOS ENTREGADOS", 16, y);
  y += 6;
  doc.setFont("helvetica", "normal");
  for (const it of d.documentos) {
    doc.text(`${it.marcado ? "[X]" : "[ ]"}  ${it.label}`, 18, y);
    y += 5.5;
  }
  y += 4;
  doc.setFont("helvetica", "bold");
  doc.text("DATOS DEL FIRMANTE (PERSONAL DE TRASLADO)", 16, y);
  y += 6;
  y = bloqueDatos(doc, y, [
    ["Nombre", f.nombre],
    ["Cargo", f.cargo],
    ["Empresa de ambulancia", f.empresa],
    ["Documento / identificación", f.documento],
    ["Teléfono", f.telefono],
    ["Fecha/hora de firma", fmtFecha(f.firmado_at)],
  ]);
  y += 4;
  doc.setFont("helvetica", "bold");
  doc.text("ACEPTACIÓN DE RECIBIDO", 16, y);
  y += 5;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  const acept = doc.splitTextToSize(`[X] ${TEXTO_ACEPTACION}`, pageW - 32);
  doc.text(acept, 16, y);
  y += 5 * acept.length + 4;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("FIRMA", 16, y);
  y += 3;
  if (f.firma_data) {
    try {
      doc.addImage(f.firma_data, "PNG", 16, y, 70, 28);
    } catch {
      /* firma no renderizable */
    }
  }
  doc.setDrawColor(120);
  doc.line(16, y + 30, 90, y + 30);
  y += 38;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text(`Código de verificación: ${f.codigo_verificacion}`, 16, y);
  y += 5;
  if (f.pdf_hash) {
    const h = doc.splitTextToSize(`Hash de evidencia: ${f.pdf_hash}`, pageW - 32);
    doc.text(h, 16, y);
  }
  pie(doc);
  descargar(doc, `Entrega-Firmada-${f.codigo_verificacion}.pdf`);
}
