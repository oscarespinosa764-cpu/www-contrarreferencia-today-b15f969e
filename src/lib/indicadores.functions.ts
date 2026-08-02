import { createServerFn } from "@tanstack/react-start";

/**
 * Fecha de corte server-side en America/Bogota.
 * No se confía en la fecha ni en la zona horaria del navegador.
 */
export const obtenerFechaCorteIndicadores = createServerFn({ method: "GET" }).handler(
  async () => {
    const now = new Date();
    const fecha = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Bogota",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now);
    const hora = new Intl.DateTimeFormat("en-GB", {
      timeZone: "America/Bogota",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(now);
    return { fecha, hora, zona: "America/Bogota", iso: now.toISOString() };
  },
);
