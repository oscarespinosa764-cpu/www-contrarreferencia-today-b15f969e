import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  limitesPeriodoActual,
  normalizarFilasParciales,
  type FilaParcialRpc,
} from "./indicadores-parcial.server";

/**
 * Fecha de corte server-side en America/Bogota.
 * No se confía en la fecha ni en la zona horaria del navegador.
 */
export const obtenerFechaCorteIndicadores = createServerFn({ method: "GET" }).handler(
  async () => {
    const l = limitesPeriodoActual();
    return {
      fecha: l.fecha,
      hora: l.hora,
      zona: l.zona,
      iso: l.cutoffIso,
    };
  },
);

/**
 * Cálculo parcial del mes en curso (indicadores automáticos) con fecha de corte
 * server-side. NO persiste ninguna medición: es un snapshot calculado al leer.
 * Ninguna fecha, fórmula ni valor proviene del cliente.
 */
export const obtenerIndicadoresPeriodoActual = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const l = limitesPeriodoActual();
    const { data, error } = await context.supabase.rpc("calcular_indicadores_parcial", {
      _ini: l.inicioMesActual,
      _fin: l.cutoffIso,
    });
    if (error) throw new Error(error.message);
    return {
      periodo: l.periodoActual,
      periodoInicio: l.inicioMesActual,
      fechaCorte: l.fecha,
      horaCorte: l.hora,
      cutoffIso: l.cutoffIso,
      zona: l.zona,
      calculadoAt: new Date().toISOString(),
      filas: normalizarFilasParciales((data ?? []) as FilaParcialRpc[]),
    };
  });
