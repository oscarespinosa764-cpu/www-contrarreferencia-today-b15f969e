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
import {
  loadListaChequeoConfirmadaConfig,
  type ListaChequeoConfirmadaConfig,
} from "./lista-chequeo-confirmada-config";

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

// FASE 6: opcional. Sólo el flujo firmado (descargarFirmadoPDF) pasa cfg.
// Portada y checklist previo conservan comportamiento original (cfg=undefined).
type CFG = ListaChequeoConfirmadaConfig | undefined;

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
  cargo_acepta?: string;
  tripulante?: string;
  cargo_tripulante?: string;
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

function pie(doc: Doc, cfg?: CFG) {
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const leyenda = cfg?.footer.left_text ?? PIE;
  const showGen = cfg ? cfg.footer.show_generated_at : true;
  doc.setDrawColor(180);
  doc.line(14, pageH - 12, pageW - 14, pageH - 12);
  doc.setFont("helvetica", "italic");
  doc.setFontSize(7.5);
  doc.setTextColor(90);
  doc.text(leyenda, pageW / 2, pageH - 8, { align: "center" });
  doc.setFont("helvetica", "normal");
  if (showGen) {
    doc.text(`Generado: ${new Date().toLocaleString("es-CO")}`, pageW - 14, pageH - 8, {
      align: "right",
    });
  }
  doc.setTextColor(0);
}

/** Fila etiqueta:valor en negrita, estilo formato oficial. */
function filaCampo(doc: Doc, y: number, k: string, v: string, opts?: { italic?: boolean; size?: number; gap?: number }): number {
  const pageW = doc.internal.pageSize.getWidth();
  const size = opts?.size ?? 9.5;
  const gap = opts?.gap ?? 6;
  doc.setFontSize(size);
  doc.setFont("helvetica", opts?.italic ? "bolditalic" : "bold");
  doc.text(`${k}:`, 16, y);
  const kw = doc.getTextWidth(`${k}: `);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(size);
  const lines = doc.splitTextToSize(v || "—", pageW - 32 - kw);
  doc.text(lines, 16 + kw, y);
  return y + gap * lines.length;
}

function descargar(doc: Doc, nombre: string) {
  doc.save(nombre);
}

/** Línea oficial de tipo de documento con casillas CC/TI/RC/CN + N°. */
function filaTipoDocumento(doc: Doc, y: number, d: EntregaDatos, cfg?: CFG): number {
  const tipo = up(d.tipo_documento);
  const opts = ["CC", "TI", "RC", "CN"];
  const labTipo = (cfg?.patient_section.label_tipo_documento ?? "TIPO DE DOCUMENTO") + ":";
  const labNo = (cfg?.patient_section.label_no_documento ?? "No. DOCUMENTO") + ":";
  doc.setFontSize(8.5);
  doc.setFont("helvetica", "bold");
  doc.text(labTipo, 16, y);
  let x = 16 + doc.getTextWidth(labTipo + " ") + 2;
  doc.setFont("helvetica", "normal");
  for (const lbl of opts) {
    doc.text(lbl, x, y);
    x += doc.getTextWidth(lbl) + 1.5;
    doc.rect(x, y - 3.1, 3.8, 3.8);
    if (tipo === lbl) doc.text("X", x + 0.8, y - 0.3);
    x += 7.5;
  }
  doc.setFont("helvetica", "bold");
  doc.text(labNo, x, y);
  doc.setFont("helvetica", "normal");
  doc.text(up(d.documento) || "—", x + doc.getTextWidth(labNo + " ") + 1, y);
  return y + 6.5;
}

/**
 * Portada — "REFERENCIA Y CONTRARREFERENCIA" (formato Word oficial PORTADA.docx).
 * No persiste. Encabezado: logo CEDIM (izq.) + mascota CECI (der.), título grande azul.
 * Diseño: una sola página, tamaño carta, etiquetas en negrita/cursiva, valores al lado.
 */
