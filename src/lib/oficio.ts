// ══════════════════════════════════════════════════════════════════
//  Oficio institucional — formato tipo carta/plantilla formal para las
//  respuestas del módulo de remisiones entrantes (CEDIM IPS).
//  Sin IA: solo presentación visual. El MISMO HTML se ve en pantalla
//  y se copia al correo (Gmail / Outlook) para máxima fidelidad.
//
//  FASE 9 — Renderizador puro y síncrono. Acepta un configOverride
//  opcional (esquema OficioConfig ya validado); si no se entrega,
//  reproduce byte-a-byte el HTML histórico. La versión asíncrona
//  buildOficioHTMLPublicado resuelve el código documental por
//  ALLOWLIST y consume la configuración publicada.
// ══════════════════════════════════════════════════════════════════
import { limpiarMarcadores } from "./rc-utils";
import {
  ACCENT_COLORS,
  OFICIO_DEFAULT_VARIANT,
  OFICIO_INSTITUCION_DEFAULT,
  codigoDocumentalPara,
  getOficioDefaults,
  loadOficioConfig,
  type IconKey,
  type OficioConfig,
  type OficioTipo,
} from "./oficio-config";

// Las imágenes deben tener URL ABSOLUTA para verse también cuando el oficio
// se pega en el correo (Gmail / Outlook). Se apunta al dominio publicado
// institucional (estable y con CDN público).
const ASSET_BASE = "https://www.contrarreferencia.today";
export const IMG = {
  logo: ASSET_BASE + "/__l5e/assets-v1/debb769e-6a9d-4c3b-984a-fac1313767e8/cedim-logo.png",
  cruz: ASSET_BASE + "/__l5e/assets-v1/68052705-29b9-400b-9419-d72818b6134c/cruz-referencia.png",
  mascota: ASSET_BASE + "/__l5e/assets-v1/b2238e85-eeda-4f5c-a307-7d2906a913b9/ceci-mascota.png",
};

// onerror inline: si la imagen bloquea o falla, ocultamos el <img> y quitamos
// el ícono nativo de "imagen rota". Es HTML plano, seguro para correo.
const IMG_FALLBACK = `this.onerror=null;this.style.display='none';`;

export const INSTITUCION = {
  nombre: OFICIO_INSTITUCION_DEFAULT.short_name,
  nombreLargo: OFICIO_INSTITUCION_DEFAULT.long_name,
  sede: OFICIO_INSTITUCION_DEFAULT.site_name,
  oficina: OFICIO_INSTITUCION_DEFAULT.office_name,
  email: "coordreferencia@cedimips.com",
  ciudad: OFICIO_INSTITUCION_DEFAULT.city_name,
  aviso: "Por favor, no responda a este mensaje.",
};

// Colores institucionales (HEX). Espejo de los tokens de styles.css.
const TEAL = ACCENT_COLORS.TEAL;
const BLUE = ACCENT_COLORS.BLUE;
const MAIN = ACCENT_COLORS.MAIN;
const TEXT = "#243042";
const MUTED = "#6b7280";
const LINE = "#e5e9f0";

