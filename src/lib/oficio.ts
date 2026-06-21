// ══════════════════════════════════════════════════════════════════
//  Oficio institucional — formato tipo carta/plantilla formal para las
//  respuestas del módulo de remisiones entrantes (CEDIM IPS).
//  Sin IA: solo presentación visual. El MISMO HTML se ve en pantalla
//  y se copia al correo (Gmail / Outlook) para máxima fidelidad.
// ══════════════════════════════════════════════════════════════════
import { limpiarMarcadores } from "./rc-utils";

export const INSTITUCION = {
  nombre: "CEDIM IPS",
  nombreLargo: "Centro de Imágenes Diagnósticas CEDIM IPS",
  sede: "Sede Clínica Gloria Patricia Pinzón",
  oficina: "Oficina de Referencia y Contrarreferencia",
  email: "coordreferencia@cedimips.com",
  ciudad: "Florencia · Caquetá, Colombia",
  aviso: "Por favor, no responda a este mensaje.",
};

// Colores institucionales (HEX para poder incrustarlos en el correo con
// estilos en línea — espejo aproximado de los tokens de styles.css).
const TEAL = "#19A7AE";
const BLUE = "#0EA5E9";
const MAIN = "#0B3C73"; // azul institucional oscuro
const TEXT = "#243042";
const MUTED = "#6b7280";
const LINE = "#e5e9f0";

export const OFICIO_TITULO: Record<string, string> = {
  ACEP: "Caso aceptado",
  NEG: "Caso negado",
  AMP: "Ampliación registrada",
  CAN: "Cancelación registrada",
  ING: "Ingreso confirmado",
  CRUE_ACEP: "Aceptación de direccionamiento CRUE",
  CRUE_NR: "No requerimiento de direccionamiento",
  CRUE_NEG: "Negación al direccionamiento CRUE",
};

export function tituloOficio(tipo: string): string {
  return OFICIO_TITULO[tipo] || "Notificación";
}

// Ícono + color del estado, según el tipo de respuesta.
interface IconoCfg {
  simbolo: string;
  bg: string;
  ring: string;
  fg: string;
}
const ICONO: Record<string, IconoCfg> = {
  ACEP: { simbolo: "✓", bg: "#e7f6f6", ring: TEAL, fg: TEAL },
  ING: { simbolo: "✓", bg: "#e7f6f6", ring: TEAL, fg: TEAL },
  CRUE_ACEP: { simbolo: "✓", bg: "#e7f6f6", ring: TEAL, fg: TEAL },
  NEG: { simbolo: "✕", bg: "#fdeaea", ring: "#dc2626", fg: "#dc2626" },
  CRUE_NEG: { simbolo: "✕", bg: "#fdeaea", ring: "#dc2626", fg: "#dc2626" },
  CAN: { simbolo: "✕", bg: "#fdf2e3", ring: "#d97706", fg: "#d97706" },
  AMP: { simbolo: "+", bg: "#e8f1fb", ring: BLUE, fg: BLUE },
  CRUE_NR: { simbolo: "i", bg: "#e8f1fb", ring: BLUE, fg: BLUE },
};
function iconoCfg(tipo: string): IconoCfg {
  return ICONO[tipo] || { simbolo: "i", bg: "#eef2f7", ring: MAIN, fg: MAIN };
}

// Formato en línea: escapa HTML y aplica *negrita* y ==resaltado==.
function inlineFmt(texto: string): string {
  let html = String(texto).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  html = html.replace(/==([^=\n]+)==/g, '<mark style="background-color:#fef3c7;color:#000;padding:0 2px">$1</mark>');
  html = html.replace(/\*([^*\n]+)\*/g, `<strong style="color:${MAIN}">$1</strong>`);
  return html;
}

/**
 * Convierte el cuerpo (texto con marcadores) en HTML institucional:
 * párrafos, viñetas con bullet turquesa y espacios cómodos.
 */
function formatearCuerpoHTML(texto: string): string {
  const lines = String(texto || "").split("\n");
  let html = "";
  let inList = false;
  const closeList = () => {
    if (inList) {
      html += "</ul>";
      inList = false;
    }
  };
  for (const raw of lines) {
    const trimmed = raw.trim();
    if (/^[-•·]\s+/.test(trimmed)) {
      if (!inList) {
        html += `<ul style="margin:6px 0 6px;padding:0;list-style:none">`;
        inList = true;
      }
      const content = inlineFmt(trimmed.replace(/^[-•·]\s+/, ""));
      html +=
        `<li style="position:relative;padding-left:20px;margin:5px 0;color:${TEXT}">` +
        `<span style="position:absolute;left:2px;top:-1px;color:${TEAL};font-weight:700">•</span>${content}</li>`;
    } else {
      closeList();
      if (trimmed === "") {
        html += `<div style="height:10px"></div>`;
      } else {
        html += `<p style="margin:9px 0;color:${TEXT}">${inlineFmt(trimmed)}</p>`;
      }
    }
  }
  closeList();
  return html;
}

