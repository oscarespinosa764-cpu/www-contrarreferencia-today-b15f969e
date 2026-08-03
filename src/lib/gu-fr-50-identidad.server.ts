// GU-FR-50 · Identidad canónica y fingerprint (SERVER-ONLY).
// Fuente única compartida por previsualización, confirmación y round-trip.
// No se expone al navegador ni se agrega como columna al Excel.

import { createHash } from "crypto";
import type { FilaGuFr50, ModuloGuFr50 } from "./gu-fr-50";

/** Normalización SOLO para comparación (no altera el valor persistido). */
export function norm(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

/** Documento comparable: sólo dígitos/letras, sin puntos ni separadores. */
export function normDoc(v: unknown): string {
  return norm(v).replace(/[^A-Z0-9]/g, "");
}

/** Instante canónico en ISO UTC; null cuando no es una fecha real. */
export function instante(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** ¿La fecha del archivo perdió precisión (segundos en cero)? */
export function esPrecisionMinuto(isoStr: string | null): boolean {
  if (!isoStr) return true;
  return isoStr.slice(17, 19) === "00" && isoStr.slice(20, 23) === "000";
}

/** Campo fecha canónico por módulo dentro del DTO GU-FR-50. */
export const CAMPO_FECHA: Record<ModuloGuFr50, string> = {
  ENTRANTES: "fecha_envio",
  SALIENTES: "fecha_solicitud",
  "ATENCION DOMICILIARIA": "fecha_solicitud",
  "REFERENCIAS INTERNAS": "fecha_solicitud",
};

type Fila = Partial<Record<string, unknown>> | FilaGuFr50;

const g = (f: Fila, k: string): unknown => (f as Record<string, unknown>)[k];

/**
 * Discriminadores funcionales por módulo (sin nombre del paciente).
 * El módulo y el subtipo SIEMPRE forman parte de la identidad.
 */
function discriminadores(modulo: ModuloGuFr50, f: Fila): string[] {
  if (modulo === "ENTRANTES") {
    return [norm(g(f, "ips_remite")), norm(g(f, "especialidad")), norm(g(f, "codigo_crue"))];
  }
  if (modulo === "SALIENTES") {
    return [
      norm(g(f, "servicio_remite")),
      norm(g(f, "motivo_remision")),
      norm(g(f, "especialidad_remitente")),
    ];
  }
  if (modulo === "ATENCION DOMICILIARIA") {
    // Subtipo real: PHD / PAD / O2 / ESPECIAL. Nunca se pierde.
    return [norm(g(f, "tipo_solicitud")), norm(g(f, "servicio_remite"))];
  }
  return [norm(g(f, "vx_examen")), norm(g(f, "especialidad_solicitante"))];
}

const hash = (partes: string[]) =>
  createHash("sha256").update(partes.join("\u001f"), "utf8").digest("hex");

export interface Identidad {
  /** Identidad completa (máxima precisión disponible). */
  exacta: string;
  /** Identidad con la fecha truncada al minuto (para detectar ambigüedad). */
  minuto: string;
  /** Identificador funcional estable (código externo) cuando existe. */
  estable: string | null;
  /** La fecha del archivo sólo tiene precisión de minuto. */
  precisionMinuto: boolean;
  /** La fila carece de datos mínimos para identificarse. */
  incompleta: boolean;
}

/**
 * Identidad canónica tipada por módulo. Serialización determinística
 * (arreglo ordenado por posición, separador de unidad) + SHA-256.
 */
export function identidad(modulo: ModuloGuFr50, f: Fila): Identidad {
  const doc = normDoc(g(f, "documento"));
  const ts = instante(g(f, CAMPO_FECHA[modulo]));
  const disc = discriminadores(modulo, f);
  const estableRaw =
    modulo === "ENTRANTES" ? norm(g(f, "codigo_aceptacion")) : "";
  const estable = estableRaw.length >= 4 ? estableRaw : null;

  const base = ["GU-FR-50", "02", modulo, ...disc, doc];
  const exacta = estable
    ? hash(["GU-FR-50", "02", modulo, "CODIGO", estable])
    : hash([...base, ts ?? ""]);
  const minuto = estable
    ? exacta
    : hash([...base, "MIN", ts ? ts.slice(0, 16) : ""]);

  return {
    exacta,
    minuto,
    estable,
    precisionMinuto: esPrecisionMinuto(ts),
    incompleta: !doc || (!ts && !estable),
  };
}

export type Clasificacion =
  | "NUEVO"
  | "DUPLICADO_EXACTO"
  | "DUPLICADO_AMBIGUO"
  | "CONFLICTO_IDENTIDAD";

/**
 * Clasifica una fila contra los índices canónicos de la base de datos.
 * Nunca elige "el primer resultado": ante varias coincidencias → AMBIGUO.
 */
export function clasificar(
  id: Identidad,
  indiceExacto: Map<string, number>,
  indiceMinuto: Map<string, number>,
): Clasificacion {
  if (id.incompleta) return "CONFLICTO_IDENTIDAD";
  const exactos = indiceExacto.get(id.exacta) ?? 0;
  if (exactos === 1) return "DUPLICADO_EXACTO";
  if (exactos > 1) return "DUPLICADO_AMBIGUO";
  const porMinuto = indiceMinuto.get(id.minuto) ?? 0;
  if (porMinuto === 0) return "NUEVO";
  if (porMinuto === 1) return id.precisionMinuto ? "DUPLICADO_EXACTO" : "NUEVO";
  return "DUPLICADO_AMBIGUO";
}
