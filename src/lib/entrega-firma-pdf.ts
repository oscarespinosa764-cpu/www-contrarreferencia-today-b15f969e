// Generación BAJO DEMANDA de los PDF de entrega documental (CEDIM IPS).
//
// IMPORTANTE (control de costos): estos PDF se construyen en memoria en el
// navegador y se entregan para descarga. NO se guardan en el bucket ni en la
// base de datos. jsPDF es 100% JavaScript (sin servicios externos, sin IA).
//
// Los layouts respetan los formatos institucionales oficiales:
//   - Portada  -> "REFERENCIA Y CONTRARREFERENCIA" (Entrega de paciente).
//   - Checklist -> "GU-FR Lista de Chequeo de Documentacion Referencia".
// Encabezado institucional: logo CEDIM (izq.) + mascota CECI (der.).

import logoAsset from "@/assets/cedim-logo.png.asset.json";
import ceciAsset from "@/assets/ceci-mascota.png.asset.json";

const INSTITUCION = "CENTRO DE IMAGENES DIAGNOSTICAS CEDIM I.P.S S.A.S";
const NIT = "NIT: 900559103-5";
// Pie institucional oficial (tomado del formato Word/Excel fuente).
const PIE = "Servicios de salud con calidad y humanización";

// Paleta institucional del formato oficial.
const NAVY: [number, number, number] = [31, 56, 100];
const LIGHT: [number, number, number] = [221, 235, 247];

const TEXTO_ACEPTACION =
  "Declaro que recibo la documentación relacionada en la lista de chequeo para el traslado " +
  "del paciente y que la información registrada corresponde a la entrega realizada.";

export type DocumentoChecklist = { label: string; marcado: boolean; grupo?: string };

