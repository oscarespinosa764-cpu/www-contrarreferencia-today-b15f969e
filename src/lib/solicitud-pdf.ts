// Generación BAJO DEMANDA del PDF oficial TH-FR-09 (Versión 02)
// (Solicitud de permiso, ausencia o salida del colaborador / cambio de turno).
//
// IMPORTANTE (control de costos): el PDF se construye en memoria en el
// navegador y se entrega para descarga. NO se guarda en el bucket ni en la
// base de datos. jsPDF es 100% JavaScript (sin servicios externos, sin IA).
//
// El layout replica el formato institucional real: encabezado con logo +
// código, cuadro de identificación, grilla de MOTIVO DE PERMISO (recuperable /
// no recuperable), descripción, bitácora de recuperación y bloque de firmas.

import logoAsset from "@/assets/cedim-logo.png.asset.json";
import { fmtFecha, fmtFechaHora, type ShiftRequest } from "@/lib/cuadro-turno-utils";
import { getPlantillaConfig, pickText } from "@/lib/plantillas-inventario-config";

const TITULO_DEFAULT = "Solicitud de permiso, ausencia o salida del colaborador";
const CODIGO_DEFAULT = "TH-FR-09";
const VERSION = "Versión: 02";
const APROBADO = "Aprobado: 1/07/2026";
const PIE_DEFAULT = "Servicios de salud con calidad y humanización";

const NO_RECUP = ["Cita médica", "Actividad escolar de hijos", "Citación judicial", "Calamidad grave", "Cumpleaños", "Compensatorio"];
const RECUP = ["Estudio", "Licencia", "Diligencia personal", "Otro"];

const NOTAS = [
  "Todo permiso mayor a un día debe solicitarse mínimo 48 horas de antelación y radicar en el área de talento humano",
  "El jefe inmediato únicamente está autorizado para dar permiso hasta por 8 horas en la parte administrativa",
  "El jefe inmediato podrá autorizar un cambio de turno en la parte asistencial",
  "En caso de permisos superiores a 8 horas o un turno, este debe estar autorizado por las subgerencias según corresponda",
  "En caso de permisos o licencias mayores a 3 días debe ser autorizado adicionalmente por la Gerencia General.",
  "CC.: Archivo de ausentismo laboral",
];

