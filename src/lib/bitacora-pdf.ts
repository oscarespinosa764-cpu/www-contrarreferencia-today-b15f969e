// Generador de PDF tipo "Bitácora de Referencia" institucional (CEDIM IPS).
// Reproduce el formato del documento institucional: logo arriba a la izquierda,
// encabezado centrado, NIT a la derecha, título GESTIÓN DE REFERENCIA, secciones
// con fondo gris, tabla SEGUIMIENTOS REFERENCIA con paginación y pie de página en
// cada hoja.
//
// FASE 8: presentación administrable desde Control de Mando → Plantillas del
// sistema (código BITACORA_ENTRANTES). Los datos operativos (paciente, caso,
// seguimientos, estados, fechas, responsables y orden cronológico) NO son
// configurables: sólo etiquetas, encabezados y visibilidad de columnas.

import type { jsPDF } from "jspdf";
import logoAsset from "@/assets/cedim-logo.png.asset.json";
import {
  loadBitacoraConfig,
  type BitacoraConfig,
  type BitacoraColumnKey,
} from "./bitacora-config";

const NIT_FALLBACK = "NIT: 900559103-5";

export type CampoPDF = { label: string; value: string };

export type SeguimientoPDF = {
  fecha: string;
  entidad: string;
  observaciones: string;
  estado: string;
  /** Acción realizada (antes "Nombre contacto"). */
  accion: string;
  funcionario: string;
  /** Marca interna para ordenar cronológicamente (timestamp). */
  _orden?: number;
};

/** Un bloque de caso dentro de la bitácora (consolidada o individual). */
export type BloqueCaso = {
  /** Tipo de trámite legible, ej. "REMISIÓN SALIENTE". */
  tipoDocumento: string;
  datosReferencia: CampoPDF[];
  seguimientos: SeguimientoPDF[];
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
  /** Config borrador (vista previa). Si se omite, se carga la versión publicada. */
  configOverride?: BitacoraConfig;
};

export type BitacoraConsolidadaInput = {
  referencia: string;
  datosPaciente: CampoPDF[];
  bloques: BloqueCaso[];
  usuario: string;
  /** Config borrador (vista previa). Si se omite, se carga la versión publicada. */
  configOverride?: BitacoraConfig;
};

