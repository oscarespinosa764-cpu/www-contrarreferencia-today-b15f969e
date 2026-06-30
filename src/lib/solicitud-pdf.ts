// Generación BAJO DEMANDA del PDF oficial TH-FR-09
// (Solicitud de permiso, ausencia, salida o cambio de turno).
//
// IMPORTANTE (control de costos): el PDF se construye en memoria en el
// navegador y se entrega para descarga. NO se guarda en el bucket ni en la
// base de datos. jsPDF es 100% JavaScript (sin servicios externos, sin IA).

import logoAsset from "@/assets/cedim-logo.png.asset.json";
import { fmtFecha, fmtFechaHora, type ShiftRequest } from "@/lib/cuadro-turno-utils";

const INSTITUCION = "CENTRO DE IMAGENES DIAGNOSTICAS CEDIM I.P.S S.A.S";
const NIT = "NIT: 900559103-5";
const PIE = "SISTEMA DE REFERENCIA Y CONTRARREFERENCIA";
const TITULO = "SOLICITUD DE PERMISO, AUSENCIA, SALIDA O CAMBIO DE TURNO";
const CODIGO = "Código: TH-FR-09";

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
  const marginX = 14;
  const contentW = pageW - marginX * 2;

  // -------- Encabezado --------
  const logo = await getLogo();
  if (logo) doc.addImage(logo, "PNG", marginX, 8, 20, 14.5);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text(INSTITUCION, pageW / 2, 12, { align: "center" });
  doc.setFontSize(9);
  doc.text(TITULO, pageW / 2, 17.5, { align: "center" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text(NIT, pageW - marginX, 12, { align: "right" });
  doc.text(CODIGO, pageW - marginX, 16.5, { align: "right" });
  doc.setDrawColor(150);
  doc.line(marginX, 25, pageW - marginX, 25);

  let y = 31;

  const seccion = (titulo: string) => {
    if (y > pageH - 30) { doc.addPage(); y = 20; }
    doc.setFillColor(230, 232, 236);
    doc.rect(marginX, y - 4.5, contentW, 6, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(40);
    doc.text(titulo, marginX + 2, y);
    y += 6;
  };

  const fila = (label: string, value: string) => {
    if (y > pageH - 22) { doc.addPage(); y = 20; }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(70);
    doc.text(label, marginX + 2, y);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(20);
    const lines = doc.splitTextToSize(value || "—", contentW - 52);
    doc.text(lines, marginX + 50, y);
    y += Math.max(5, lines.length * 4.3);
  };

  const motivo = r.reason_type === "Otro" ? r.other_reason || "Otro" : r.reason_type || "—";
  const tipo = r.request_type === "cambio_turno"
    ? "Cambio de turno"
    : "Permiso / ausencia / salida";

  // -------- Datos de identificación --------
  seccion("DATOS DE IDENTIFICACIÓN");
  fila("Colaborador", r.requester_name || "—");
  fila("Identificación", r.requester_identification || "—");
  fila("Cargo", r.requester_role || "—");
  fila("Sede / dependencia", r.requester_sede || "—");
  fila("Fecha de solicitud", fmtFechaHora(r.created_at));
  y += 1.5;

  // -------- Detalle de la solicitud --------
  seccion("DETALLE DE LA SOLICITUD");
  fila("Tipo", tipo);
  fila("Motivo", motivo);

  if (r.request_type === "cambio_turno") {
    fila("Turno original", `${r.original_shift_code || "—"} (${fmtFecha(r.original_shift_date)})`);
    fila("Turno solicitado", `${r.requested_shift_code || "—"} (${fmtFecha(r.requested_shift_date)})`);
    if (r.swap_partner_name) fila("Cambia con", r.swap_partner_name);
  } else {
    fila("Desde", `${fmtFecha(r.start_date)}${r.start_time ? " " + r.start_time : ""}`);
    fila("Hasta", `${fmtFecha(r.end_date)}${r.end_time ? " " + r.end_time : ""}`);
  }
  fila("Recupera tiempo", r.will_recover_time ? "Sí" : "No");
  fila("Requiere reemplazo", r.requires_replacement
    ? `Sí${r.replacement_name ? ` — ${r.replacement_name}` : ""}${r.replacement_role ? ` (${r.replacement_role})` : ""}`
    : "No");
  if (r.paid != null) fila("Remunerado", r.paid ? "Sí" : "No");
  if (r.reason_detail) fila("Descripción", r.reason_detail);
  if (r.observations) fila("Observaciones", r.observations);
  y += 1.5;

  // -------- Trazabilidad / decisión --------
  seccion("TRAZABILIDAD DE LA SOLICITUD");
  fila("Estado actual", r.status);
  if (r.approved_at) fila("Aprobada", fmtFechaHora(r.approved_at));
  if (r.approval_observation) fila("Obs. aprobación", r.approval_observation);
  if (r.rejected_at) fila("Respondida", fmtFechaHora(r.rejected_at));
  if (r.rejection_reason) fila("Razón / ajuste", r.rejection_reason);
  if (r.response_observation) fila("Obs. respuesta", r.response_observation);
  y += 3;

  // -------- Firma --------
  if (y > pageH - 45) { doc.addPage(); y = 20; }
  seccion("FIRMA DEL SOLICITANTE");
  y += 2;
  if (opts?.firmaDataUrl) {
    try {
      doc.addImage(opts.firmaDataUrl, "PNG", marginX + 2, y, 50, 20);
    } catch { /* firma no embebible */ }
  }
  doc.setDrawColor(120);
  doc.line(marginX + 2, y + 22, marginX + 72, y + 22);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(60);
  doc.text(r.requester_name || "Firma del solicitante", marginX + 2, y + 26);
  if (r.requester_signature_hash) {
    doc.text(`Verificación: ${r.requester_signature_hash.slice(0, 16)}…`, marginX + 2, y + 30);
  }

  // -------- Pie en cada página --------
  const total = doc.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    doc.setDrawColor(150);
    doc.line(marginX, pageH - 14, pageW - marginX, pageH - 14);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(110);
    doc.text(PIE, marginX, pageH - 9);
    doc.text(
      `Generado: ${fmtFechaHora(new Date().toISOString())}${opts?.usuario ? " · " + opts.usuario : ""}`,
      marginX,
      pageH - 5.5,
    );
    doc.text(`Página ${p} de ${total}`, pageW - marginX, pageH - 9, { align: "right" });
  }

  const slug = (r.requester_name || "solicitud").replace(/[^a-z0-9]+/gi, "_").slice(0, 40);
  doc.save(`TH-FR-09_${slug}_${r.id.slice(0, 8)}.pdf`);
}