/** HTML del oficio institucional, con estilos en línea, apto para correo. */
export function buildOficioHTML(tipo: string, codigo: string, mensaje: string): string {
  const titulo = tituloOficio(tipo);
  const ic = iconoCfg(tipo);
  const cuerpo = formatearCuerpoHTML(mensaje);

  return [
    // ── Tarjeta / oficio ──────────────────────────────────────────
    `<div style="max-width:680px;margin:0 auto;background:#ffffff;border:1px solid ${LINE};border-radius:16px;overflow:hidden;font-family:'Segoe UI',Arial,sans-serif;color:${TEXT};line-height:1.6">`,

    // ── Encabezado institucional ──────────────────────────────────
    `<div style="padding:26px 32px 18px;border-bottom:3px solid ${TEAL};background:linear-gradient(180deg,#f4fbfc,#ffffff)">`,
    `<div style="font-size:13px;font-weight:700;letter-spacing:2px;color:${TEAL};text-transform:uppercase">${INSTITUCION.nombre}</div>`,
    `<div style="font-size:21px;font-weight:800;color:${MAIN};margin-top:2px">${INSTITUCION.nombreLargo}</div>`,
    `<div style="font-size:13px;font-style:italic;color:${BLUE};margin-top:3px">${INSTITUCION.sede}</div>`,
    `</div>`,

    // ── Franja oficina ────────────────────────────────────────────
    `<div style="background:${MAIN};color:#ffffff;padding:9px 32px;font-size:12px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase">${INSTITUCION.oficina}</div>`,

    // ── Cuerpo ────────────────────────────────────────────────────
    `<div style="padding:26px 32px 8px">`,

    // Título + ícono de estado
    `<table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse"><tr>`,
    `<td style="vertical-align:middle;padding-right:16px">`,
    `<div style="width:60px;height:60px;border-radius:50%;background:${ic.bg};border:3px solid ${ic.ring};text-align:center;line-height:54px;font-size:30px;font-weight:800;color:${ic.fg}">${ic.simbolo}</div>`,
    `</td>`,
    `<td style="vertical-align:middle">`,
    `<div style="font-size:27px;font-weight:800;color:${MAIN};line-height:1.15">${titulo}</div>`,
    `<div style="font-size:13px;color:${MUTED};margin-top:4px">Código de gestión: <strong style="color:${TEAL}">${codigo}</strong></div>`,
    `</td>`,
    `</tr></table>`,

    `<div style="width:48px;height:3px;background:${TEAL};border-radius:2px;margin:18px 0 16px"></div>`,

    // Texto institucional
    `<div style="font-size:14px">${cuerpo}</div>`,

    // Firma institucional
    `<div style="border-top:1px solid ${LINE};margin:24px 0 14px"></div>`,
    `<div style="font-size:13px;color:${MAIN};font-weight:700">${INSTITUCION.nombre}</div>`,
    `<div style="font-size:12px;font-style:italic;color:${MUTED}">${INSTITUCION.oficina}</div>`,
    `<div style="font-size:12px;color:${MUTED};margin-top:2px">${INSTITUCION.email}</div>`,

    // Aviso final
    `<div style="margin:20px 0 6px;background:#f1f9fb;border:1px solid #cfeaef;border-radius:12px;padding:16px;text-align:center">`,
    `<div style="font-size:13px;font-weight:800;letter-spacing:2px;text-transform:uppercase;color:${TEAL}">⛨ Aviso</div>`,
    `<div style="font-size:13px;font-weight:700;color:${MAIN};margin-top:4px">${INSTITUCION.aviso}</div>`,
    `</div>`,

    `</div>`, // fin cuerpo

    // ── Pie decorativo ────────────────────────────────────────────
    `<div style="height:10px;background:linear-gradient(90deg,${MAIN},${BLUE},${TEAL})"></div>`,
    `<div style="text-align:center;font-size:10px;color:#9ca3af;padding:10px">© ${INSTITUCION.nombreLargo} · ${INSTITUCION.ciudad}</div>`,

    `</div>`, // fin tarjeta
  ].join("");
}

/**
 * Copia el oficio al portapapeles: HTML enriquecido (para Gmail/Outlook)
 * y texto plano como respaldo. Devuelve true si copió algo.
 */
export async function copiarOficio(tipo: string, codigo: string, mensaje: string): Promise<boolean> {
  const html = buildOficioHTML(tipo, codigo, mensaje);
  const plano = limpiarMarcadores(mensaje);
  try {
    if (navigator.clipboard && typeof window !== "undefined" && (window as any).ClipboardItem) {
      const item = new (window as any).ClipboardItem({
        "text/html": new Blob([html], { type: "text/html" }),
        "text/plain": new Blob([plano], { type: "text/plain" }),
      });
      await navigator.clipboard.write([item]);
      return true;
    }
  } catch {
    /* fallback a texto plano */
  }
  try {
    await navigator.clipboard.writeText(plano);
    return true;
  } catch {
    return false;
  }
}