// ---------------------------------------------------------------------------
// Limpieza de texto (markdown / marcas de resaltado) para Observaciones.
// ---------------------------------------------------------------------------
export function limpiarTexto(s: string | null | undefined): string {
  if (!s) return "—";
  let t = String(s);
  t = t.replace(/={2,}/g, " ");
  t = t.replace(/`{1,}/g, "");
  t = t.replace(/#{1,}/g, "");
  t = t.replace(/\*{1,}/g, "");
  t = t.replace(/_{2,}/g, "");
  t = t.replace(/~{1,}/g, "");
  t = t.replace(/[ \t]{2,}/g, " ");
  t = t.replace(/[ \t]+\n/g, "\n");
  t = t.replace(/\n{3,}/g, "\n\n");
  return t.trim() || "—";
}

// ---------------------------------------------------------------------------
// Logo institucional (cacheado como dataURL).
// ---------------------------------------------------------------------------
let logoCache: string | null | undefined;

async function getLogo(): Promise<string | null> {
  if (logoCache !== undefined) return logoCache;
  try {
    const res = await fetch((logoAsset as { url: string }).url);
    const blob = await res.blob();
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result as string);
      fr.onerror = reject;
      fr.readAsDataURL(blob);
    });
    logoCache = dataUrl;
  } catch {
    logoCache = null;
  }
  return logoCache;
}

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
  fontSize: number,
): number {
  const colW = ancho / 2;
  const lineH = Math.max(4, fontSize * 0.62);
  doc.setFontSize(fontSize);
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

// ---------------------------------------------------------------------------
// Render principal compartido (individual + consolidado).
// ---------------------------------------------------------------------------
async function renderBitacora(
  input: BitacoraConsolidadaInput,
): Promise<void> {
  const [{ jsPDF }, autoTableMod, { config }] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
    input.configOverride
      ? Promise.resolve({ config: input.configOverride, fallback: false })
      : loadBitacoraConfig(),
  ]);
  const autoTable = autoTableMod.default;
  const logo = config.header.show_logo ? await getLogo() : null;

  const doc = new jsPDF({
    unit: "mm",
    format: config.page.page_size,
    orientation: config.page.orientation,
  });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = config.page.margin_left;
  const marginR = config.page.margin_right;
  const marginT = config.page.margin_top;
  const marginB = config.page.margin_bottom;
  const ancho = pageW - margin - marginR;
  const ahora = new Date();
  const headerBottom = marginT + 21;

  const drawHeader = () => {
    if (logo) {
      try {
        doc.addImage(logo, "PNG", margin, marginT - 5, 20, 14.5);
      } catch {
        /* si falla el logo, continuar sin él */
      }
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(15, 35, 65);
    doc.text(config.header.institution_name, pageW / 2, marginT + 2, { align: "center" });
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(80, 80, 80);
    const nit = [config.header.institution_identifier_label, config.header.institution_identifier_value]
      .filter(Boolean)
      .join(" ")
      .trim() || NIT_FALLBACK;
    doc.text(nit, pageW - marginR, marginT + 7, { align: "right" });
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(15, 35, 65);
    doc.text(config.header.report_title, pageW / 2, marginT + 10, { align: "center" });
    if (config.header.report_subtitle) {
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.text(config.header.report_subtitle, pageW / 2, marginT + 14, { align: "center" });
    }
    doc.setDrawColor(150, 160, 175);
    doc.setLineWidth(0.3);
    doc.line(margin, marginT + 13, pageW - marginR, marginT + 13);
    if (config.header.show_generated_at) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(90, 90, 90);
      doc.text(
        `${config.header.generated_at_label} ${fechaLarga(ahora)}`,
        margin,
        marginT + 18,
      );
    }
  };

  const drawFooter = (page: number, total: number) => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(110, 110, 110);
    if (config.footer.show_generated_by) {
      doc.text(
        `Impreso el ${fechaCorta(ahora)} por el usuario ${input.usuario}`,
        margin,
        pageH - marginB + 3,
      );
    }
    doc.setFont("helvetica", "bold");
    doc.text(config.footer.institution_line, margin, pageH - marginB + 6);
    if (config.footer.show_page_numbers) {
      doc.setFont("helvetica", "normal");
      doc.text(`Página ${page}/${total}`, pageW - marginR, pageH - marginB + 6, { align: "right" });
    }
  };

  const ensureSpace = (need: number, y: number): number => {
    if (y + need > pageH - marginB - 4) {
      doc.addPage();
      drawHeader();
      return headerBottom + 2;
    }
    return y;
  };

  // Primera página
  drawHeader();
  let y = marginT + 23;
  y = seccion(doc, config.patient_section.title, y, margin, ancho);
  y = camposGrid(doc, input.datosPaciente, y, margin, ancho, config.page.base_font_size);
  y += 2;

  // Columnas visibles + mapa clave→getter.
  const columnas = config.entries_table.columns.filter((c) => c.visible);
  const getters: Record<BitacoraColumnKey, (s: SeguimientoPDF) => string> = {
    fecha: (s) => s.fecha || "—",
    entidad: (s) => s.entidad || "—",
    observaciones: (s) => limpiarTexto(s.observaciones),
    estado: (s) => s.estado || "—",
    accion: (s) => s.accion || "—",
    funcionario: (s) => s.funcionario || "—",
  };
  const alignMap: Record<"left" | "center" | "right", "left" | "center" | "right"> = {
    left: "left",
    center: "center",
    right: "right",
  };

  input.bloques.forEach((bloque, idx) => {
    if (idx > 0) y += 2;
    y = ensureSpace(30, y);
    y = seccion(doc, config.case_section.title, y, margin, ancho);
    y = camposGrid(doc, bloque.datosReferencia, y, margin, ancho, config.page.base_font_size);
    y += 3;
    y = ensureSpace(20, y);
    y = seccion(doc, config.timeline_section.title, y, margin, ancho);

    const segs = [...bloque.seguimientos].sort((a, b) => (a._orden ?? 0) - (b._orden ?? 0));
    const body =
      segs.length > 0
        ? segs.map((s) => columnas.map((c) => getters[c.key](s)))
        : [columnas.map(() => "—").map((_, i) => (i === 0 ? config.timeline_section.empty_text : "—"))];

    const columnStyles: Record<number, { cellWidth: number | "auto"; halign: "left" | "center" | "right" }> = {};
    columnas.forEach((c, i) => {
      columnStyles[i] = {
        cellWidth: c.width ?? "auto",
        halign: alignMap[c.alignment],
      };
    });

    autoTable(doc, {
      startY: y + 1,
      margin: { left: margin, right: marginR, top: headerBottom, bottom: marginB + 8 },
      head: [columnas.map((c) => c.label)],
      body,
      styles: {
        fontSize: Math.max(6, config.page.base_font_size - 1),
        cellPadding: 1.5,
        valign: "top",
        overflow: "linebreak",
        textColor: [25, 25, 25],
      },
      headStyles: {
        fillColor: [30, 60, 100],
        textColor: [255, 255, 255],
        fontSize: Math.max(6, config.page.base_font_size - 1),
        fontStyle: "bold",
      },
      alternateRowStyles: { fillColor: [243, 246, 250] },
      rowPageBreak: "avoid",
      showHead: config.timeline_section.repeat_header ? "everyPage" : "firstPage",
      columnStyles,
      didDrawPage: () => {
        drawHeader();
      },
    });

    const finalY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY;
    y = (finalY ?? y) + 4;
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

/** Bitácora de un único caso. */
export async function generarBitacoraPDF(input: BitacoraInput): Promise<void> {
  await renderBitacora({
    referencia: input.referencia,
    datosPaciente: input.datosPaciente,
    usuario: input.usuario,
    configOverride: input.configOverride,
    bloques: [
      {
        tipoDocumento: input.tipoDocumento,
        datosReferencia: input.datosReferencia,
        seguimientos: input.seguimientos,
      },
    ],
  });
}

/** Bitácora consolidada del paciente (varios casos en un solo documento). */
export async function generarBitacoraConsolidadaPDF(input: BitacoraConsolidadaInput): Promise<void> {
  await renderBitacora(input);
}