function norm(s: string | null | undefined): string {
  return (s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}

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

type Doc = import("jspdf").jsPDF;

export async function generarSolicitudPDF(
  r: ShiftRequest,
  opts?: { firmaDataUrl?: string | null; jefeFirmaDataUrl?: string | null; usuario?: string },
): Promise<void> {
  const { jsPDF } = await import("jspdf");
  const cfg = await getPlantillaConfig("TH-FR-09");
  const TITULO = pickText(cfg, "encabezado_titulo", TITULO_DEFAULT);
  const CODIGO = pickText(cfg, "encabezado_codigo", CODIGO_DEFAULT);
  const PIE = pickText(cfg, "pie_leyenda", PIE_DEFAULT);
  const doc: Doc = new jsPDF({ unit: "mm", format: "letter" });
  const pageW = doc.internal.pageSize.getWidth();
  const mX = 10;
  const right = pageW - mX;
  const W = pageW - mX * 2;

  doc.setDrawColor(90);
  doc.setLineWidth(0.2);

  const BLUE: [number, number, number] = [197, 217, 241];
  let y = 12;

  // ---------- helpers ----------
  const setF = (style: "normal" | "bold", size: number, gray = 20) => {
    doc.setFont("helvetica", style);
    doc.setFontSize(size);
    doc.setTextColor(gray);
  };

  // Banda de sección (fondo azul, texto centrado)
  const band = (txt: string, h = 5.5) => {
    doc.setFillColor(...BLUE);
    doc.rect(mX, y, W, h, "FD");
    setF("bold", 8, 20);
    doc.text(txt, mX + W / 2, y + h - 1.6, { align: "center" });
    y += h;
  };

  // Fila de celdas: cada celda {label, value, w(frac)}. Etiqueta en negrita,
  // valor en la misma línea si hay espacio (label ocupa un ancho fijo).
  const rowCells = (
    cells: { label: string; value?: string; w: number; labelW?: number }[],
    h = 7,
  ) => {
    let x = mX;
    for (const c of cells) {
      const cw = W * c.w;
      doc.rect(x, y, cw, h);
      setF("bold", 7, 30);
      doc.text(c.label, x + 1.6, y + h / 2 + 1);
      const lw = c.labelW ?? doc.getTextWidth(c.label) + 3;
      if (c.value) {
        setF("normal", 8, 20);
        doc.text(doc.splitTextToSize(c.value, cw - lw - 2)[0] || "", x + lw + 1, y + h / 2 + 1);
      }
      x += cw;
    }
    y += h;
  };

  // Celda con casilla de verificación + etiqueta
  const optCell = (x: number, cw: number, h: number, label: string, marcado: boolean) => {
    doc.rect(x, y, cw, h);
    const bx = x + 1.6;
    const by = y + h / 2 - 1.6;
    doc.rect(bx, by, 3.2, 3.2);
    if (marcado) {
      setF("bold", 8, 20);
      doc.text("X", bx + 0.5, by + 2.7);
    }
    setF("normal", 6.6, 20);
    const lines = doc.splitTextToSize(label, cw - 7);
    doc.text(lines.slice(0, 2), x + 6, lines.length > 1 ? y + h / 2 - 0.4 : y + h / 2 + 1);
  };

  // ---------- ENCABEZADO ----------
  const hH = 15;
  const logoW = 28;
  const codeW = 42;
  const midW = W - logoW - codeW;
  doc.rect(mX, y, W, hH);
  doc.line(mX + logoW, y, mX + logoW, y + hH);
  doc.line(mX + logoW + midW, y, mX + logoW + midW, y + hH);

  const logo = await getLogo();
  if (logo) doc.addImage(logo, "PNG", mX + 3, y + 3.5, 22, 8);

  const cxMid = mX + logoW;
  doc.line(cxMid, y + 5, cxMid + midW, y + 5);
  doc.line(cxMid, y + 10, cxMid + midW, y + 10);
  setF("bold", 8.5, 20);
  doc.text("GESTIÓN DE TALENTO HUMANO", cxMid + midW / 2, y + 3.5, { align: "center" });
  setF("normal", 7.5, 20);
  doc.text("Formato", cxMid + midW / 2, y + 8.5, { align: "center" });
  setF("bold", 8, 20);
  doc.text(TITULO, cxMid + midW / 2, y + 13.3, { align: "center", maxWidth: midW - 4 });

  const cxCode = cxMid + midW;
  doc.line(cxCode, y + 5, right, y + 5);
  doc.line(cxCode, y + 10, right, y + 10);
  setF("bold", 8, 20);
  doc.text(CODIGO, cxCode + 2, y + 3.5);
  setF("normal", 7.5, 20);
  doc.text(VERSION, cxCode + 2, y + 8.5);
  doc.text(APROBADO, cxCode + 2, y + 13.3);
  y += hH;

  // ---------- DATOS DE IDENTIFICACION ----------
  band("DATOS DE IDENTIFICACION");
  rowCells([
    { label: "Fecha de Solicitud:", value: fmtFechaHora(r.created_at), w: 0.34 },
    { label: "Nombre del Colaborador:", value: r.requester_name || "", w: 0.42 },
    { label: "No de identificación:", value: r.requester_identification || "", w: 0.24 },
  ]);
  rowCells([
    { label: "Cargo:", value: r.requester_role || "", w: 0.6 },
    { label: "Sede:", value: r.requester_sede || "", w: 0.4 },
  ]);

  // ---------- MOTIVO DE PERMISO ----------
  const esCambio = r.request_type === "cambio_turno";
  band("MOTIVO DE PERMISO");
  const motivoSel = norm(r.reason_type);
  const labelColW = W * 0.16;
  // Fila NO RECUPERABLE
  const h1 = 8;
  doc.rect(mX, y, labelColW, h1);
  setF("bold", 6.6, 30);
  doc.text("NO RECUPERABLE", mX + 1.4, y + h1 / 2 + 1, { maxWidth: labelColW - 2 });
  {
    const restW = W - labelColW;
    const cw = restW / NO_RECUP.length;
    let x = mX + labelColW;
    for (const opt of NO_RECUP) {
      optCell(x, cw, h1, opt, motivoSel === norm(opt));
      x += cw;
    }
    y += h1;
  }
  // Fila RECUPERABLE
  const h2 = 6.5;
  doc.rect(mX, y, labelColW, h2);
  setF("bold", 6.6, 30);
  doc.text("RECUPERABLE", mX + 1.4, y + h2 / 2 + 1, { maxWidth: labelColW - 2 });
  {
    const restW = W - labelColW;
    const cw = restW / RECUP.length;
    let x = mX + labelColW;
    for (const opt of RECUP) {
      optCell(x, cw, h2, opt, motivoSel === norm(opt));
      x += cw;
    }
    y += h2;
  }

  // ---------- DESCRIPCION DEL PERMISO ----------
  band("DESCRIPCION DEL PERMISO");
  if (esCambio) {
    rowCells([
      { label: "Turno original:", value: `${r.original_shift_code || "—"} (${fmtFecha(r.original_shift_date)})`, w: 0.5 },
      { label: "Nuevo turno:", value: `${r.requested_shift_code || "—"} (${fmtFecha(r.requested_shift_date)})`, w: 0.5 },
    ]);
    rowCells([{ label: "Cambia con:", value: r.swap_partner_name || "—", w: 1 }]);
  } else {
    rowCells([
      { label: "Fecha inicial permiso:", value: fmtFecha(r.start_date), w: 0.3 },
      { label: "Fecha final del permiso:", value: fmtFecha(r.end_date), w: 0.34 },
      { label: "Hora inicial:", value: r.start_time || "", w: 0.18 },
      { label: "Hora final:", value: r.end_time || "", w: 0.18 },
    ]);
  }

  // Casillas SI/NO
  const siNo = (x: number, cw: number, label: string, val: boolean) => {
    doc.rect(x, y, cw, 6);
    setF("bold", 6.6, 30);
    doc.text(label, x + 1.4, y + 4);
    const tw = doc.getTextWidth(label);
    setF("normal", 6.6, 20);
    doc.text(`SI: ${val ? "X" : "__"}    NO: ${val ? "__" : "X"}`, x + tw + 3, y + 4);
  };
  {
    const cw = W / 3;
    siNo(mX, cw, "Será recuperado el tiempo:", !!r.will_recover_time);
    siNo(mX + cw, cw, "Requiere reemplazo:", !!r.requires_replacement);
    siNo(mX + cw * 2, cw, "Remunerado:", !!r.paid);
    y += 6;
  }
  rowCells([
    { label: "Nombre del reemplazo:", value: r.replacement_name || "", w: 0.5 },
    { label: "Cargo:", value: r.replacement_role || "", w: 0.3 },
    { label: "Firma:", value: "", w: 0.2 },
  ]);
  rowCells([{ label: "Especifique motivo del permiso:", value: r.reason_detail || r.observations || "", w: 1 }], 10);

  // ---------- BITACORA DE RECUPERACION ----------
  band("BITACORA DE RECUPERACION DEL TIEMPO SI APLICA");
  const bcols = [
    { t: "Fecha", w: 0.14 }, { t: "Hora inicial / Hora final", w: 0.2 }, { t: "Verificado por", w: 0.16 },
    { t: "Fecha", w: 0.14 }, { t: "Hora inicial / Hora final", w: 0.2 }, { t: "Verificado por", w: 0.16 },
  ];
  {
    let x = mX;
    for (const c of bcols) {
      const cw = W * c.w;
      doc.rect(x, y, cw, 5);
      setF("normal", 6.4, 20);
      doc.text(c.t, x + cw / 2, y + 3.4, { align: "center", maxWidth: cw - 2 });
      x += cw;
    }
    y += 5;
  }
  // Primera fila: si hay devolución planeada, se prellena.
  {
    const vals = r.will_recover_time && r.return_date
      ? [fmtFecha(r.return_date), r.return_shift_code || "", r.return_person_name || "", "", "", ""]
      : ["", "", "", "", "", ""];
    let x = mX;
    bcols.forEach((c, i) => {
      const cw = W * c.w;
      doc.rect(x, y, cw, 6);
      if (vals[i]) {
        setF("normal", 6.6, 20);
        doc.text(doc.splitTextToSize(vals[i], cw - 2)[0] || "", x + cw / 2, y + 4, { align: "center" });
      }
      x += cw;
    });
    y += 6;
    // Segunda fila en blanco
    x = mX;
    bcols.forEach((c) => { const cw = W * c.w; doc.rect(x, y, cw, 6); x += cw; });
    y += 6;
  }

  // ---------- FIRMAS ----------
  y += 2;
  const fW = W / 4;
  const fH = 22;
  const firmaY = y;
  for (let i = 0; i < 4; i++) doc.rect(mX + fW * i, firmaY, fW, fH);

  // Firma del colaborador (imagen)
  if (opts?.firmaDataUrl) {
    try { doc.addImage(opts.firmaDataUrl, "PNG", mX + 4, firmaY + 3, fW - 8, 11); } catch { /* no embebible */ }
  }
  // Firma jefe inmediato (aprobador) si la solicitud fue aprobada
  if (opts?.jefeFirmaDataUrl && r.status === "APROBADA") {
    try { doc.addImage(opts.jefeFirmaDataUrl, "PNG", mX + fW + 4, firmaY + 3, fW - 8, 11); } catch { /* no embebible */ }
  }

  const labels = ["Firma del colaborador", "Vo. Bo. Jefe Inmediato", "Vo. Bo. Subgerencia", "Vo. Bo. Gerente"];
  const nombres = [r.requester_name || "", r.status === "APROBADA" ? (opts?.usuario || "") : "", "", ""];
  for (let i = 0; i < 4; i++) {
    const cxi = mX + fW * i;
    doc.line(cxi + 4, firmaY + fH - 7, cxi + fW - 4, firmaY + fH - 7);
    if (nombres[i]) {
      setF("normal", 6.5, 20);
      doc.text(nombres[i], cxi + fW / 2, firmaY + fH - 4.2, { align: "center", maxWidth: fW - 6 });
    }
    setF("bold", 6.5, 40);
    doc.text(labels[i], cxi + fW / 2, firmaY + fH - 1.4, { align: "center", maxWidth: fW - 4 });
  }
  y = firmaY + fH + 2.5;

  // ---------- NOTAS ----------
  setF("normal", 6.4, 60);
  for (const n of NOTAS) {
    doc.text(doc.splitTextToSize(n, W), mX, y);
    y += 3.4;
  }
  y += 1;

  // ---------- PIE ----------
  doc.setFillColor(...BLUE);
  doc.rect(mX, y, W, 5, "FD");
  setF("bold", 7.5, 20);
  doc.text(PIE, mX + W / 2, y + 3.4, { align: "center" });
  y += 5;

  if (r.requester_signature_hash) {
    setF("normal", 6, 110);
    doc.text(`Verificación de firma: ${r.requester_signature_hash.slice(0, 24)}…  ·  Generado: ${fmtFechaHora(new Date().toISOString())}`, mX, y + 3.5);
  }

  const slug = (r.requester_name || "solicitud").replace(/[^a-z0-9]+/gi, "_").slice(0, 40);
  doc.save(`TH-FR-09_${slug}_${r.id.slice(0, 8)}.pdf`);
}
