// Helpers para saludo dinámico e insignia de turno (MAÑANA / TARDE / NOCHE).

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
  // Para NOCHE el fin cae al día siguiente.
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
