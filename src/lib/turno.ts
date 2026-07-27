// Helpers para saludo dinámico e insignia de turno operativo.
// El TURNO DE SESIÓN (seleccionado en login) es la fuente canónica para
// mostrar el turno operativo actual. `getTurno(now)` sigue disponible como
// sugerencia/orientación horaria y para consumidores legítimos que
// necesiten conocer el turno según la hora.

export function getSaludo(d: Date = new Date()): string {
  const h = d.getHours();
  if (h < 12) return "Buenos Días";
  if (h < 19) return "Buenas Tardes";
  return "Buenas Noches";
}

export function getSaludoEmoji(d: Date = new Date()): string {
  const h = d.getHours();
  if (h < 12) return "☀️";
  if (h < 19) return "👋";
  return "🌙";
}

type Turno = { nombre: "MAÑANA" | "TARDE" | "NOCHE"; inicio: number; fin: number };

export function getTurno(d: Date = new Date()): Turno {
  const h = d.getHours();
  if (h >= 7 && h < 13) return { nombre: "MAÑANA", inicio: 7, fin: 13 };
  if (h >= 13 && h < 19) return { nombre: "TARDE", inicio: 13, fin: 19 };
  return { nombre: "NOCHE", inicio: 19, fin: 7 };
}

const pad = (n: number) => String(n).padStart(2, "0");

export function getTurnoLabel(d: Date = new Date()): string {
  const t = getTurno(d);
  const dd = pad(d.getDate());
  const mm = pad(d.getMonth() + 1);
  const fechaFin = new Date(d);
  if (t.nombre === "NOCHE" && d.getHours() >= 19) {
    fechaFin.setDate(fechaFin.getDate() + 1);
  }
  const ddF = pad(fechaFin.getDate());
  const mmF = pad(fechaFin.getMonth() + 1);
  return `${t.nombre} · ${dd}/${mm} ${pad(t.inicio)}:00 - ${ddF}/${mmF} ${pad(t.fin)}:00`;
}

export function getPrimerNombre(nombre: string): string {
  return (nombre || "").trim().split(/\s+/)[0]?.toUpperCase() || "";
}

// ================================================================
// TURNO OPERATIVO CANÓNICO DE SESIÓN
// ================================================================

export type TurnoCodigo = "MANANA" | "MANANA_TARDE" | "TARDE" | "NOCHE";

export interface TurnoDefinicion {
  codigo: TurnoCodigo;
  etiqueta: string; // única fuente para mostrar/persistir en formularios
  inicio: number; // hora local (0-23)
  fin: number; // hora local (0-23)
  cruzaMedianoche: boolean;
}

export const TURNOS_CANONICOS: Record<TurnoCodigo, TurnoDefinicion> = {
  MANANA: { codigo: "MANANA", etiqueta: "MAÑANA", inicio: 7, fin: 13, cruzaMedianoche: false },
  MANANA_TARDE: { codigo: "MANANA_TARDE", etiqueta: "MAÑANA / TARDE", inicio: 7, fin: 19, cruzaMedianoche: false },
  TARDE: { codigo: "TARDE", etiqueta: "TARDE", inicio: 13, fin: 19, cruzaMedianoche: false },
  NOCHE: { codigo: "NOCHE", etiqueta: "NOCHE", inicio: 19, fin: 7, cruzaMedianoche: true },
};

export const TURNOS_CODIGOS: TurnoCodigo[] = ["MANANA", "MANANA_TARDE", "TARDE", "NOCHE"];

export interface TurnoSesion {
  codigo: TurnoCodigo;
  fechaOperativa: string; // YYYY-MM-DD (fecha de inicio del turno)
}

export function isTurnoCodigo(x: unknown): x is TurnoCodigo {
  return typeof x === "string" && (TURNOS_CODIGOS as string[]).includes(x);
}

/** Fecha operativa de inicio del turno. Para NOCHE entre 00:00 y 06:59
 *  la fecha operativa corresponde al día anterior. */
export function calcularFechaOperativa(codigo: TurnoCodigo, d: Date = new Date()): string {
  const def = TURNOS_CANONICOS[codigo];
  const base = new Date(d);
  if (def.cruzaMedianoche && d.getHours() < def.inicio) {
    base.setDate(base.getDate() - 1);
  }
  return `${base.getFullYear()}-${pad(base.getMonth() + 1)}-${pad(base.getDate())}`;
}

/** Construye una TurnoSesion válida a partir del código elegido. */
export function construirTurnoSesion(codigo: TurnoCodigo, ahora: Date = new Date()): TurnoSesion {
  return { codigo, fechaOperativa: calcularFechaOperativa(codigo, ahora) };
}

/** Etiqueta canónica con fecha operativa e intervalo del turno de sesión. */
export function getTurnoSesionLabel(sesion: TurnoSesion): string {
  const def = TURNOS_CANONICOS[sesion.codigo];
  const [y, m, dd] = sesion.fechaOperativa.split("-").map(Number);
  const inicio = new Date(y, (m ?? 1) - 1, dd ?? 1);
  const fin = new Date(inicio);
  if (def.cruzaMedianoche) fin.setDate(fin.getDate() + 1);
  return `${def.etiqueta} · ${pad(inicio.getDate())}/${pad(inicio.getMonth() + 1)} ${pad(def.inicio)}:00 - ${pad(fin.getDate())}/${pad(fin.getMonth() + 1)} ${pad(def.fin)}:00`;
}

/** Valida y reconstruye una TurnoSesion desde un valor bruto (sessionStorage).
 *  Sólo se acepta el código; etiqueta y horarios se derivan de la constante canónica. */
export function parseTurnoSesion(raw: unknown): TurnoSesion | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (!isTurnoCodigo(r.codigo)) return null;
  const fecha = typeof r.fechaOperativa === "string" ? r.fechaOperativa : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return null;
  return { codigo: r.codigo, fechaOperativa: fecha };
}

// Hook que devuelve un valor dependiente de la hora SOLO en el cliente.
// Evita errores de hidratación: el servidor (UTC) y el cliente (zona local)
// calculan turnos distintos. Renderizamos vacío hasta montar en el navegador.
import { useEffect, useState } from "react";

export function useClientTime<T>(compute: (d: Date) => T): T | null {
  const [value, setValue] = useState<T | null>(null);
  useEffect(() => {
    setValue(compute(new Date()));
    // compute es estable en los usos actuales; no se incluye en deps a propósito.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return value;
}
