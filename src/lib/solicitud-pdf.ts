// Generación BAJO DEMANDA del PDF oficial TH-FR-09 (Versión 02)
// (Solicitud de permiso, ausencia o salida del colaborador / cambio de turno).
//
// FASE 7 — Presentación 100% administrable desde Control de Mando →
// Plantillas del sistema → TH-FR-09. La configuración publicada se
// guarda en plantillas_inventario.contenido_editable y se consume aquí
// a través de loadSolicitudPermisoConfig(); si no hay configuración o
// es inválida, se usan defaults seguros y el PDF sigue siendo válido.
//
// LÓGICA OPERATIVA INTACTA: cálculo de duración, motivo real,
// clasificación recuperable/no recuperable, turno programado,
// reemplazo, fechas/horas y auditoría se toman del registro real (r)
// y NO se modifican desde la configuración documental.
//
// IMPORTANTE (control de costos): el PDF se construye en memoria en el
// navegador y se entrega para descarga. NO se guarda en el bucket ni en la
// base de datos. jsPDF es 100% JavaScript (sin servicios externos, sin IA).

import logoAsset from "@/assets/cedim-logo.png.asset.json";
import { fmtFecha, fmtFechaHora, type ShiftRequest } from "@/lib/cuadro-turno-utils";
import {
  loadSolicitudPermisoConfig,
  type SolicitudPermisoConfig,
} from "@/lib/solicitud-permiso-config";

