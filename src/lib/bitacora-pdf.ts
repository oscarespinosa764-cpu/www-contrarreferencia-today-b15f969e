// Generador de PDF tipo "Bitácora de Referencia" institucional (CEDIM IPS).
// Reproduce el formato del documento institucional: encabezado centrado, NIT,
// título GESTIÓN DE REFERENCIA, secciones con fondo gris, tabla de seguimientos
// con paginación y pie de página en cada hoja.
//
// Pensado para ejecutarse en el navegador (cliente). jsPDF + autotable son
// librerías 100% JS, compatibles con el bundler.

import type { jsPDF } from "jspdf";

const INSTITUCION = "CENTRO DE IMAGENES DIAGNOSTICAS CEDIM I.P.S S.A.S";
const NIT = "NIT: 900559103-5";
const TITULO = "GESTIÓN DE REFERENCIA";
const PIE = "CEDIM IPS - Referencia y Contrarreferencia";

export type CampoPDF = { label: string; value: string };

export type SeguimientoPDF = {
  fecha: string;
  entidad: string;
  observaciones: string;
  estado: string;
  contacto: string; // nombre de contacto o tipo de seguimiento
  funcionario: string;
};

export type BitacoraInput = {
  /** Subtítulo del documento, ej. "REMISIÓN SALIENTE", "PHD/PAD/O2". */
  tipoDocumento: string;
  /** Identificador legible del caso (radicado / documento) para el archivo. */
  referencia: string;
  datosPaciente: CampoPDF[];
  datosReferencia: CampoPDF[];
  seguimientos: SeguimientoPDF[];
  /** Usuario autenticado que genera el documento. */
  usuario: string;
};

function fechaLarga(d: Date): string {
  const dias = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
  const meses = [
    "enero", "febrero", "marzo", "abril", "mayo", "junio",
    "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
  ];
  const pad = (n: number) => String(n).padStart(2, "0");
  let h = d.getHours();
  const ampm = h >= 12 ? "p. m." : "a. m.";
  h = h % 12 || 12;
  return `${dias[d.getDay()]}, ${pad(d.getDate())} de ${meses[d.getMonth()]} de ${d.getFullYear()} ${pad(h)}:${pad(d.getMinutes())} ${ampm}`;
}

function fechaCorta(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} a las ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** Dibuja una franja de sección con fondo gris claro. */
function seccion(doc: jsPDF, titulo: string, y: number, margin: number, ancho: number): number {
  doc.setFillColor(225, 230, 236);
  doc.rect(margin, y, ancho, 7, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(20, 40, 70);
  doc.text(titulo, margin + 2, y + 4.8);
  return y + 7;
}

/** Renderiza una rejilla de pares label:value en dos columnas. */
function camposGrid(
  doc: jsPDF,
  campos: CampoPDF[],
  y: number,
  margin: number,
  ancho: number,
): number {
  const colW = ancho / 2;
  const lineH = 5;
  doc.setFontSize(8);
  let cursor = y + 4;
  for (let i = 0; i < campos.length; i += 2) {
    const fila = campos.slice(i, i + 2);
    let maxLines = 1;
    const rendered: { x: number; lines: string[]; label: string }[] = [];
    fila.forEach((c, idx) => {
      const x = margin + idx * colW;
      doc.setFont("helvetica", "bold");
      const labelTxt = `${c.label}: `;
      const labelW = doc.getTextWidth(labelTxt);
      doc.setFont("helvetica", "normal");
      const lines = doc.splitTextToSize(c.value || "—", colW - labelW - 4) as string[];
      maxLines = Math.max(maxLines, lines.length);
      rendered.push({ x, lines, label: labelTxt });
    });
    rendered.forEach((r) => {
      doc.setFont("helvetica", "bold");
      doc.setTextColor(40, 40, 40);
      doc.text(r.label, r.x + 1, cursor);
      const labelW = doc.getTextWidth(r.label);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(20, 20, 20);
      doc.text(r.lines, r.x + 1 + labelW, cursor);
    });
    cursor += maxLines * lineH;
  }
  return cursor + 1;
}

export async function generarBitacoraPDF(input: BitacoraInput): Promise<void> {
  const [{ jsPDF }, autoTableMod] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);
  const autoTable = autoTableMod.default;
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 12;
  const ancho = pageW - margin * 2;
  const ahora = new Date();

  const drawHeader = () => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(15, 35, 65);
    doc.text(INSTITUCION, pageW / 2, 14, { align: "center" });
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(80, 80, 80);
    doc.text(NIT, pageW - margin, 19, { align: "right" });
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(15, 35, 65);
    doc.text(TITULO, pageW / 2, 22, { align: "center" });
    doc.setDrawColor(150, 160, 175);
    doc.setLineWidth(0.3);
    doc.line(margin, 25, pageW - margin, 25);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(90, 90, 90);
    doc.text(`Fecha De Impresión: ${fechaLarga(ahora)}`, margin, 30);
  };

  const drawFooter = (page: number, total: number) => {
    doc.setFontSize(7);
    doc.setTextColor(110, 110, 110);
    doc.text(
      `Impreso el ${fechaCorta(ahora)} por el usuario ${input.usuario}`,
      margin,
      pageH - 9,
    );
    doc.text(PIE, margin, pageH - 6);
    doc.text(`Página ${page}/${total}`, pageW - margin, pageH - 6, { align: "right" });
  };

  // Primera página: encabezado + datos
  drawHeader();
  let y = 35;
  y = seccion(doc, `DATOS DEL PACIENTE  (${input.tipoDocumento})`, y, margin, ancho);
  y = camposGrid(doc, input.datosPaciente, y, margin, ancho);
  y += 2;
  y = seccion(doc, "DATOS DE LA REFERENCIA", y, margin, ancho);
  y = camposGrid(doc, input.datosReferencia, y, margin, ancho);
  y += 3;
  y = seccion(doc, "SEGUIMIENTOS REFERENCIA", y, margin, ancho);

  const body =
    input.seguimientos.length > 0
      ? input.seguimientos.map((s) => [
          s.fecha,
          s.entidad,
          s.observaciones,
          s.estado,
          s.contacto,
          s.funcionario,
        ])
      : [["—", "—", "Sin seguimientos registrados.", "—", "—", "—"]];

  autoTable(doc, {
    startY: y + 1,
    margin: { left: margin, right: margin, top: 33, bottom: 14 },
    head: [["Fecha registro", "Entidad / IPS / Otra", "Observaciones", "Estado", "Nombre contacto", "Funcionario"]],
    body,
    styles: { fontSize: 7, cellPadding: 1.5, valign: "top", overflow: "linebreak", textColor: [25, 25, 25] },
    headStyles: { fillColor: [30, 60, 100], textColor: [255, 255, 255], fontSize: 7, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [243, 246, 250] },
    columnStyles: {
      0: { cellWidth: 22 },
      1: { cellWidth: 28 },
      2: { cellWidth: "auto" },
      3: { cellWidth: 20 },
      4: { cellWidth: 26 },
      5: { cellWidth: 26 },
    },
    didDrawPage: () => {
      drawHeader();
    },
  });

  // Pie en todas las páginas
  const total = doc.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    drawFooter(p, total);
  }

  const safeRef = (input.referencia || "caso").replace(/[^\w\-]+/g, "_");
  doc.save(`bitacora_${safeRef}_${ahora.toISOString().slice(0, 10)}.pdf`);
}