export type EntregaDatos = {
  paciente: string;
  documento: string;
  ips_receptora: string;
  empresa_traslado: string;
  fecha_entrega: string;
  documentos: DocumentoChecklist[];
  caso_ref?: string;
  // Campos oficiales opcionales (se muestran "—" si no están disponibles).
  tipo_documento?: string;
  cie10?: string;
  entidad_pago?: string; // EAPB / entidad responsable del pago
  especialidad?: string;
  modalidad?: string;
  entidad_receptora?: string;
  quien_acepta?: string;
  tripulante?: string;
  conductor?: string;
  tipo_ambulancia?: string;
  responsable_checklist?: string;
  cargo_responsable?: string;
  origen?: string; // EPS / ARL / SOAT / PARTICULAR
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

function fmtFecha(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" });
}

const up = (v?: string | null) => (v ?? "").toString().toUpperCase();

type Doc = import("jspdf").jsPDF;

async function marcaAgua(): Promise<{ logo: string | null; ceci: string | null }> {
  const [logo, ceci] = await Promise.all([
    getImg((logoAsset as { url: string }).url),
    getImg((ceciAsset as { url: string }).url),
  ]);
  return { logo, ceci };
}

function pie(doc: Doc) {
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  doc.setDrawColor(180);
  doc.line(14, pageH - 12, pageW - 14, pageH - 12);
  doc.setFont("helvetica", "italic");
  doc.setFontSize(7.5);
  doc.setTextColor(90);
  doc.text(PIE, pageW / 2, pageH - 8, { align: "center" });
  doc.setFont("helvetica", "normal");
  doc.text(`Generado: ${new Date().toLocaleString("es-CO")}`, pageW - 14, pageH - 8, {
    align: "right",
  });
  doc.setTextColor(0);
}

/** Fila etiqueta:valor en negrita, estilo formato oficial. */
function filaCampo(doc: Doc, y: number, k: string, v: string): number {
  const pageW = doc.internal.pageSize.getWidth();
  doc.setFontSize(9.5);
  doc.setFont("helvetica", "bold");
  doc.text(`${k}:`, 16, y);
  const kw = doc.getTextWidth(`${k}: `);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  const lines = doc.splitTextToSize(v || "—", pageW - 32 - kw);
  doc.text(lines, 16 + kw, y);
  return y + 6 * lines.length;
}

function descargar(doc: Doc, nombre: string) {
  doc.save(nombre);
}

/** Línea oficial de tipo de documento con casillas CC/TI/RC/CN + N°. */
function filaTipoDocumento(doc: Doc, y: number, d: EntregaDatos): number {
  const tipo = up(d.tipo_documento);
  const opts = ["CC", "TI", "RC", "CN"];
  doc.setFontSize(8.5);
  doc.setFont("helvetica", "bold");
  doc.text("TIPO DE DOCUMENTO:", 16, y);
  let x = 16 + doc.getTextWidth("TIPO DE DOCUMENTO: ") + 2;
  doc.setFont("helvetica", "normal");
  for (const lbl of opts) {
    doc.text(lbl, x, y);
    x += doc.getTextWidth(lbl) + 1.5;
    doc.rect(x, y - 3.1, 3.8, 3.8);
    if (tipo === lbl) doc.text("X", x + 0.8, y - 0.3);
    x += 7.5;
  }
  doc.setFont("helvetica", "bold");
  doc.text("No. DOCUMENTO:", x, y);
  doc.setFont("helvetica", "normal");
  doc.text(up(d.documento) || "—", x + doc.getTextWidth("No. DOCUMENTO: ") + 1, y);
  return y + 6.5;
}

/**
 * Portada — "REFERENCIA Y CONTRARREFERENCIA" (formato Word oficial). No persiste.
 * Encabezado: logo CEDIM (izq.) + mascota CECI (der.), título grande azul.
 */
export async function descargarPortadaPDF(d: EntregaDatos) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "letter" });
  const pageW = doc.internal.pageSize.getWidth();
  const { logo, ceci } = await marcaAgua();

  if (logo) doc.addImage(logo, "PNG", 14, 8, 26, 18);
  if (ceci) doc.addImage(ceci, "PNG", pageW - 32, 6, 18, 22);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(110);
  doc.text(INSTITUCION, pageW / 2, 12, { align: "center" });
  doc.text(NIT, pageW / 2, 16, { align: "center" });
  doc.setTextColor(0);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor(NAVY[0], NAVY[1], NAVY[2]);
  doc.text("REFERENCIA Y CONTRARREFERENCIA", pageW / 2, 34, { align: "center" });
  doc.setTextColor(0);

  let y = 50;
  const filas: [string, string][] = [
    ["FECHA Y HORA", up(d.fecha_entrega)],
    ["NOMBRE DEL PACIENTE", up(d.paciente)],
    [
      "TIPO DE DOCUMENTO Y NÚMERO",
      up([d.tipo_documento, d.documento].filter(Boolean).join(" ")) || up(d.documento),
    ],
    ["CIE-10 PRINCIPAL", up(d.cie10)],
    ["ENTIDAD RESPONSABLE DEL PAGO", up(d.entidad_pago)],
    ["ESPECIALIDAD", up(d.especialidad)],
    ["MODALIDAD", up(d.modalidad) || "REMISIÓN"],
    ["ENTIDAD RECEPTORA", up(d.entidad_receptora) || up(d.ips_receptora)],
    ["NOMBRE DE QUIEN ACEPTA", up(d.quien_acepta)],
    ["TRIPULANTE RESPONSABLE DEL TRASLADO", up(d.tripulante)],
    ["CONDUCTOR", up(d.conductor)],
    ["TIPO DE AMBULANCIA", up(d.tipo_ambulancia)],
    ["EMPRESA QUE TRASLADA", up(d.empresa_traslado)],
  ];
  for (const [k, v] of filas) y = filaCampo(doc, y, k, v);

  y += 6;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("TRASLADO INTEGRAL A CARGO DE LA ENTIDAD RESPONSABLE DEL PAGO", pageW / 2, y, {
    align: "center",
  });
  y += 14;

  // Casillas AMBULANCIA / IPS
  doc.setFontSize(9.5);
  doc.setFont("helvetica", "bold");
  doc.text("AMBULANCIA:", 45, y);
  doc.rect(80, y - 4, 5, 5);
  doc.text("IPS:", 120, y);
  doc.rect(133, y - 4, 5, 5);

  pie(doc);
  descargar(doc, `Portada-Entrega-${(d.documento || "remision").replace(/\s+/g, "")}.pdf`);
}

/** Encabezado institucional tipo Excel GU-FR (logo + GESTIÓN DE URGENCIAS + versión). */
async function bannerHeader(doc: Doc, startY: number): Promise<number> {
  const autoTable = (await import("jspdf-autotable")).default;
  const { logo } = await marcaAgua();

  autoTable(doc, {
    startY,
    theme: "grid",
    styles: {
      fontSize: 8,
      cellPadding: 1.6,
      lineColor: [120, 120, 120],
      lineWidth: 0.2,
      valign: "middle",
    },
    body: [
      [
        { content: "", rowSpan: 3, styles: { halign: "center", fillColor: [255, 255, 255] } },
        { content: "GESTIÓN DE URGENCIAS", styles: { halign: "center", fontStyle: "bold" } },
        { content: "GU-FR-", styles: { halign: "center", fontStyle: "bold" } },
        { content: "" },
      ],
      [
        { content: "Formato", styles: { halign: "center" } },
        { content: "Versión:", styles: { fontStyle: "bold" } },
        { content: "1", styles: { halign: "center" } },
      ],
      [
        {
          content: "Lista de Chequeo de Documentación Referencia",
          styles: { halign: "center", fontStyle: "bold" },
        },
        { content: "Aprobado:", styles: { fontStyle: "bold" } },
        { content: "" },
      ],
    ],
    columnStyles: {
      0: { cellWidth: 30 },
      1: { cellWidth: 118 },
      2: { cellWidth: 22 },
      3: { cellWidth: 18 },
    },
    margin: { left: 14, right: 14 },
  });
  // @ts-expect-error lastAutoTable lo agrega el plugin
  const finalY = doc.lastAutoTable?.finalY ?? startY + 20;
  if (logo) doc.addImage(logo, "PNG", 17, startY + 2, 24, 15);
  return finalY + 4;
}

