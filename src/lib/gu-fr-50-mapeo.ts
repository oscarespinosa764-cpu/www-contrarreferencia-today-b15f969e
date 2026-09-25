// Reglas puras de la exportación GU-FR-50 (sin acceso a base de datos).
// Decisiones aprobadas por el área el 25/09/2026.

import {
  ACEPTACION_TIPO,
  NOVEDADES_TIPO,
  NOVEDADES_IPS_CANCELA_ACEPTACION,
} from "./salientes-aceptacion";

const norm = (v: unknown) =>
  String(v ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();

// ---------------------------------------------------------------- Salientes

export type EstadoGeneral = "REMITIDO" | "SUSPENDIDO" | "EN GESTIÓN" | "POR DEFINIR";

const REMITIDO = new Set(["CERRADO POR TRASLADO EFECTIVO", "CERRADO POR REMISION EXITOSA"]);
const EN_GESTION = new Set([
  "PENDIENTE ACEPTACION",
  "ACEPTADO SIN PROGRAMACION DE AMBULANCIA",
  "ACEPTADO CON AMBULANCIA COORDINADA",
  "PENDIENTE EGRESO REMISION",
]);

/** Tabla 3.2. Un estado desconocido o con DESISTIMIENTO → POR DEFINIR. */
export function estadoGeneralSaliente(estado: unknown): EstadoGeneral | "" {
  const e = norm(estado);
  if (!e) return "";
  if (e.includes("DESISTIMIENTO")) return "POR DEFINIR";
  if (REMITIDO.has(e)) return "REMITIDO";
  if (e.startsWith("CERRADO POR CANCELACION - ")) return "SUSPENDIDO";
  if (EN_GESTION.has(e)) return "EN GESTIÓN";
  return "POR DEFINIR";
}

/** 3.3 AD: TRÁMITE ADMINISTRATIVO solo si el motivo es RED NO CONTRATADA. */
export function tipoReferencia(motivoRemision: unknown): string {
  const m = norm(motivoRemision).replace(/_/g, " ");
  if (!m) return "";
  return m === "RED NO CONTRATADA" ? "TRÁMITE ADMINISTRATIVO" : "CLÍNICA";
}

export type SegRow = {
  id: string;
  caso_id: string;
  tipo_seguimiento: string | null;
  detalles: Record<string, unknown> | null;
  created_at: string;
  archivado?: boolean | null;
};

const s = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/**
 * Misma regla que el resolver canónico `resolverAceptacionVigente`, aplicada
 * sobre filas ya leídas (orden cronológico ascendente).
 */
export function aceptacionVigenteDesdeFilas(rows: SegRow[]) {
  let activa: { fecha: string; ips: string; sede: string; servicio: string } | null = null;
  for (const r of rows) {
    const tipo = r.tipo_seguimiento ?? "";
    const det = (r.detalles ?? {}) as Record<string, unknown>;
    if (tipo === ACEPTACION_TIPO) {
      activa = {
        fecha: r.created_at,
        ips: s(det.ips_receptora),
        sede: s(det.sede),
        servicio: s(det.servicio_receptor),
      };
    } else if (tipo === NOVEDADES_TIPO) {
      const cod = s(det.novedad_ips);
      if (cod && NOVEDADES_IPS_CANCELA_ACEPTACION.has(cod)) activa = null;
    }
  }
  return activa;
}

/** "DD/MM/AAAA" + "HH:MM" (hora Bogotá) → ISO UTC. Sin hora → null. */
export function fechaHoraDmyIso(fecha: unknown, hora: unknown): string | null {
  const f = s(fecha).match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  const h = s(hora).match(/^(\d{1,2}):(\d{2})$/);
  if (!f || !h) return null;
  const d = new Date(`${f[3]}-${f[2]}-${f[1]}T${h[1].padStart(2, "0")}:${h[2]}:00-05:00`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** "YYYY-MM-DDTHH:MM" (datetime-local, hora Bogotá) → ISO UTC. */
export function fechaLocalIso(v: unknown): string | null {
  const m = s(v).match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/);
  if (!m) return null;
  const d = new Date(`${m[1]}T${m[2]}:00-05:00`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Última gestión AMBULANCIA COORDINADA de la remisión (fecha coordinada, solicitud, empresa). */
export function ambulanciaCoordinadaDesdeFilas(rows: SegRow[]) {
  let ult: SegRow | null = null;
  for (const r of rows) if (r.tipo_seguimiento === "AMBULANCIA COORDINADA") ult = r;
  if (!ult) return null;
  const det = (ult.detalles ?? {}) as Record<string, unknown>;
  return {
    traslado: fechaHoraDmyIso(det.fecha, det.hora),
    solicitud: fechaLocalIso(det.fecha_solicitud_ambulancia),
    empresa: s(det.empresa),
  };
}

// ---------------------------------------------------------------- Entrantes

/** Tabla cerrada 3.4. Un código no listado se devuelve tal cual. */
export const MOTIVOS_ENTRANTES: Record<string, string> = {
  RED_NO_CONTRATADA: "RED NO CONTRATADA",
  NO_RECURSO_HUMANO: "NO RECURSO HUMANO",
  NO_DISPONIBILIDAD_UNIDAD: "NO DISPONIBILIDAD DE UNIDAD",
  SOLICITUD_DOCUMENTACION: "SOLICITUD DE DOCUMENTACIÓN",
  NIVEL_COMPLEJIDAD: "POR NIVEL DE COMPLEJIDAD",
  SOBREOCUPACION: "NO DISPONIBILIDAD DE CAMAS POR SOBREOCUPACIÓN",
  ARL_DIRECTO: "ARL COMENTE CASO DIRECTAMENTE",
};

const MOTIVO_POR_CLAVE = new Map<string, string>();
for (const [cod, label] of Object.entries(MOTIVOS_ENTRANTES)) {
  MOTIVO_POR_CLAVE.set(cod, label);
  MOTIVO_POR_CLAVE.set(norm(label), label);
  MOTIVO_POR_CLAVE.set(norm(cod.replace(/_/g, " ")), label);
}

export function motivoEntranteLegible(v: unknown): string {
  const raw = s(v);
  if (!raw) return "";
  return MOTIVO_POR_CLAVE.get(raw) ?? MOTIVO_POR_CLAVE.get(norm(raw)) ?? raw;
}

/** Código CRUE real: vacío para N/A, NO APLICA, guiones o texto vacío. */
export function codigoCrueReal(v: unknown): string {
  const raw = s(v);
  const k = norm(raw).replace(/[.\s/]/g, "");
  if (!raw || ["NA", "NOAPLICA", "-", "—", "NULL"].includes(k)) return "";
  return raw;
}

// ---------------------------------------------------- Atención Domiciliaria

/** "N390 - Infección…" → { codigo: "N390", descripcion: "Infección…" }. */
export function separarCie10(v: unknown): { codigo: string; descripcion: string } {
  const raw = s(v);
  const m = raw.match(/^([A-Z][0-9][0-9A-Z]{1,3}(?:\.[0-9A-Z]+)?)\s*[-–—:]\s*(.+)$/i);
  if (m) return { codigo: m[1].toUpperCase(), descripcion: m[2].trim() };
  return { codigo: raw.toUpperCase(), descripcion: "" };
}

/** El valor guardado es texto "SI"/"NO": solo "SI" (o true) cuenta como sí. */
export function requiereAmbulanciaSiNo(v: unknown): "SI" | "NO" {
  if (v === true) return "SI";
  const k = norm(v);
  return k === "SI" || k === "S" || k === "TRUE" ? "SI" : "NO";
}

// ---------------------------------------------------- Referencias Internas

export const CIUDAD_RI = "FLORENCIA - CAQUETÁ";

/** Examen programado (fecha/hora + sede) y ambulancia programada de un caso RI. */
export function datosRiDesdeFilas(rows: SegRow[]) {
  let valoracion: string | null = null;
  let sede = "";
  let ambSolicitud: string | null = null;
  let ambEmpresa = "";
  for (const r of rows) {
    const det = (r.detalles ?? {}) as Record<string, unknown>;
    const tipo = r.tipo_seguimiento ?? "";
    if (tipo === "EXAMEN COORDINADO" || tipo === "PENDIENTE COORDINACIÓN FECHA Y HORA EXAMEN") {
      const f = fechaHoraDmyIso(det.fecha, det.hora);
      if (f) valoracion = f;
      const sd = s(det.sede_ips_nombre) || s(det.ips_externa_nombre);
      if (sd) sede = sd;
    } else if (tipo === "CONFIRMACIÓN DE PROGRAMACIÓN DE AMBULANCIA") {
      const f = fechaHoraDmyIso(det.fecha_recogida, det.hora_recogida);
      if (f) ambSolicitud = f;
      const e = s(det.empresa_ambulancia_nombre);
      if (e) ambEmpresa = e;
    }
  }
  return { valoracion, sede, ambSolicitud, ambEmpresa };
}