// Catálogos operativos (protegidos): NO se editan desde la plantilla.
// Provienen del código porque se corresponden 1:1 con MOTIVO_PERMISO y
// su clasificación institucional (recuperable / no recuperable).
const NO_RECUP = ["Cita médica", "Actividad escolar de hijos", "Citación judicial", "Calamidad grave", "Cumpleaños", "Compensatorio"];
const RECUP = ["Estudio", "Licencia", "Diligencia personal", "Otro"];

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
  opts?: {
    firmaDataUrl?: string | null;
    jefeFirmaDataUrl?: string | null;
    usuario?: string;
    /** Override de configuración (vista previa desde el editor). Si se
     * omite, se usa la versión PUBLICADA en plantillas_inventario. */
    configOverride?: SolicitudPermisoConfig;
  },
): Promise<void> {
  const { jsPDF } = await import("jspdf");
  const cfg =
    opts?.configOverride ?? (await loadSolicitudPermisoConfig()).config;

  const doc: Doc = new jsPDF({
    unit: "mm",
    format: cfg.page.page_size,
    orientation: cfg.page.orientation,
  });
  const pageW = doc.internal.pageSize.getWidth();
  const mX = cfg.page.margin_left;
  const mR = cfg.page.margin_right;
  const right = pageW - mR;
  const W = pageW - mX - mR;

  doc.setDrawColor(90);
  doc.setLineWidth(0.2);

  const BLUE: [number, number, number] = [197, 217, 241];
  let y = cfg.page.margin_top;

  // ---------- helpers ----------
  const setF = (style: "normal" | "bold", size: number, gray = 20) => {
    doc.setFont("helvetica", style);
    doc.setFontSize(size);
    doc.setTextColor(gray);
  };

  const band = (txt: string, h = 5.5) => {
    doc.setFillColor(...BLUE);
    doc.rect(mX, y, W, h, "FD");
    setF("bold", 8, 20);
    doc.text(txt, mX + W / 2, y + h - 1.6, { align: "center" });
    y += h;
  };

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

  if (cfg.header.show_logo) {
    const logo = await getLogo();
    if (logo) doc.addImage(logo, "PNG", mX + 3, y + 3.5, 22, 8);
  }

  const cxMid = mX + logoW;
  doc.line(cxMid, y + 5, cxMid + midW, y + 5);
  doc.line(cxMid, y + 10, cxMid + midW, y + 10);
  setF("bold", 8.5, 20);
  doc.text(cfg.header.institution_area, cxMid + midW / 2, y + 3.5, { align: "center" });
  setF("normal", 7.5, 20);
  doc.text(cfg.header.format_label, cxMid + midW / 2, y + 8.5, { align: "center" });
  setF("bold", 8, 20);
  doc.text(cfg.header.document_title, cxMid + midW / 2, y + 13.3, {
    align: "center",
    maxWidth: midW - 4,
  });

  const cxCode = cxMid + midW;
  doc.line(cxCode, y + 5, right, y + 5);
  doc.line(cxCode, y + 10, right, y + 10);
  setF("bold", 8, 20);
  doc.text(cfg.header.format_code_visible, cxCode + 2, y + 3.5);
  setF("normal", 7.5, 20);
  doc.text(cfg.header.version_label, cxCode + 2, y + 8.5);
  doc.text(cfg.header.approval_label, cxCode + 2, y + 13.3);
  y += hH;

  // ---------- DATOS DE IDENTIFICACION ----------
  band(cfg.employee_section.band_title);
  rowCells([
    { label: cfg.employee_section.label_fecha_solicitud, value: fmtFechaHora(r.created_at), w: 0.34 },
    { label: cfg.employee_section.label_nombre, value: r.requester_name || "", w: 0.42 },
    { label: cfg.employee_section.label_identificacion, value: r.requester_identification || "", w: 0.24 },
  ]);
  rowCells([
    { label: cfg.employee_section.label_cargo, value: r.requester_role || "", w: 0.6 },
    { label: cfg.employee_section.label_sede, value: r.requester_sede || "", w: 0.4 },
  ]);

  // ---------- MOTIVO DE PERMISO ----------
  const esCambio = r.request_type === "cambio_turno";
  band(cfg.request_section.band_title);
  const motivoSel = norm(r.reason_type);
  const labelColW = W * 0.16;
  const h1 = 8;
  doc.rect(mX, y, labelColW, h1);
  setF("bold", 6.6, 30);
  doc.text(cfg.request_section.label_no_recuperable, mX + 1.4, y + h1 / 2 + 1, {
    maxWidth: labelColW - 2,
  });
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
  const h2 = 6.5;
  doc.rect(mX, y, labelColW, h2);
  setF("bold", 6.6, 30);
  doc.text(cfg.request_section.label_recuperable, mX + 1.4, y + h2 / 2 + 1, {
    maxWidth: labelColW - 2,
  });
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
  band(cfg.schedule_section.band_title);
  if (esCambio) {
    rowCells([
      {
        label: cfg.schedule_section.label_turno_original,
        value: `${r.original_shift_code || "—"} (${fmtFecha(r.original_shift_date)})`,
        w: 0.5,
      },
      {
        label: cfg.schedule_section.label_turno_nuevo,
        value: `${r.requested_shift_code || "—"} (${fmtFecha(r.requested_shift_date)})`,
        w: 0.5,
      },
    ]);
    rowCells([
      { label: cfg.schedule_section.label_cambia_con, value: r.swap_partner_name || "—", w: 1 },
    ]);
  } else {
    rowCells([
      { label: cfg.schedule_section.label_fecha_inicial, value: fmtFecha(r.start_date), w: 0.3 },
      { label: cfg.schedule_section.label_fecha_final, value: fmtFecha(r.end_date), w: 0.34 },
      { label: cfg.schedule_section.label_hora_inicial, value: r.start_time || "", w: 0.18 },
      { label: cfg.schedule_section.label_hora_final, value: r.end_time || "", w: 0.18 },
    ]);
  }

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
    siNo(mX, cw, cfg.schedule_section.label_recuperado, !!r.will_recover_time);
    siNo(mX + cw, cw, cfg.schedule_section.label_reemplazo, !!r.requires_replacement);
    siNo(mX + cw * 2, cw, cfg.schedule_section.label_remunerado, !!r.paid);
    y += 6;
  }
  rowCells([
    { label: cfg.replacement_section.label_nombre, value: r.replacement_name || "", w: 0.5 },
    { label: cfg.replacement_section.label_cargo, value: r.replacement_role || "", w: 0.3 },
    { label: cfg.replacement_section.label_firma, value: "", w: 0.2 },
  ]);
  rowCells(
    [
      {
        label: cfg.schedule_section.label_motivo_detalle,
        value: r.reason_detail || r.observations || "",
        w: 1,
      },
    ],
    10,
  );

  // ---------- BITACORA DE RECUPERACION ----------
  band(cfg.recovery_section.band_title);
  const bcols = [
    { t: cfg.recovery_section.col_fecha, w: 0.14 },
    { t: cfg.recovery_section.col_horario, w: 0.2 },
    { t: cfg.recovery_section.col_verificado, w: 0.16 },
    { t: cfg.recovery_section.col_fecha, w: 0.14 },
    { t: cfg.recovery_section.col_horario, w: 0.2 },
    { t: cfg.recovery_section.col_verificado, w: 0.16 },
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

  if (opts?.firmaDataUrl) {
    try { doc.addImage(opts.firmaDataUrl, "PNG", mX + 4, firmaY + 3, fW - 8, 11); } catch { /* no embebible */ }
  }
  if (opts?.jefeFirmaDataUrl && r.status === "APROBADA") {
    try { doc.addImage(opts.jefeFirmaDataUrl, "PNG", mX + fW + 4, firmaY + 3, fW - 8, 11); } catch { /* no embebible */ }
  }

  const labels = [
    cfg.signatures_section.label_colaborador,
    cfg.signatures_section.label_jefe,
    cfg.signatures_section.label_subgerencia,
    cfg.signatures_section.label_gerente,
  ];
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
  for (const n of cfg.declaration_section.notas) {
    doc.text(doc.splitTextToSize(n, W), mX, y);
    y += 3.4;
  }
  y += 1;

  // ---------- PIE ----------
  doc.setFillColor(...BLUE);
  doc.rect(mX, y, W, 5, "FD");
  setF("bold", 7.5, 20);
  doc.text(cfg.footer.left_text, mX + W / 2, y + 3.4, { align: "center" });
  y += 5;

  if (cfg.footer.show_verification && r.requester_signature_hash) {
    setF("normal", 6, 110);
    doc.text(`Verificación de firma: ${r.requester_signature_hash.slice(0, 24)}…  ·  Generado: ${fmtFechaHora(new Date().toISOString())}`, mX, y + 3.5);
  }

  const slug = (r.requester_name || "solicitud").replace(/[^a-z0-9]+/gi, "_").slice(0, 40);
  doc.save(`TH-FR-09_${slug}_${r.id.slice(0, 8)}.pdf`);
}