export async function descargarPortadaPDF(d: EntregaDatos) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "letter" });
  const pageW = doc.internal.pageSize.getWidth();
  const { logo, ceci } = await marcaAgua();

  if (logo) doc.addImage(logo, "PNG", 14, 8, 30, 20);
  if (ceci) doc.addImage(ceci, "PNG", pageW - 34, 6, 20, 24);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(110);
  doc.text(INSTITUCION, pageW / 2, 13, { align: "center" });
  doc.text(NIT, pageW / 2, 17, { align: "center" });
  doc.setTextColor(0);

  // Título grande centrado (como el formato Word).
  doc.setFont("helvetica", "bold");
  doc.setFontSize(19);
  doc.setTextColor(NAVY[0], NAVY[1], NAVY[2]);
  doc.text("REFERENCIA Y CONTRARREFERENCIA", pageW / 2, 38, { align: "center" });
  doc.setDrawColor(NAVY[0], NAVY[1], NAVY[2]);
  doc.setLineWidth(0.6);
  doc.line(30, 42, pageW - 30, 42);
  doc.setLineWidth(0.2);
  doc.setTextColor(0);

  // Nombre de quien acepta + cargo (formato: "NOMBRE - CARGO").
  const acepta = [up(d.quien_acepta), up(d.cargo_acepta)].filter(Boolean).join(" - ");
  const tripulante = [up(d.tripulante), up(d.cargo_tripulante)].filter(Boolean).join(" - ");

  let y = 56;
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
    ["NOMBRE DE QUIEN ACEPTA", acepta],
    ["TRIPULANTE RESPONSABLE DEL TRASLADO", tripulante],
    ["TIPO DE AMBULANCIA", up(d.tipo_ambulancia)],
    ["EMPRESA QUE TRASLADA", up(d.empresa_traslado)],
  ];
  for (const [k, v] of filas) y = filaCampo(doc, y, k, v, { italic: true, size: 11, gap: 11 });

  y += 8;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(NAVY[0], NAVY[1], NAVY[2]);
  doc.text("TRASLADO INTEGRAL A CARGO DE LA ENTIDAD RESPONSABLE DEL PAGO", pageW / 2, y, {
    align: "center",
  });
  doc.setTextColor(0);
  y += 18;

  // Casillas AMBULANCIA / IPS
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text("AMBULANCIA:", 45, y);
  doc.rect(82, y - 4.2, 6, 6);
  doc.text("IPS:", 125, y);
  doc.rect(140, y - 4.2, 6, 6);

  pie(doc);
  descargar(doc, `Portada-Entrega-${(d.documento || "remision").replace(/\s+/g, "")}.pdf`);
}

/** Encabezado institucional tipo Excel GU-FR (logo + GESTIÓN DE URGENCIAS + versión). */
async function bannerHeader(doc: Doc, startY: number, cfg?: CFG): Promise<number> {
  const autoTable = (await import("jspdf-autotable")).default;
  const { logo } = await marcaAgua();
  const area = cfg?.header.document_area ?? "GESTIÓN DE URGENCIAS";
  const codeLbl = cfg?.header.format_code_label ?? "GU-FR-";
  const verLbl = cfg?.header.version_label ?? "Versión:";
  const verVal = cfg?.header.version_value ?? "1";
  const aprobLbl = cfg?.header.approval_label ?? "Aprobado:";
  const title = cfg?.header.document_title ?? "Lista de Chequeo de Documentación Referencia";
  const showLogo = cfg ? cfg.header.show_logo : true;

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
        { content: area, styles: { halign: "center", fontStyle: "bold" } },
        { content: codeLbl, styles: { halign: "center", fontStyle: "bold" } },
        { content: "" },
      ],
      [
        { content: "Formato", styles: { halign: "center" } },
        { content: verLbl, styles: { fontStyle: "bold" } },
        { content: verVal, styles: { halign: "center" } },
      ],
      [
        { content: title, styles: { halign: "center", fontStyle: "bold" } },
        { content: aprobLbl, styles: { fontStyle: "bold" } },
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
  if (logo && showLogo) doc.addImage(logo, "PNG", 17, startY + 2, 24, 15);
  return finalY + 4;
}

