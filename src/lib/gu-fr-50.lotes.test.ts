import { describe, expect, it } from "vitest";

import { consultarModulo } from "./gu-fr-50.server";

/**
 * Doble fiel del builder de PostgREST usado por `consultarModulo`.
 * Registra cada llamada (rango, filtros temporales) y devuelve la porción
 * correspondiente del universo simulado, respetando el orden estable
 * (fecha funcional asc + id asc) que aplica el servidor real.
 */
function fakeSupabase(universo: Record<string, unknown>[]) {
  const llamadas: { desde: string | null; hasta: string | null; from: number; to: number }[] = [];

  const builder = () => {
    const estado = {
      desde: null as string | null,
      hasta: null as string | null,
      from: 0,
      to: 0,
      documento: null as string | null,
    };
    const api: Record<string, unknown> = {};
    const self = () => api as never;
    api.select = self;
    api.order = self;
    api.not = self;
    api.in = self;
    api.ilike = self;
    api.or = self;
    api.gte = (_c: string, v: string) => ((estado.desde = v), self());
    api.lt = (_c: string, v: string) => ((estado.hasta = v), self());
    api.eq = (c: string, v: string) => ((estado.documento = c === "documento" ? v : null), self());
    api.range = (from: number, to: number) => ((estado.from = from), (estado.to = to), self());
    api.then = (resolve: (r: { data: unknown[]; error: null }) => unknown) => {
      llamadas.push({ desde: estado.desde, hasta: estado.hasta, from: estado.from, to: estado.to });
      let filas = [...universo].sort(
        (a, b) =>
          String(a.fecha).localeCompare(String(b.fecha)) ||
          String(a.id).localeCompare(String(b.id)),
      );
      if (estado.desde) filas = filas.filter((r) => String(r.fecha) >= estado.desde!);
      if (estado.hasta) filas = filas.filter((r) => String(r.fecha) < estado.hasta!);
      if (estado.documento) filas = filas.filter((r) => r.documento === estado.documento);
      return Promise.resolve(
        resolve({ data: filas.slice(estado.from, estado.to + 1), error: null }),
      );
    };
    return api;
  };

  return { client: { from: () => builder() } as never, llamadas };
}

/** 6543 casos entrantes con fechas repetidas (empates) para forzar desempate. */
function universoEntrantes(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    id: `id-${String(i).padStart(6, "0")}`,
    // Fechas repetidas cada 10 filas: obliga a que `id` desempate el orden.
    fecha: `2026-07-${String((Math.floor(i / 240) % 28) + 1).padStart(2, "0")}T10:00:00.000Z`,
    documento: `100${i % 7}`,
    nombres: `PACIENTE ${i}`,
    apellidos: "PRUEBA",
    estado: "ACEPTADO",
  }));
}

describe("consultarModulo · lectura por lotes de 1000", () => {
  it("supera 5000 filas sin truncamiento, sin duplicados y sin omisiones", async () => {
    const universo = universoEntrantes(6543);
    const { client, llamadas } = fakeSupabase(universo);

    const r = await consultarModulo(client, "ENTRANTES", null, null, null, null);

    // 6543 = 6 lotes completos + 1 lote parcial (543) => 7 solicitudes.
    expect(llamadas.length).toBe(7);
    expect(llamadas.length).toBeGreaterThan(5);
    expect(llamadas.map((l) => l.from)).toEqual([0, 1000, 2000, 3000, 4000, 5000, 6000]);
    expect(llamadas.every((l) => l.to - l.from === 999)).toBe(true);

    expect(r.total).toBe(6543);
    expect(r.lotes).toBe(7);
    expect(r.filas.length).toBe(6543);
  });

  it("detiene la lectura exactamente en un múltiplo del lote", async () => {
    const { client, llamadas } = fakeSupabase(universoEntrantes(2000));
    const r = await consultarModulo(client, "ENTRANTES", null, null, null, null);
    // 2000 filas => 2 lotes llenos + 1 lote vacío que confirma el agotamiento.
    expect(llamadas.length).toBe(3);
    expect(r.total).toBe(2000);
  });

  it("reutiliza el MISMO intervalo temporal en todos los lotes (cutoffAt único)", async () => {
    const { client, llamadas } = fakeSupabase(universoEntrantes(6543));
    const desde = "2026-07-01T05:00:00.000Z";
    const hasta = "2026-08-01T05:00:00.000Z";

    await consultarModulo(client, "ENTRANTES", desde, hasta, null, null);

    expect(llamadas.length).toBeGreaterThan(5);
    expect(new Set(llamadas.map((l) => l.desde))).toEqual(new Set([desde]));
    expect(new Set(llamadas.map((l) => l.hasta))).toEqual(new Set([hasta]));
  });

  it("aplica el filtro funcional de documento en todos los lotes", async () => {
    const { client } = fakeSupabase(universoEntrantes(6543));
    const r = await consultarModulo(client, "ENTRANTES", null, null, null, {
      documento: "1003",
      status: null,
      sede: null,
      servicio: null,
      searchTerm: null,
      subtype: null,
    });
    // 6543 filas repartidas en 7 documentos => 935 para el documento 1003.
    expect(r.total).toBe(universoEntrantes(6543).filter((x) => x.documento === "1003").length);
    expect(r.total).toBeLessThan(6543);
  });
});
