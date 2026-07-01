// Generación BAJO DEMANDA de los PDF de entrega documental (CEDIM IPS).
//
// IMPORTANTE (control de costos): estos PDF se construyen en memoria en el
// navegador y se entregan para descarga. NO se guardan en el bucket ni en la
// base de datos. jsPDF es 100% JavaScript (sin servicios externos, sin IA).
//
// Los layouts respetan los formatos institucionales oficiales:
//   - Portada  -> "REFERENCIA Y CONTRARREFERENCIA" (Entrega de paciente).
//   - Checklist -> "GU-FR Lista de Chequeo de Documentacion Referencia".
// Encabezado institucional: logo CEDIM (izq.) + título (centro) + mascota CECI (der.).

import logoAsset from "@/assets/cedim-logo.png.asset.json";
import ceciAsset from "@/assets/ceci-mascota.png.asset.json";

const INSTITUCION = "CENTRO DE IMAGENES DIAGNOSTICAS CEDIM I.P.S S.A.S";
const NIT = "NIT: 900559103-5";
// Pie institucional oficial (tomado del formato Word/Excel fuente).
const PIE = "Servicios de salud con calidad y humanización";

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
  // Campos oficiales opcionales (se muestran "—" si no están disponibles).
  tipo_documento?: string;
  cie10?: string;
  entidad_pago?: string; // EAPB / entidad responsable del pago
  especialidad?: string;
  modalidad?: string;
  entidad_receptora?: string;
  quien_acepta?: string;
  tripulante?: string;
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

async function nuevoDoc(titulo: string, subtitulo?: string): Promise<Doc> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "letter" });
  const pageW = doc.internal.pageSize.getWidth();

  const [logo, ceci] = await Promise.all([
    getImg((logoAsset as { url: string }).url),
    getImg((ceciAsset as { url: string }).url),
  ]);
  if (logo) doc.addImage(logo, "PNG", 14, 8, 22, 16);
  if (ceci) doc.addImage(ceci, "PNG", pageW - 30, 6, 16, 20);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.text(INSTITUCION, pageW / 2, 12, { align: "center" });
  doc.setFontSize(10.5);
  doc.text(titulo, pageW / 2, 18, { align: "center" });
  if (subtitulo) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text(subtitulo, pageW / 2, 23, { align: "center" });
  }
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.text(NIT, pageW / 2, subtitulo ? 27.5 : 23.5, { align: "center" });
  doc.setDrawColor(150);
  doc.line(14, subtitulo ? 30 : 26, pageW - 14, subtitulo ? 30 : 26);
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

/** Fila etiqueta:valor en negrita, estilo formato oficial. */
function filaCampo(doc: Doc, y: number, k: string, v: string): number {
  const pageW = doc.internal.pageSize.getWidth();
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text(`${k}:`, 16, y);
  const kw = doc.getTextWidth(`${k}: `);
  doc.setFont("helvetica", "normal");
  const lines = doc.splitTextToSize(v || "—", pageW - 32 - kw);
  doc.text(lines, 16 + kw, y);
  return y + 5.6 * lines.length;
}

function descargar(doc: Doc, nombre: string) {
  doc.save(nombre);
}

/** Línea oficial de tipo de documento con casillas CC/TI/RC/CN + N° y CIE-10. */
function filaTipoDocumento(doc: Doc, y: number, d: EntregaDatos): number {
  const tipo = up(d.tipo_documento);
  const opts: [string, string][] = [
    ["CC", "CC"],
    ["TI", "TI"],
    ["RC", "RC"],
    ["CN", "CN"],
  ];
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text("TIPO DE DOCUMENTO:", 16, y);
  let x = 16 + doc.getTextWidth("TIPO DE DOCUMENTO: ") + 2;
  doc.setFont("helvetica", "normal");
  for (const [lbl, val] of opts) {
    doc.text(lbl, x, y);
    x += doc.getTextWidth(lbl) + 1.5;
    doc.rect(x, y - 3.2, 4, 4);
    if (tipo === val) doc.text("X", x + 0.9, y - 0.2);
    x += 8;
  }
  doc.setFont("helvetica", "bold");
  doc.text("No. DOCUMENTO:", x, y);
  doc.setFont("helvetica", "normal");
  doc.text(up(d.documento) || "—", x + doc.getTextWidth("No. DOCUMENTO: ") + 1, y);
  return y + 6.5;
}