/** Construye la tabla oficial GU-FR con barras de agrupación por categoría. */
async function tablaChecklist(doc: Doc, d: EntregaDatos, startY: number): Promise<number> {
  const autoTable = (await import("jspdf-autotable")).default;

  const body: unknown[] = [];
  let grupoActual: string | null = null;
  d.documentos.forEach((it, i) => {
    if (it.grupo && it.grupo !== grupoActual) {
      grupoActual = it.grupo;
      body.push([
        {
          content: it.grupo,
          colSpan: 8,
          styles: {
            fillColor: NAVY,
            textColor: [255, 255, 255],
            fontStyle: "bold",
            fontSize: 7,
            halign: "center",
          },
        },
      ]);
    }
    body.push([
      String(i + 1),
      up(it.label),
      it.marcado ? "X" : "",
      "",
      it.marcado ? "" : "X",
      "",
      "",
      "",
    ]);
  });

  autoTable(doc, {
    startY,
    theme: "grid",
    styles: { fontSize: 7.5, cellPadding: 1.3, lineColor: [120, 120, 120], lineWidth: 0.2 },
    headStyles: {
      fillColor: NAVY,
      textColor: [255, 255, 255],
      fontStyle: "bold",
      halign: "center",
      valign: "middle",
      lineColor: [120, 120, 120],
      lineWidth: 0.2,
    },
    columnStyles: {
      0: { cellWidth: 9, halign: "center" },
      1: { cellWidth: 99 },
      2: { cellWidth: 12, halign: "center" },
      3: { cellWidth: 12, halign: "center" },
      4: { cellWidth: 12, halign: "center" },
      5: { cellWidth: 12, halign: "center" },
      6: { cellWidth: 12, halign: "center" },
      7: { cellWidth: 12, halign: "center" },
    },
    head: [
      [
        { content: "N°", rowSpan: 2 },
        { content: "DETALLE", rowSpan: 2 },
        { content: "REFERENCIA", colSpan: 3 },
        { content: "PERSONAL DE TRASLADO", colSpan: 3 },
      ],
      [
        { content: "C" },
        { content: "NC" },
        { content: "NA" },
        { content: "C" },
        { content: "NC" },
        { content: "NA" },
      ],
    ],
    body: body as never,
    margin: { left: 14, right: 14 },
  });

  // @ts-expect-error lastAutoTable es agregado por el plugin
  return (doc.lastAutoTable?.finalY ?? startY) + 5;
}

/** Bloque responsable + observaciones (formato oficial). */
async function bloqueResponsable(doc: Doc, d: EntregaDatos, y: number): Promise<number> {
  const autoTable = (await import("jspdf-autotable")).default;
  const rows: [string, string][] = [
    ["NOMBRE / RESPONSABLE", up(d.responsable_checklist)],
    ["CARGO", up(d.cargo_responsable)],
    ["HORA DE REALIZACIÓN", up(d.fecha_entrega)],
  ];
  autoTable(doc, {
    startY: y,
    theme: "grid",
    styles: { fontSize: 8, cellPadding: 1.4, lineColor: [120, 120, 120], lineWidth: 0.2 },
    body: rows.map(([k, v]) => [
      { content: k, styles: { fillColor: LIGHT, fontStyle: "bold", textColor: NAVY } },
      { content: v || "—" },
    ]) as never,
    columnStyles: { 0: { cellWidth: 60 }, 1: { cellWidth: 108 } },
    margin: { left: 14, right: 14 },
  });
  // @ts-expect-error plugin
  y = (doc.lastAutoTable?.finalY ?? y) + 2;
  autoTable(doc, {
    startY: y,
    theme: "grid",
    styles: {
      fontSize: 8,
      cellPadding: 1.4,
      lineColor: [120, 120, 120],
      lineWidth: 0.2,
      minCellHeight: 6,
    },
    head: [
      [
        {
          content: "OBSERVACIONES",
          styles: { fillColor: LIGHT, textColor: NAVY, halign: "center", fontStyle: "bold" },
        },
      ],
    ],
    body: [[" "], [" "], [" "]] as never,
    columnStyles: { 0: { cellWidth: 168 } },
    margin: { left: 14, right: 14 },
  });
  // @ts-expect-error plugin
  return (doc.lastAutoTable?.finalY ?? y) + 4;
}

