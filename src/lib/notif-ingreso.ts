// ---------------------------------------------------------------------------
// Posibles notificaciones de ingreso (ventana de 24 h) + alertas de coordinación
// Se calcula en memoria a partir de casos_entrantes (sin tablas nuevas).
//
// Reglas:
//  - Cupo ACEPTADO y luego CANCELADO → "Posible ingreso tardío" durante 24 h
//    desde la cancelación.
//  - Caso NEGADO → "Posible ingreso sin proceso de referencia" durante 24 h
//    desde la negación.
//  - Si el cupo ya tiene un evento de ingreso (ING), sale del panel (ya pasó a
//    historial). Si vencen las 24 h, también sale del panel.
// ---------------------------------------------------------------------------
import type { Caso } from "@/lib/rc-utils";

export type CategoriaIngreso = "tardio" | "sin_referencia";

export const VENTANA_MS = 24 * 60 * 60 * 1000;

/** Códigos estables de alerta (matriz de alertas de coordinación). */
export const ALERTA_INGRESO = {
  tardio: {
    codigo: "ALT-ENT-INGRESO-TARDIO-POST-CANCELACION",
    prioridad: "ALTO",
    titulo: "Ingreso tardío posterior a cancelación",
  },
  sin_referencia: {
    codigo: "ALT-ENT-INGRESO-SIN-REFERENCIA",
    prioridad: "ALTO",
    titulo: "Ingreso sin proceso de referencia",
  },
} as const;

export const CATEGORIA_LABEL: Record<CategoriaIngreso, string> = {
  tardio: "Posible ingreso tardío",
  sin_referencia: "Posible ingreso sin proceso de referencia",
};

/** Marca que se antepone en el detalle del evento ING para trazabilidad. */
export const CATEGORIA_MARCA: Record<CategoriaIngreso, string> = {
  tardio: "INGRESO TARDÍO POST-CANCELACIÓN",
  sin_referencia: "INGRESO SIN PROCESO DE REFERENCIA",
};

export interface NotifIngreso {
  /** Clave estable = código del cupo/negación (cod_ref del futuro ING). */
  key: string;
  /** Caso base sobre el que se confirmará el ingreso. */
  caso: Caso;
  categoria: CategoriaIngreso;
  /** Fecha del evento que abre la ventana (cancelación o negación). */
  eventoFecha: Date;
  /** Momento en que la ventana de 24 h expira. */
  expira: Date;
  /** Minutos restantes de la ventana (puede ser 0). */
  minRestantes: number;
}

function parseDate(v: string | null | undefined): Date | null {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Calcula las posibles notificaciones de ingreso vigentes (ventana de 24 h).
 * No modifica nada; solo deriva la lista desde los casos ya cargados.
 */
export function calcularNotifIngreso(casos: Caso[], ahoraMs: number = Date.now()): NotifIngreso[] {
  // Cupos que ya registraron ingreso (por cod_ref) → excluidos del panel.
  const yaIngresado = new Set<string>();
  for (const c of casos) {
    if (c.tipo === "ING" && c.cod_ref) yaIngresado.add(c.cod_ref);
  }

  // Última cancelación por cupo (para fechar la ventana del "ingreso tardío").
  const ultimaCan: Record<string, Date> = {};
  for (const c of casos) {
    if (c.tipo !== "CAN" || !c.cod_ref) continue;
    const d = parseDate(c.created_at) ?? parseDate(c.fecha);
    if (!d) continue;
    if (!ultimaCan[c.cod_ref] || d > ultimaCan[c.cod_ref]) ultimaCan[c.cod_ref] = d;
  }

  const out: NotifIngreso[] = [];

  for (const c of casos) {
    if (!c.codigo || yaIngresado.has(c.codigo)) continue;

    let categoria: CategoriaIngreso | null = null;
    let eventoFecha: Date | null = null;

    // 1) Aceptado y cancelado (cancelación ordinaria, no vencimiento).
    if ((c.tipo === "ACEP" || c.tipo === "CRUE_ACEP") && c.estado === "CANCELADO") {
      categoria = "tardio";
      eventoFecha = ultimaCan[c.codigo] ?? parseDate(c.created_at);
    }
    // 2) Negado (contrarreferencia negada / CRUE no aceptación).
    else if (c.tipo === "NEG" || c.tipo === "CRUE_NEG") {
      categoria = "sin_referencia";
      eventoFecha = parseDate(c.created_at) ?? parseDate(c.fecha);
    }

    if (!categoria || !eventoFecha) continue;

    const expiraMs = eventoFecha.getTime() + VENTANA_MS;
    if (expiraMs <= ahoraMs) continue; // ventana vencida → fuera del panel

    out.push({
      key: c.codigo,
      caso: c,
      categoria,
      eventoFecha,
      expira: new Date(expiraMs),
      minRestantes: Math.max(0, Math.floor((expiraMs - ahoraMs) / 60000)),
    });
  }

  // Los más próximos a vencer primero.
  out.sort((a, b) => a.minRestantes - b.minRestantes);
  return out;
}

/** Construye el texto de la alerta de coordinación (sin datos sensibles innecesarios). */
export function construirAlertaIngreso(categoria: CategoriaIngreso, caso: Caso): {
  mensaje: string;
  prioridad: string;
  modulo: string;
} {
  const def = ALERTA_INGRESO[categoria];
  const doc = caso.documento ? `Doc. ${caso.documento}` : "sin documento";
  return {
    mensaje: `[${def.codigo}] ${def.titulo} · Cupo ${caso.codigo} · ${doc}`,
    prioridad: def.prioridad,
    modulo: "REMISIONES",
  };
}
