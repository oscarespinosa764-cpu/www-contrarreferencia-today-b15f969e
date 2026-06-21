// ══════════════════════════════════════════════════════════════════
//  Oficio institucional — formato tipo carta para respuestas del
//  módulo de remisiones entrantes (CEDIM IPS). Sin IA: solo formato.
// ══════════════════════════════════════════════════════════════════
import { formatearMensajeHTML, limpiarMarcadores } from "./rc-utils";

export const INSTITUCION = {
  nombre: "CEDIM IPS",
  nombreLargo: "Centro de Imágenes Diagnósticas CEDIM IPS",
  sede: "Sede Clínica Gloria Patricia Pinzón",
  oficina: "Oficina de Referencia y Contrarreferencia",
  email: "coordreferencia@cedimips.com",
  ciudad: "Florencia · Caquetá, Colombia",
  aviso: "Por favor, no responda a este mensaje.",
};

// Colores institucionales (espejo de los tokens de styles.css, en HEX
// para poder incrustarlos en el correo con estilos en línea).
const TEAL = "#45C7C7";
const BLUE = "#00A4E4";
const MAIN = "#003B73";

export const OFICIO_TITULO: Record<string, string> = {
  ACEP: "Caso aceptado",
  NEG: "Negación de remisión",
  AMP: "Ampliación registrada",
  CAN: "Cancelación registrada",
  ING: "Confirmación de ingreso del paciente",
  CRUE_ACEP: "Aceptación de direccionamiento CRUE",
  CRUE_NR: "No requerimiento de direccionamiento",
  CRUE_NEG: "Negación al direccionamiento CRUE",
};

export function tituloOficio(tipo: string): string {
  return OFICIO_TITULO[tipo] || "Notificación";
}

/** HTML del oficio con estilos en línea, apto para pegar en el correo. */
export function buildOficioHTML(titulo: string, codigo: string, mensaje: string): string {
  const cuerpo = formatearMensajeHTML(mensaje);
  return [
    `<div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #e5e9f0;border-top:4px solid ${TEAL};border-radius:6px;padding:32px 36px;font-family:'Segoe UI',Arial,sans-serif;color:#1f2937;line-height:1.6">`,
    `<div style="font-size:20px;font-weight:700;color:${MAIN}">${INSTITUCION.nombreLargo}</div>`,
    `<div style="font-size:12px;font-style:italic;color:${BLUE};margin-top:2px">${INSTITUCION.sede}</div>`,
    `<div style="width:42px;height:3px;background:${TEAL};margin:16px 0"></div>`,
    `<div style="font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:${TEAL}">${INSTITUCION.oficina}</div>`,
    `<h1 style="font-size:23px;font-weight:700;color:${MAIN};margin:6px 0 2px">${titulo}</h1>`,
    `<div style="font-size:12px;color:#6b7280;margin-bottom:20px">Código de gestión: <strong style="color:${MAIN}">${codigo}</strong></div>`,
    `<div style="font-size:14px;color:#1f2937;white-space:pre-wrap">${cuerpo}</div>`,
    `<div style="border-top:1px solid #e5e9f0;margin:28px 0 16px"></div>`,
    `<div style="font-size:12px;color:${MAIN};font-weight:700">${INSTITUCION.nombre}</div>`,
    `<div style="font-size:12px;font-style:italic;color:#6b7280">${INSTITUCION.oficina}</div>`,
    `<div style="font-size:12px;color:#6b7280;margin-top:2px">${INSTITUCION.email}</div>`,
    `<div style="border-top:1px dashed ${TEAL};margin:18px 0 10px"></div>`,
    `<div style="font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:${TEAL}">Aviso</div>`,
    `<div style="font-size:12px;color:#6b7280">${INSTITUCION.aviso}</div>`,
    `<div style="text-align:center;font-size:10px;color:#9ca3af;margin-top:22px">© ${INSTITUCION.nombreLargo} · ${INSTITUCION.ciudad}</div>`,
    `</div>`,
  ].join("");
}

/**
 * Copia el oficio al portapapeles: HTML enriquecido (para Gmail/Outlook)
 * y texto plano como respaldo. Devuelve true si copió algo.
 */
export async function copiarOficio(titulo: string, codigo: string, mensaje: string): Promise<boolean> {
  const html = buildOficioHTML(titulo, codigo, mensaje);
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
