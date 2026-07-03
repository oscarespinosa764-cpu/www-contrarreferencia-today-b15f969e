// Generación BAJO DEMANDA del PDF oficial TH-FR-09
// (Solicitud de permiso, ausencia, salida o cambio de turno).
//
// IMPORTANTE (control de costos): el PDF se construye en memoria en el
// navegador y se entrega para descarga. NO se guarda en el bucket ni en la
// base de datos. jsPDF es 100% JavaScript (sin servicios externos, sin IA).
//
// Layout tipo FORMATO INSTITUCIONAL: encabezado con logo + código, casillas
// de verificación para el tipo de solicitud, campos con recuadro y bloque de
// firmas (solicitante / jefe inmediato / talento humano) en una sola página.

import logoAsset from "@/assets/cedim-logo.png.asset.json";
import { fmtFecha, fmtFechaHora, type ShiftRequest } from "@/lib/cuadro-turno-utils";

const INSTITUCION = "CENTRO DE IMAGENES DIAGNOSTICAS CEDIM I.P.S S.A.S";
const NIT = "NIT: 900559103-5";
const PIE = "SISTEMA DE REFERENCIA Y CONTRARREFERENCIA";
const TITULO = "SOLICITUD DE PERMISO, AUSENCIA, SALIDA O CAMBIO DE TURNO";
const CODIGO = "TH-FR-09";
const VERSION = "Versión: 01";

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
  opts?: { firmaDataUrl?: string | null; usuario?: string },
): Promise<void> {
  const { jsPDF } = await import("jspdf");
  const doc: Doc = new jsPDF({ unit: "mm", format: "letter" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const mX = 12;
  const right = pageW - mX;
  const contentW = pageW - mX * 2;

  doc.setDrawColor(60);
  doc.setLineWidth(0.2);

  // ============ ENCABEZADO (tabla de 3 columnas) ============
  const hTop = 12;
  const hH = 18;
  const logoW = 34;
  const codeW = 40;
  const nameW = contentW - logoW - codeW;

  // marco
  doc.rect(mX, hTop, contentW, hH);
  doc.line(mX + logoW, hTop, mX + logoW, hTop + hH);
  doc.line(mX + logoW + nameW, hTop, mX + logoW + nameW, hTop + hH);

  const logo = await getLogo();
  if (logo) doc.addImage(logo, "PNG", mX + 5, hTop + 3, 24, 12);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.setTextColor(20);
  doc.text(INSTITUCION, mX + logoW + nameW / 2, hTop + 6, { align: "center", maxWidth: nameW - 4 });
  doc.setFontSize(8.5);
  doc.text(TITULO, mX + logoW + nameW / 2, hTop + 12.5, { align: "center", maxWidth: nameW - 4 });

  // caja de código (3 filas)
  const cx = mX + logoW + nameW;
  doc.line(cx, hTop + 6, right, hTop + 6);
  doc.line(cx, hTop + 12, right, hTop + 12);
  doc.setFontSize(7.5);
  doc.setFont("helvetica", "bold");
  doc.text(`Código: ${CODIGO}`, cx + 2, hTop + 4);
  doc.setFont("helvetica", "normal");
  doc.text(VERSION, cx + 2, hTop + 10);
  doc.text(NIT, cx + 2, hTop + 16);

  let y = hTop + hH;

  // helpers -----------------------------------------------------------------
  const bandaTitulo = (txt: string) => {
    doc.setFillColor(225, 228, 233);
    doc.rect(mX, y, contentW, 6, "F");
    doc.rect(mX, y, contentW, 6);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(30);
    doc.text(txt, mX + 2, y + 4);
    y += 6;
  };

  // Campo con recuadro: [label] valor. Ancho fraccional (0..1) del contentW.
  const campo = (label: string, value: string, frac = 1, h = 8): void => {
    const w = contentW * frac;
    doc.rect(mX + campoX, y, w, h);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.5);
    doc.setTextColor(90);
    doc.text(label.toUpperCase(), mX + campoX + 1.5, y + 3);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(20);
    const lines = doc.splitTextToSize(value || "—", w - 3);
    doc.text(lines.slice(0, 2), mX + campoX + 1.5, y + 6.4);
    campoX += w;
  };
  let campoX = 0;
  const fila = (h = 8) => { campoX = 0; y += h; };

  const casilla = (x: number, yy: number, marcado: boolean, label: string) => {
    doc.rect(x, yy, 4, 4);
    if (marcado) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.text("X", x + 0.8, yy + 3.4);
    }
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(20);
    doc.text(label, x + 6, yy + 3.3);
  };

  // ============ TIPO DE SOLICITUD ============
  bandaTitulo("TIPO DE SOLICITUD");
  const esCambio = r.request_type === "cambio_turno";
  const boxY = y + 2;
  casilla(mX + 4, boxY, !esCambio, "Permiso / Ausencia / Salida");
  casilla(mX + contentW / 2, boxY, esCambio, "Cambio de turno");
  y += 9;

  // ============ DATOS DEL SOLICITANTE ============
  bandaTitulo("DATOS DEL SOLICITANTE");
  campo("Colaborador", r.requester_name || "", 0.6);
  campo("Identificación", r.requester_identification || "", 0.4);
  fila();
  campo("Cargo", r.requester_role || "", 0.55);
  campo("Sede / dependencia", r.requester_sede || "", 0.45);
  fila();
  campo("Fecha de solicitud", fmtFechaHora(r.created_at), 1);
  fila();

  // ============ DETALLE ============
  bandaTitulo("DETALLE DE LA SOLICITUD");
  const motivo = r.reason_type === "Otro" ? r.other_reason || "Otro" : r.reason_type || "—";
  campo("Motivo", motivo, 1);
  fila();

  if (esCambio) {
    campo("Turno original", `${r.original_shift_code || "—"} (${fmtFecha(r.original_shift_date)})`, 0.5);
    campo("Turno solicitado", `${r.requested_shift_code || "—"} (${fmtFecha(r.requested_shift_date)})`, 0.5);
    fila();
    campo("Cambia con", r.swap_partner_name || "—", 1);
    fila();
  } else {
    campo("Desde", `${fmtFecha(r.start_date)}${r.start_time ? " " + r.start_time : ""}`, 0.5);
    campo("Hasta", `${fmtFecha(r.end_date)}${r.end_time ? " " + r.end_time : ""}`, 0.5);
    fila();
  }

  // casillas Sí/No
  const flagsY = y + 2;
  casilla(mX + 4, flagsY, r.will_recover_time, "Recupera tiempo");
  casilla(mX + contentW / 3 + 4, flagsY, r.requires_replacement, "Requiere reemplazo");
  if (r.paid != null) casilla(mX + (contentW * 2) / 3 + 4, flagsY, !!r.paid, "Remunerado");
  y += 9;

  if (r.requires_replacement && (r.replacement_name || r.replacement_role)) {
    campo("Reemplazo", `${r.replacement_name || "—"}${r.replacement_role ? ` (${r.replacement_role})` : ""}`, 1);
    fila();
  }
  if (r.reason_detail) { campo("Descripción", r.reason_detail, 1, 12); fila(12); }
  if (r.observations) { campo("Observaciones", r.observations, 1, 12); fila(12); }

  // ============ TRAZABILIDAD / DECISIÓN ============
  bandaTitulo("TRAZABILIDAD DE LA DECISIÓN");
  campo("Estado actual", r.status, 0.5);
  campo("Fecha de respuesta", r.approved_at ? fmtFechaHora(r.approved_at) : r.rejected_at ? fmtFechaHora(r.rejected_at) : "—", 0.5);
  fila();
  const obsDec = r.approval_observation || r.rejection_reason || r.response_observation || "";
  campo("Observación / ajuste", obsDec, 1, 10);
  fila(10);

  // ============ FIRMAS ============
  bandaTitulo("FIRMAS");
  const firmaBoxY = y + 2;
  const fW = contentW / 3;
  const fH = 24;
  for (let i = 0; i < 3; i++) doc.rect(mX + fW * i, firmaBoxY, fW, fH);

  // firma del solicitante (imagen si existe)
  if (opts?.firmaDataUrl) {
    try { doc.addImage(opts.firmaDataUrl, "PNG", mX + 4, firmaBoxY + 3, fW - 8, 12); } catch { /* no embebible */ }
  }
  const firmaLabels = ["SOLICITANTE", "JEFE INMEDIATO", "TALENTO HUMANO"];
  const firmaNombres = [r.requester_name || "", "", ""];
  doc.setTextColor(20);
  for (let i = 0; i < 3; i++) {
    const cxi = mX + fW * i;
    doc.line(cxi + 4, firmaBoxY + fH - 7, cxi + fW - 4, firmaBoxY + fH - 7);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    if (firmaNombres[i]) doc.text(firmaNombres[i], cxi + fW / 2, firmaBoxY + fH - 4, { align: "center", maxWidth: fW - 6 });
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.5);
    doc.setTextColor(90);
    doc.text(firmaLabels[i], cxi + fW / 2, firmaBoxY + fH - 1, { align: "center" });
    doc.setTextColor(20);
  }
  y = firmaBoxY + fH + 3;
  if (r.requester_signature_hash) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(110);
    doc.text(`Verificación de firma: ${r.requester_signature_hash.slice(0, 24)}…`, mX, y);
    y += 3;
  }

  // ============ PIE ============
  doc.setDrawColor(150);
  doc.line(mX, pageH - 14, right, pageH - 14);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  doc.setTextColor(110);
  doc.text(PIE, mX, pageH - 9.5);
  doc.text(
    `Generado: ${fmtFechaHora(new Date().toISOString())}${opts?.usuario ? " · " + opts.usuario : ""}`,
    mX,
    pageH - 6,
  );
  doc.text(`${CODIGO} · ${VERSION}`, right, pageH - 9.5, { align: "right" });

  const slug = (r.requester_name || "solicitud").replace(/[^a-z0-9]+/gi, "_").slice(0, 40);
  doc.save(`TH-FR-09_${slug}_${r.id.slice(0, 8)}.pdf`);
}