export const OFICIO_TITULO: Record<string, string> = {
  ACEP: OFICIO_DEFAULT_VARIANT.ACEP.title,
  NEG: OFICIO_DEFAULT_VARIANT.NEG.title,
  AMP: OFICIO_DEFAULT_VARIANT.AMP.title,
  CAN: OFICIO_DEFAULT_VARIANT.CAN.title,
  ING: OFICIO_DEFAULT_VARIANT.ING.title,
  CRUE_ACEP: OFICIO_DEFAULT_VARIANT.CRUE_ACEP.title,
  CRUE_NR: OFICIO_DEFAULT_VARIANT.CRUE_NR.title,
  CRUE_NEG: OFICIO_DEFAULT_VARIANT.CRUE_NEG.title,
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

const ICON_SYMBOL: Record<IconKey, string> = {
  CHECK: "✓",
  CROSS: "✕",
  PLUS: "+",
  INFO: "i",
};

// Fondos suaves por color acentuado, para reproducir el look histórico.
function bgFor(fg: string): string {
  switch (fg) {
    case ACCENT_COLORS.TEAL:
      return "#e7f6f6";
    case ACCENT_COLORS.RED:
      return "#fdeaea";
    case ACCENT_COLORS.ORANGE:
      return "#fdf2e3";
    case ACCENT_COLORS.BLUE:
      return "#e8f1fb";
    default:
      return "#eef2f7";
  }
}

function iconoCfgFromVariant(iconKey: IconKey, accentHex: string): IconoCfg {
  return {
    simbolo: ICON_SYMBOL[iconKey] ?? "i",
    fg: accentHex,
    ring: accentHex,
    bg: bgFor(accentHex),
  };
}

/**
 * Escapa TODO valor dinámico antes de interpolarlo en HTML (texto y atributos).
 */
export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Formato en línea: escapa HTML y aplica *negrita* y ==resaltado==.
function inlineFmt(texto: string): string {
  let html = escapeHtml(texto);
  html = html.replace(/==([^=\n]+)==/g, '<mark style="background-color:#fef3c7;color:#000;padding:0 2px">$1</mark>');
  html = html.replace(/\*([^*\n]+)\*/g, `<strong style="color:${MAIN}">$1</strong>`);
  return html;
}

/** Convierte el cuerpo (texto con marcadores) en HTML institucional. */
function formatearCuerpoHTML(texto: string, opts: { paragraphSpacing: number; textAlignment: string }): string {
  const lines = String(texto || "").split("\n");
  let html = "";
  let inList = false;
  const closeList = () => {
    if (inList) {
      html += "</ul>";
      inList = false;
    }
  };
  const align = opts.textAlignment;
  const mp = opts.paragraphSpacing;
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
        html += `<p style="margin:${mp}px 0;color:${TEXT};text-align:${align}">${inlineFmt(trimmed)}</p>`;
      }
    }
  }
  closeList();
  return html;
}

/**
 * HTML del oficio institucional, con estilos en línea, apto para correo.
 * Función pura y síncrona. Si no se entrega configOverride reproduce el HTML
 * histórico. El mensaje real, el código y el tipo son componentes protegidos
 * y NUNCA se sobrescriben desde la configuración.
 */