/** Construye la tabla oficial GU-FR con barras de agrupación por categoría. */
async function tablaChecklist(doc: Doc, d: EntregaDatos, startY: number, cfg?: CFG): Promise<number> {
  const autoTable = (await import("jspdf-autotable")).default;
  const t = cfg?.checklist_table;
  const colN = t?.col_numero ?? "N°";
  const colDet = t?.col_detalle ?? "DETALLE";
  const colRef = t?.col_referencia ?? "REFERENCIA";
  const colPer = t?.col_personal ?? "PERSONAL DE TRASLADO";
  const lblC = t?.label_c ?? "C";
  const lblNC = t?.label_nc ?? "NC";
  const lblNA = t?.label_na ?? "NA";

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
        { content: colN, rowSpan: 2 },
        { content: colDet, rowSpan: 2 },
        { content: colRef, colSpan: 3 },
        { content: colPer, colSpan: 3 },
      ],
      [
        { content: lblC },
        { content: lblNC },
        { content: lblNA },
        { content: lblC },
        { content: lblNC },
        { content: lblNA },
      ],
    ],
    body: body as never,
    margin: { left: 14, right: 14 },
  });

  // @ts-expect-error lastAutoTable es agregado por el plugin
  return (doc.lastAutoTable?.finalY ?? startY) + 5;
}

