// Utilidades cliente/servidor para notificaciones externas.
// No contiene lógica de red ni tokens.

export const CANALES = [
  { type: "telegram", label: "Telegram", activo: true },
  { type: "slack", label: "Slack", activo: true },
  { type: "whatsapp", label: "WhatsApp", activo: false },
  { type: "email", label: "Correo electrónico", activo: false },
] as const;

export type CanalTipo = (typeof CANALES)[number]["type"];

export const MENSAJES_CANAL_INACTIVO: Record<string, string> = {
  whatsapp: "WhatsApp requiere proveedor externo o API oficial. No está activo para evitar costos.",
  email: "Correo queda preparado para futura integración SMTP/proveedor. No activo en esta versión.",
};

// Catálogo de tipos de alerta configurables.
export const TIPOS_ALERTA: { value: string; label: string }[] = [
  { value: "VENCIMIENTO_INGRESO", label: "Vencimiento de ingreso" },
  { value: "CASO_PRIORITARIO_SIN_SEGUIMIENTO", label: "Caso prioritario sin seguimiento" },
  { value: "PENDIENTE_NOTIFICACION", label: "Pendiente de notificación" },
  { value: "ALERTA_COORDINACION", label: "Alerta de coordinación" },
  { value: "NOVEDAD_REMISION", label: "Novedad de remisión" },
  { value: "PENDIENTE_EGRESO_REMISION", label: "Pendiente egreso remisión" },
  { value: "SOLICITUD_CAMBIO_TURNO", label: "Solicitud de cambio de turno" },
  { value: "SOLICITUD_APROBADA", label: "Solicitud aprobada" },
  { value: "SOLICITUD_NEGADA", label: "Solicitud negada" },
  { value: "AUSENTISMO_REGISTRADO", label: "Ausentismo registrado" },
  { value: "ERROR_OPERATIVO_CRITICO", label: "Error operativo crítico" },
  { value: "AVISO_MANUAL", label: "Aviso manual" },
];

export function labelAlerta(value: string): string {
  return TIPOS_ALERTA.find((t) => t.value === value)?.label ?? value;
}

export const PLANTILLA_TELEGRAM_DEFAULT =
  "🔔 CEDIM IPS\nTipo: {{tipo_alerta}}\nMódulo: {{modulo}}\nEstado: {{estado}}\nAcción: {{accion}}\nFecha/hora: {{fecha_hora}}";

export const PLANTILLA_SLACK_DEFAULT =
  "*🔔 CEDIM IPS*\n*Tipo:* {{tipo_alerta}}\n*Módulo:* {{modulo}}\n*Estado:* {{estado}}\n*Acción:* {{accion}}\n*Fecha/hora:* {{fecha_hora}}";

/** Plantilla por defecto según el canal. */
export function plantillaPorCanal(channelType: string): string {
  return channelType === "slack" ? PLANTILLA_SLACK_DEFAULT : PLANTILLA_TELEGRAM_DEFAULT;
}

/** Enmascara un documento dejando solo los últimos 4 dígitos: 1117545825 → ****5825 */
export function maskDocumento(doc?: string | null): string {
  if (!doc) return "";
  const clean = String(doc).replace(/\s/g, "");
  if (clean.length <= 4) return "****";
  return "****" + clean.slice(-4);
}

/** Convierte un nombre a iniciales: OSCAR JAVIER ESPINOSA OLARTE → OSCAR J. E. O. */
export function maskNombre(nombre?: string | null): string {
  if (!nombre) return "";
  const parts = String(nombre).trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  const [first, ...rest] = parts;
  const initials = rest.map((p) => p.charAt(0).toUpperCase() + ".").join(" ");
  return initials ? `${first} ${initials}` : first;
}

export interface PlantillaVars {
  tipo_alerta?: string;
  modulo?: string;
  paciente_iniciales?: string;
  documento_enmascarado?: string;
  codigo?: string;
  estado?: string;
  accion?: string;
  fecha_hora?: string;
  usuario?: string;
  funcionario?: string;
}

// Solo se permiten estos placeholders (nada de datos clínicos completos).
const PLACEHOLDERS_PERMITIDOS = [
  "tipo_alerta", "modulo", "paciente_iniciales", "documento_enmascarado",
  "codigo", "estado", "accion", "fecha_hora", "usuario", "funcionario",
];

export function renderPlantilla(template: string, vars: PlantillaVars): string {
  let out = template || PLANTILLA_TELEGRAM_DEFAULT;
  for (const key of PLACEHOLDERS_PERMITIDOS) {
    const val = (vars as Record<string, string | undefined>)[key] ?? "";
    out = out.replaceAll(`{{${key}}}`, val);
  }
  // Elimina cualquier placeholder no permitido que quede.
  out = out.replace(/\{\{[^}]+\}\}/g, "");
  // Limpia líneas vacías generadas por variables ausentes.
  return out.split("\n").map((l) => l.trimEnd()).filter((l, i, arr) => !(l === "" && arr[i - 1] === "")).join("\n").trim();
}