/** Encabezado de datos del paciente (bloque superior del Excel oficial). */
function encabezadoDatos(doc: Doc, d: EntregaDatos, y: number): number {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.text("FECHA:", 16, y);
  doc.setFont("helvetica", "normal");
  doc.text(up(d.fecha_entrega) || "—", 16 + doc.getTextWidth("FECHA: ") + 1, y);
  doc.setFont("helvetica", "bold");
  doc.text("EAPB:", 118, y);
  doc.setFont("helvetica", "normal");
  doc.text(up(d.entidad_pago) || "—", 118 + doc.getTextWidth("EAPB: ") + 1, y);
  y += 6.5;
  y = filaCampo(doc, y, "NOMBRES Y APELLIDOS", up(d.paciente));
  y = filaTipoDocumento(doc, y, d);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.text("CIE-10 PRINCIPAL:", 16, y);
  doc.setFont("helvetica", "normal");
  doc.text(up(d.cie10) || "—", 16 + doc.getTextWidth("CIE-10 PRINCIPAL: ") + 1, y);
  if (d.origen) {
    doc.setFont("helvetica", "bold");
    doc.text("ORIGEN:", 118, y);
    doc.setFont("helvetica", "normal");
    doc.text(up(d.origen), 118 + doc.getTextWidth("ORIGEN: ") + 1, y);
  }
  return y + 6;
}

/** Banda oscura de sección. */
function bandaSeccion(doc: Doc, y: number, texto: string): number {
  const pageW = doc.internal.pageSize.getWidth();
  doc.setFillColor(NAVY[0], NAVY[1], NAVY[2]);
  doc.rect(14, y - 4, pageW - 28, 6, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text(texto, pageW / 2, y, { align: "center" });
  doc.setTextColor(0);
  return y + 6;
}

/** Lista de chequeo documental (sin firmar) — formato GU-FR oficial. No persiste. */
export async function descargarChecklistPDF(d: EntregaDatos) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "letter" });
  let y = await bannerHeader(doc, 10);
  y = encabezadoDatos(doc, d, y);
  y = bandaSeccion(doc, y, "ANTES DEL TRASLADO DEL PACIENTE, VERIFIQUE LA SIGUIENTE DOCUMENTACIÓN:");
  y = await tablaChecklist(doc, d, y);
  await bloqueResponsable(doc, d, y);
  pie(doc);
  descargar(doc, `Checklist-${(d.documento || "remision").replace(/\s+/g, "")}.pdf`);
}

/** PDF FINAL firmado por QR — formato GU-FR oficial firmado. No persiste. */
export async function descargarFirmadoPDF(d: EntregaDatos, f: FirmaDatos) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "letter" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();

  let y = await bannerHeader(doc, 10);
  y = encabezadoDatos(doc, d, y);
  y = bandaSeccion(doc, y, "ANTES DEL TRASLADO DEL PACIENTE, VERIFIQUE LA SIGUIENTE DOCUMENTACIÓN:");
  y = await tablaChecklist(doc, d, y);
  y = await bloqueResponsable(doc, d, y);

  if (y > pageH - 90) {
    doc.addPage();
    y = 20;
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("DATOS DEL FIRMANTE (PERSONAL DE TRASLADO)", 16, y);
  y += 6;
  y = filaCampo(doc, y, "NOMBRE", up(f.nombre));
  y = filaCampo(doc, y, "CARGO", up(f.cargo));
  y = filaCampo(doc, y, "EMPRESA DE AMBULANCIA", up(f.empresa));
  y = filaCampo(doc, y, "DOCUMENTO / IDENTIFICACIÓN", up(f.documento));
  y = filaCampo(doc, y, "TELÉFONO", f.telefono || "—");
  y = filaCampo(doc, y, "FECHA/HORA DE FIRMA", fmtFecha(f.firmado_at));

  y += 3;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("ACEPTACIÓN DE RECIBIDO", 16, y);
  y += 5;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  const acept = doc.splitTextToSize(`[X] ${TEXTO_ACEPTACION}`, pageW - 32);
  doc.text(acept, 16, y);
  y += 5 * acept.length + 4;

  if (y > pageH - 55) {
    doc.addPage();
    y = 20;
  }

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