/** Portada — "REFERENCIA Y CONTRARREFERENCIA" (formato oficial). No persiste. */
export async function descargarPortadaPDF(d: EntregaDatos) {
  const doc = await nuevoDoc("REFERENCIA Y CONTRARREFERENCIA");
  const pageW = doc.internal.pageSize.getWidth();
  let y = 36;

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
    ["TIPO DE AMBULANCIA", up(d.tipo_ambulancia)],
    ["EMPRESA QUE TRASLADA", up(d.empresa_traslado)],
  ];
  for (const [k, v] of filas) y = filaCampo(doc, y, k, v);

  y += 4;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("TRASLADO INTEGRAL A CARGO DE LA ENTIDAD RESPONSABLE DEL PAGO", pageW / 2, y, {
    align: "center",
  });
  y += 12;

  // Casillas AMBULANCIA / IPS
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text("AMBULANCIA:", 40, y);
  doc.rect(72, y - 4, 5, 5);
  doc.text("IPS:", 120, y);
  doc.rect(135, y - 4, 5, 5);

  pie(doc);
  descargar(doc, `Portada-Entrega-${(d.documento || "remision").replace(/\s+/g, "")}.pdf`);
}


/** Construye la tabla oficial GU-FR (N° · DETALLE · REFERENCIA · PERSONAL DE TRASLADO). */
async function tablaChecklist(doc: Doc, d: EntregaDatos, startY: number): Promise<number> {
  const autoTable = (await import("jspdf-autotable")).default;

  const body = d.documentos.map((it, i) => [
    String(i + 1),
    up(it.label),
    it.marcado ? "X" : "",
    "",
    it.marcado ? "" : "X",
    "",
    "",
    "",
  ]);

  autoTable(doc, {
    startY,
    theme: "grid",
    styles: { fontSize: 7.5, cellPadding: 1.4, lineColor: [120, 120, 120], lineWidth: 0.2 },
    headStyles: {
      fillColor: [225, 232, 240],
      textColor: [20, 30, 60],
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
    body,
    margin: { left: 14, right: 14 },
  });

  // @ts-expect-error lastAutoTable es agregado por el plugin
  return (doc.lastAutoTable?.finalY ?? startY) + 6;
}

/** Lista de chequeo documental (sin firmar) — formato GU-FR. No persiste. */
export async function descargarChecklistPDF(d: EntregaDatos) {
  const doc = await nuevoDoc(
    "LISTA DE CHEQUEO DE DOCUMENTACIÓN — REFERENCIA",
    "Gestión de Urgencias · GU-FR · Versión 1",
  );
  let y = 36;

  y = filaCampo(doc, y, "FECHA", up(d.fecha_entrega));
  y = filaCampo(doc, y, "EAPB", up(d.entidad_pago));
  y = filaCampo(doc, y, "NOMBRES Y APELLIDOS", up(d.paciente));
  y = filaTipoDocumento(doc, y, d);
  y = filaCampo(doc, y, "CIE-10 PRINCIPAL", up(d.cie10));
  if (d.origen) y = filaCampo(doc, y, "ORIGEN / RESPONSABLE DOCUMENTAL", up(d.origen));

  y += 2;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.text("ANTES DEL TRASLADO DEL PACIENTE, VERIFIQUE LA SIGUIENTE DOCUMENTACIÓN:", 14, y);
  y += 5;

  y = await tablaChecklist(doc, d, y);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  y = filaCampo(doc, y, "NOMBRE / RESPONSABLE", up(d.responsable_checklist));
  y = filaCampo(doc, y, "CARGO", up(d.cargo_responsable));
  y = filaCampo(doc, y, "HORA DE REALIZACIÓN", up(d.fecha_entrega));
  y += 2;
  doc.setFont("helvetica", "bold");
  doc.text("OBSERVACIONES:", 16, y);
  doc.setDrawColor(160);
  doc.rect(16, y + 2, doc.internal.pageSize.getWidth() - 32, 16);

  pie(doc);
  descargar(doc, `Checklist-${(d.documento || "remision").replace(/\s+/g, "")}.pdf`);
}

/** PDF FINAL firmado por QR — formato GU-FR firmado. No persiste. */
export async function descargarFirmadoPDF(d: EntregaDatos, f: FirmaDatos) {
  const doc = await nuevoDoc(
    "LISTA DE CHEQUEO FIRMADA — ENTREGA DOCUMENTAL",
    "Gestión de Urgencias · GU-FR · Versión 1",
  );
  const pageW = doc.internal.pageSize.getWidth();
  let y = 36;

  y = filaCampo(doc, y, "FECHA", up(d.fecha_entrega));
  y = filaCampo(doc, y, "EAPB", up(d.entidad_pago));
  y = filaCampo(doc, y, "NOMBRES Y APELLIDOS", up(d.paciente));
  y = filaCampo(
    doc,
    y,
    "TIPO Y N° DOCUMENTO",
    up([d.tipo_documento, d.documento].filter(Boolean).join(" ")) || up(d.documento),
  );
  y = filaCampo(doc, y, "ENTIDAD RECEPTORA", up(d.entidad_receptora) || up(d.ips_receptora));
  y = filaCampo(doc, y, "EMPRESA DE TRASLADO", up(d.empresa_traslado));

  y += 2;
  y = await tablaChecklist(doc, d, y);

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