export function buildOficioHTML(
  tipo: string,
  codigo: string,
  mensaje: string,
  configOverride?: OficioConfig,
): string {
  const cfg =
    configOverride ??
    getOficioDefaults((tipo as OficioTipo) in OFICIO_DEFAULT_VARIANT ? (tipo as OficioTipo) : "ACEP");

  const titulo = escapeHtml(cfg.variant.title || tituloOficio(tipo));
  const codigoSeguro = escapeHtml(codigo);
  const accentHex = ACCENT_COLORS[cfg.variant.accent_color] ?? MAIN;
  const ic = iconoCfgFromVariant(cfg.variant.icon_key, accentHex);
  const cuerpo = formatearCuerpoHTML(mensaje, {
    paragraphSpacing: cfg.body.paragraph_spacing,
    textAlignment: cfg.body.text_alignment,
  });

  const inst = cfg.institution;
  const showLogo = cfg.header.show_logo;
  const showMascot = cfg.header.show_mascot;
  const showInstText = cfg.header.institution_text_visible;
  const showOfficeStrip = cfg.header.office_strip_visible;
  const headerAlign = cfg.header.alignment;
  const bodyFont = cfg.body.base_font_size;
  const bodyLh = cfg.body.line_height;
  const accentBar = cfg.body.accent_visible;

  // Encabezado dinámico
  const logoCell = showLogo
    ? `<td style="vertical-align:middle;width:96px;padding-right:14px"><img src="${IMG.logo}" alt="${escapeHtml(inst.short_name)}" width="92" style="display:block;width:92px;height:auto;border:0" onerror="${IMG_FALLBACK}" /></td>`
    : "";
  const mascotCell = showMascot
    ? `<td style="vertical-align:middle;width:84px;text-align:right;padding-left:10px"><img src="${IMG.mascota}" alt="" width="66" style="display:block;width:66px;height:auto;border:0;margin-left:auto" onerror="${IMG_FALLBACK}" /></td>`
    : "";
  const instBlock = showInstText
    ? `<td style="vertical-align:middle;text-align:${headerAlign}">` +
      `<div style="font-size:12px;font-weight:700;letter-spacing:2px;color:${TEAL};text-transform:uppercase">${escapeHtml(inst.short_name)}</div>` +
      `<div style="font-size:19px;font-weight:800;color:${MAIN};margin-top:2px;line-height:1.2">${escapeHtml(inst.long_name)}</div>` +
      (inst.site_name
        ? `<div style="font-size:12px;font-style:italic;color:${BLUE};margin-top:3px">${escapeHtml(inst.site_name)}</div>`
        : "") +
      `</td>`
    : `<td></td>`;

  return [
    `<div style="max-width:680px;margin:0 auto;background:#ffffff;border:1px solid ${LINE};border-radius:16px;overflow:hidden;font-family:'Segoe UI',Arial,sans-serif;color:${TEXT};line-height:${bodyLh}">`,

    // Encabezado
    `<div style="padding:22px 28px 16px;border-bottom:3px solid ${TEAL};background:linear-gradient(180deg,#eef9fb,#ffffff)">`,
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse"><tr>`,
    logoCell,
    instBlock,
    mascotCell,
    `</tr></table>`,
    `</div>`,

    // Franja oficina
    showOfficeStrip && inst.office_name
      ? `<div style="background:${MAIN};color:#ffffff;padding:9px 32px;font-size:12px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;text-align:center">${escapeHtml(inst.office_name)}</div>`
      : "",

    // Cuerpo
    `<div style="padding:26px 32px 8px">`,

    // Título + ícono
    `<table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse"><tr>`,
    `<td style="vertical-align:middle;padding-right:16px">`,
    `<div style="width:60px;height:60px;border-radius:50%;background:${ic.bg};border:3px solid ${ic.ring};text-align:center;line-height:54px;font-size:30px;font-weight:800;color:${ic.fg}">${ic.simbolo}</div>`,
    `</td>`,
    `<td style="vertical-align:middle">`,
    `<div style="font-size:27px;font-weight:800;color:${MAIN};line-height:1.15">${titulo}</div>`,
    `<div style="font-size:13px;color:${MUTED};margin-top:4px">Código de gestión: <strong style="color:${TEAL}">${codigoSeguro}</strong></div>`,
    `</td>`,
    `</tr></table>`,

    accentBar ? `<div style="width:48px;height:3px;background:${TEAL};border-radius:2px;margin:18px 0 16px"></div>` : `<div style="height:10px"></div>`,

    // Cuerpo del mensaje (dato protegido)
    `<div style="font-size:${bodyFont}px">${cuerpo}</div>`,

    // Aviso
    cfg.notice.visible
      ? `<div style="height:2px;background:${MAIN};border-radius:2px;margin:24px 0 16px"></div>` +
        `<div style="margin:6px 0;background:#f1f9fb;border:1px solid #cfeaef;border-radius:12px;padding:16px;text-align:center">` +
        `<div style="font-size:13px;font-weight:800;letter-spacing:2px;text-transform:uppercase;color:${TEAL}">${escapeHtml(cfg.notice.label)}</div>` +
        `<div style="font-size:13px;font-weight:700;color:${MAIN};margin-top:4px">${escapeHtml(cfg.notice.text)}</div>` +
        `</div>`
      : "",

    `</div>`,

    // Pie
    `<div style="height:10px;background:linear-gradient(90deg,${MAIN},${BLUE},${TEAL})"></div>`,
    cfg.footer.visible
      ? `<div style="text-align:${cfg.footer.alignment};font-size:10px;color:#9ca3af;padding:10px">` +
        (cfg.footer.show_year ? `© ${new Date().getFullYear()} ` : "© ") +
        `${escapeHtml(cfg.footer.copyright_text)}` +
        (cfg.footer.show_city && inst.city_name ? ` · ${escapeHtml(inst.city_name)}` : "") +
        `</div>`
      : "",

    `</div>`,
  ].join("");
}

/**
 * Wrapper asíncrono: resuelve el código documental mediante allowlist,
 * consume la configuración PUBLICADA y renderiza. Ante error usa defaults.
 */
export async function buildOficioHTMLPublicado(
  tipo: string,
  codigo: string,
  mensaje: string,
): Promise<string> {
  const codigoDoc = codigoDocumentalPara(tipo);
  if (!codigoDoc) {
    // Tipo no autorizado: comportamiento seguro con defaults (sin BD).
    return buildOficioHTML(tipo, codigo, mensaje);
  }
  try {
    const { config } = await loadOficioConfig(tipo as OficioTipo);
    return buildOficioHTML(tipo, codigo, mensaje, config);
  } catch {
    return buildOficioHTML(tipo, codigo, mensaje);
  }
}

/**
 * Copia el oficio (versión PUBLICADA) al portapapeles. HTML + texto plano.
 */
export async function copiarOficio(tipo: string, codigo: string, mensaje: string): Promise<boolean> {
  const html = await buildOficioHTMLPublicado(tipo, codigo, mensaje);
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