/** Bloque responsable + observaciones (formato oficial). */
async function bloqueResponsable(doc: Doc, d: EntregaDatos, y: number, cfg?: CFG): Promise<number> {
  const autoTable = (await import("jspdf-autotable")).default;
  const r = cfg?.responsible_section;
  const rows: [string, string][] = [
    [r?.label_nombre ?? "NOMBRE / RESPONSABLE", up(d.responsable_checklist)],
    [r?.label_cargo ?? "CARGO", up(d.cargo_responsable)],
    [r?.label_hora ?? "HORA DE REALIZACIÓN", up(d.fecha_entrega)],
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
          content: r?.label_observaciones ?? "OBSERVACIONES",
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
function encabezadoDatos(doc: Doc, d: EntregaDatos, y: number, cfg?: CFG): number {
  const p = cfg?.patient_section;
  const labFecha = (p?.label_fecha ?? "FECHA") + ":";
  const labEapb = (p?.label_eapb ?? "EAPB") + ":";
  const labNombres = p?.label_nombres ?? "NOMBRES Y APELLIDOS";
  const labCie10 = (p?.label_cie10 ?? "CIE-10 PRINCIPAL") + ":";
  const labOrigen = (p?.label_origen ?? "ORIGEN") + ":";
  const showOrigen = p ? p.show_origen : true;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.text(labFecha, 16, y);
  doc.setFont("helvetica", "normal");
  doc.text(up(d.fecha_entrega) || "—", 16 + doc.getTextWidth(labFecha + " ") + 1, y);
  doc.setFont("helvetica", "bold");
  doc.text(labEapb, 118, y);
  doc.setFont("helvetica", "normal");
  doc.text(up(d.entidad_pago) || "—", 118 + doc.getTextWidth(labEapb + " ") + 1, y);
  y += 6.5;
  y = filaCampo(doc, y, labNombres, up(d.paciente));
  y = filaTipoDocumento(doc, y, d, cfg);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.text(labCie10, 16, y);
  doc.setFont("helvetica", "normal");
  doc.text(up(d.cie10) || "—", 16 + doc.getTextWidth(labCie10 + " ") + 1, y);
  if (d.origen && showOrigen) {
    doc.setFont("helvetica", "bold");
    doc.text(labOrigen, 118, y);
    doc.setFont("helvetica", "normal");
    doc.text(up(d.origen), 118 + doc.getTextWidth(labOrigen + " ") + 1, y);
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

/**
 * PDF FINAL "LISTA DE CHEQUEO CONFIRMADA" firmado por QR — formato GU-FR oficial.
 * No persiste. Compactado para caber en UNA sola página tamaño carta: el bloque de
 * firmante, aceptación, firma y código de verificación quedan siempre en la misma hoja.
 */
export async function descargarFirmadoPDF(d: EntregaDatos, f: FirmaDatos) {
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;
  const doc = new jsPDF({ unit: "mm", format: "letter" });
  const pageW = doc.internal.pageSize.getWidth();

  let y = await bannerHeader(doc, 10);
  y = encabezadoDatos(doc, d, y);
  y = bandaSeccion(doc, y, "ANTES DEL TRASLADO DEL PACIENTE, VERIFIQUE LA SIGUIENTE DOCUMENTACIÓN:");
  y = await tablaChecklist(doc, d, y);
  y = await bloqueResponsable(doc, d, y);

  // ── DATOS DEL FIRMANTE (grid compacto de 2 columnas) ──────────────────────
  y += 1;
  autoTable(doc, {
    startY: y,
    theme: "grid",
    styles: { fontSize: 7.5, cellPadding: 1.2, lineColor: [120, 120, 120], lineWidth: 0.2, valign: "middle" },
    head: [[{
      content: "DATOS DEL FIRMANTE (PERSONAL DE TRASLADO)",
      colSpan: 4,
      styles: { fillColor: NAVY, textColor: [255, 255, 255], halign: "center", fontStyle: "bold" },
    }]],
    body: [
      [
        { content: "NOMBRE", styles: { fillColor: LIGHT, fontStyle: "bold", textColor: NAVY } },
        { content: up(f.nombre) || "—" },
        { content: "CARGO", styles: { fillColor: LIGHT, fontStyle: "bold", textColor: NAVY } },
        { content: up(f.cargo) || "—" },
      ],
      [
        { content: "DOCUMENTO / ID", styles: { fillColor: LIGHT, fontStyle: "bold", textColor: NAVY } },
        { content: up(f.documento) || "—" },
        { content: "TELÉFONO", styles: { fillColor: LIGHT, fontStyle: "bold", textColor: NAVY } },
        { content: f.telefono || "—" },
      ],
      [
        { content: "EMPRESA DE AMBULANCIA", styles: { fillColor: LIGHT, fontStyle: "bold", textColor: NAVY } },
        { content: up(f.empresa) || "—" },
        { content: "FECHA/HORA DE FIRMA", styles: { fillColor: LIGHT, fontStyle: "bold", textColor: NAVY } },
        { content: fmtFecha(f.firmado_at) || "—" },
      ],
    ] as never,
    columnStyles: { 0: { cellWidth: 40 }, 1: { cellWidth: 44 }, 2: { cellWidth: 40 }, 3: { cellWidth: 44 } },
    margin: { left: 14, right: 14 },
  });
  // @ts-expect-error plugin
  y = (doc.lastAutoTable?.finalY ?? y) + 3;

  // ── ACEPTACIÓN DE RECIBIDO (compacto) ─────────────────────────────────────
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text("ACEPTACIÓN DE RECIBIDO", 16, y);
  y += 4;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  const acept = doc.splitTextToSize(`[X] ${TEXTO_ACEPTACION}`, pageW - 32);
  doc.text(acept, 16, y);
  y += 4 * acept.length + 3;

  // ── FIRMA (recuadro pequeño) + CÓDIGO DE VERIFICACIÓN ─────────────────────
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text("FIRMA", 16, y);
  const boxY = y + 1;
  doc.setDrawColor(120);
  doc.rect(16, boxY, 58, 22);
  if (f.firma_data) {
    try {
      doc.addImage(f.firma_data, "PNG", 17, boxY + 1, 56, 20);
    } catch {
      /* firma no renderizable */
    }
  }
  // Código de verificación a la derecha de la firma.
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text("CÓDIGO DE VERIFICACIÓN", 82, boxY + 5);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.text(f.codigo_verificacion || "—", 82, boxY + 12);
  if (f.pdf_hash) {
    // Solo se muestra el código visible; el hash completo se conserva en los datos
    // estructurados (entrega_firmas.pdf_hash). Aquí se imprime abreviado si cabe.
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(120);
    const hashCorto = f.pdf_hash.length > 40 ? `${f.pdf_hash.slice(0, 40)}…` : f.pdf_hash;
    doc.text(`Hash de evidencia: ${hashCorto}`, 82, boxY + 18);
    doc.setTextColor(0);
  }

  pie(doc);
  const docNum = (d.documento || "remision").replace(/\s+/g, "");
  const fechaArch = new Date().toISOString().slice(0, 10);
  descargar(doc, `Lista_Chequeo_Confirmada_${docNum}_${fechaArch}.pdf`);
}
