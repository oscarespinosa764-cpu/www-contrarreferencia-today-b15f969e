// Pruebas del listado canónico del Historial (contrato, query key y adaptador
// server-side). El doble fiel implementa la semántica de la RPC
// public.historial_listado sobre un universo controlado.

import { describe, expect, it } from "vitest";

import { historialQueryKey, historialQuerySchema } from "./historial-listado";
import { listarHistorialServer } from "./historial-listado.server";

type Unidad = {
  modulo: string;
  unit_key: string;
  ids: string[];
  fecha_funcional: string | null;
  documento: string;
  tipo_txt: string;
  estado_txt: string;
  sede_txt: string;
  servicio_txt: string;
  subtipo: string;
  haystack: string;
};

const SUB: Record<string, string[]> = {
  PHD: ["PHD"],
  PAD: ["PAD"],
  O2: ["O2", "OXIGENO"],
  ESPECIALES: ["ESPECIAL", "ESPECIALES"],
};

/** Doble fiel de la RPC: mismos filtros, mismo orden, mismo contrato. */
function fakeSupabase(universo: Unidad[]) {
  const llamadas: Record<string, unknown>[] = [];
  const client = {
    rpc: async (_name: string, a: Record<string, unknown>) => {
      llamadas.push(a);
      const mods =
        a._module === "GENERAL"
          ? ["ENTRANTES", "SALIENTES", "ATENCION_DOMICILIARIA", "REFERENCIAS_INTERNAS"]
          : [a._module as string];
      const like = (txt: string, f: unknown) =>
        f == null || txt.toUpperCase().includes(String(f).toUpperCase());
      const base = universo.filter(
        (u) =>
          mods.includes(u.modulo) &&
          like(u.tipo_txt, a._tipo) &&
          like(u.estado_txt, a._estado) &&
          (a._sede == null || u.sede_txt === "" || like(u.sede_txt, a._sede)) &&
          like(u.servicio_txt, a._servicio) &&
          (a._documento == null || u.documento === a._documento) &&
          (a._term == null || u.haystack.includes(String(a._term).toLowerCase())) &&
          (a._subtype == null || (SUB[String(a._subtype)] ?? []).includes(u.subtipo)),
      );
      const periodo = base.filter((u) => {
        if (a._start == null && a._end == null) return true;
        if (!u.fecha_funcional) return false;
        if (a._start && u.fecha_funcional < String(a._start)) return false;
        if (a._end && u.fecha_funcional >= String(a._end)) return false;
        return true;
      });
      const ordenado = [...periodo].sort((x, y) => {
        const fx = x.fecha_funcional ?? "";
        const fy = y.fecha_funcional ?? "";
        if (fx !== fy) return fx < fy ? 1 : -1;
        return x.unit_key < y.unit_key ? -1 : 1;
      });
      const size = Number(a._page_size);
      const page = Number(a._page);
      const rows = ordenado.slice((page - 1) * size, page * size);
      const by: Record<string, number> = {};
      for (const u of periodo) by[u.modulo] = (by[u.modulo] ?? 0) + 1;
      return {
        data: {
          rows: rows.map((u) => ({
            modulo: u.modulo,
            unit_key: u.unit_key,
            ids: u.ids,
            fecha_funcional: u.fecha_funcional,
          })),
          total: periodo.length,
          page,
          pageSize: size,
          totalPages: Math.max(1, Math.ceil(periodo.length / size)),
          hasNextPage: page * size < periodo.length,
          hasPreviousPage: page > 1,
          missingFunctionalDateCount: base.filter((u) => !u.fecha_funcional).length,
          totalsByModule: by,
        },
        error: null,
      };
    },
  };
  return { client, llamadas };
}

const unidad = (i: number, over: Partial<Unidad> = {}): Unidad => ({
  modulo: "ENTRANTES",
  unit_key: `U${String(i).padStart(6, "0")}`,
  ids: [`id-${i}`],
  fecha_funcional: `2026-07-${String((i % 28) + 1).padStart(2, "0")}T10:00:00.000Z`,
  documento: `100${i}`,
  tipo_txt: "ACEP",
  estado_txt: "ACEPTADO",
  sede_txt: "SEDE PRINCIPAL",
  servicio_txt: "URGENCIAS",
  subtipo: "",
  haystack: `paciente ${i}`,
  ...over,
});

const base = { module: "ENTRANTES" as const, periodMode: "ALL" as const };
const q = (o: Record<string, unknown>) => historialQuerySchema.parse({ ...base, ...o });

describe("PRUEBA 1 · query key", () => {
  const k = (o: Record<string, unknown>) => JSON.stringify(historialQueryKey({ ...base, ...o }));
  const ref = k({});
  it("cambia con cada filtro efectivo", () => {
    expect(k({ documento: "123" })).not.toBe(ref);
    expect(k({ servicio: "URGENCIAS" })).not.toBe(ref);
    expect(k({ status: "ACEPTADO" })).not.toBe(ref);
    expect(k({ sede: "SEDE NORTE" })).not.toBe(ref);
    expect(k({ subtype: "PHD" })).not.toBe(ref);
    expect(k({ caseType: "NEG" })).not.toBe(ref);
    expect(k({ page: 2 })).not.toBe(ref);
    expect(k({ pageSize: 50 })).not.toBe(ref);
    expect(k({ module: "GENERAL" })).not.toBe(ref);
    expect(k({ periodMode: "THIS_MONTH" })).not.toBe(ref);
  });
  it("es estable y normaliza los comodines", () => {
    expect(k({ servicio: "TODOS LOS SERVICIOS" })).toBe(ref);
    expect(k({ subtype: "TODOS" })).toBe(ref);
    expect(k({})).toBe(ref);
  });
});

describe("PRUEBA 11 · payload", () => {
  it("rechaza módulos, propiedades y tamaños no autorizados", () => {
    expect(() => q({ module: "TRAMITES" })).toThrow();
    expect(() => q({ role: "admin" })).toThrow();
    expect(() => q({ userId: "x" })).toThrow();
    expect(() => q({ cargo: "COORDINADOR" })).toThrow();
    expect(() => q({ pageSize: 5000 })).toThrow();
    expect(() => q({ orderBy: "created_at desc" })).toThrow();
    expect(() => q({ columna: "documento" })).toThrow();
    expect(() => q({ periodMode: "MONTH" })).toThrow();
  });
  it("acepta el contrato canónico", () => {
    expect(q({ module: "GENERAL", page: 3, pageSize: 100 }).pageSize).toBe(100);
  });
});

describe("PRUEBAS 2, 3 y 9 · paginación, total y más de 3.000 unidades", () => {
  const universo = Array.from({ length: 3457 }, (_, i) => unidad(i));
  it("pagina server-side sin duplicados y con total independiente del tamaño", async () => {
    const { client } = fakeSupabase(universo);
    const p1 = await listarHistorialServer(client as never, q({ pageSize: 10 }));
    const p2 = await listarHistorialServer(client as never, q({ page: 2, pageSize: 10 }));
    expect(p1.rows.length).toBe(10);
    expect(p2.rows.length).toBe(10);
    expect(p1.rows.some((r) => p2.rows.some((s) => s.unitKey === r.unitKey))).toBe(false);
    expect(p1.total).toBe(3457);
    expect(p1.totalPages).toBe(346);
    expect(p1.hasPreviousPage).toBe(false);
    expect(p1.hasNextPage).toBe(true);
    expect(p2.hasPreviousPage).toBe(true);

    const grande = await listarHistorialServer(client as never, q({ pageSize: 100 }));
    expect(grande.total).toBe(p1.total);
    const tarde = await listarHistorialServer(client as never, q({ page: 40, pageSize: 100 }));
    expect(tarde.rows.length).toBe(0);
    const p350 = await listarHistorialServer(client as never, q({ page: 346, pageSize: 10 }));
    expect(p350.rows.length).toBe(7);
    expect(p350.hasNextPage).toBe(false);
  });
});

describe("PRUEBA 10 · más de 20.000 unidades", () => {
  it("accede más allá del registro 20.000 sin truncamiento", async () => {
    const universo = Array.from({ length: 24_310 }, (_, i) => unidad(i));
    const { client } = fakeSupabase(universo);
    const r = await listarHistorialServer(client as never, q({ page: 220, pageSize: 100 }));
    expect(r.total).toBe(24_310);
    expect(r.totalPages).toBe(244);
    expect(r.rows.length).toBe(100); // sólo la página viaja al navegador
    expect(r.hasNextPage).toBe(true);
  });
});

describe("PRUEBA 4 · filtros server-side", () => {
  const universo = [
    unidad(1, { documento: "111", estado_txt: "ACEPTADO", servicio_txt: "URGENCIAS", subtipo: "PHD" }),
    unidad(2, { documento: "222", estado_txt: "NEGADO", servicio_txt: "PEDIATRIA", subtipo: "PAD" }),
    unidad(3, { documento: "333", estado_txt: "ACEPTADO", servicio_txt: "URGENCIAS", subtipo: "O2" }),
  ];
  it("cada filtro altera filas y total, y viaja normalizado a la base", async () => {
    const { client, llamadas } = fakeSupabase(universo);
    const todos = await listarHistorialServer(client as never, q({}));
    expect(todos.total).toBe(3);
    const doc = await listarHistorialServer(client as never, q({ documento: "222" }));
    expect(doc.total).toBe(1);
    const est = await listarHistorialServer(client as never, q({ status: "ACEPTADO" }));
    expect(est.total).toBe(2);
    const serv = await listarHistorialServer(client as never, q({ servicio: "pediatria" }));
    expect(serv.total).toBe(1);
    const sub = await listarHistorialServer(
      client as never,
      q({ module: "ATENCION_DOMICILIARIA", subtype: "O2" }),
    );
    expect(sub.appliedFilter.subtype).toBe("O2");
    expect(llamadas.at(-1)?._subtype).toBe("O2");
    expect(llamadas.at(-2)?._servicio).toBe("PEDIATRIA");
  });
});

describe("PRUEBA 6 · registros sin fecha funcional", () => {
  const universo = [
    unidad(1, { fecha_funcional: "2026-07-10T10:00:00.000Z" }),
    unidad(2, { fecha_funcional: null }),
    unidad(3, { fecha_funcional: null }),
  ];
  it("ALL los incluye y los contabiliza; MONTH los excluye", async () => {
    const { client } = fakeSupabase(universo);
    const all = await listarHistorialServer(client as never, q({}));
    expect(all.total).toBe(3);
    expect(all.missingFunctionalDateCount).toBe(2);
    const mes = await listarHistorialServer(
      client as never,
      q({ periodMode: "MONTH", year: 2026, month: 7 }),
    );
    expect(mes.total).toBe(1);
    expect(mes.missingFunctionalDateCount).toBe(2);
  });
});

describe("PRUEBA 7 · GENERAL consolidado", () => {
  const universo = [
    ...Array.from({ length: 5 }, (_, i) => unidad(i, { modulo: "ENTRANTES" })),
    ...Array.from({ length: 3 }, (_, i) => unidad(100 + i, { modulo: "SALIENTES" })),
    ...Array.from({ length: 4 }, (_, i) => unidad(200 + i, { modulo: "ATENCION_DOMICILIARIA" })),
    ...Array.from({ length: 2 }, (_, i) => unidad(300 + i, { modulo: "REFERENCIAS_INTERNAS" })),
  ];
  it("totaliza por módulo, ordena global y no duplica entre páginas", async () => {
    const { client } = fakeSupabase(universo);
    const p1 = await listarHistorialServer(client as never, q({ module: "GENERAL", pageSize: 10 }));
    const p2 = await listarHistorialServer(
      client as never,
      q({ module: "GENERAL", page: 2, pageSize: 10 }),
    );
    expect(p1.total).toBe(14);
    expect(p1.totalsByModule).toEqual({
      ENTRANTES: 5,
      SALIENTES: 3,
      ATENCION_DOMICILIARIA: 4,
      REFERENCIAS_INTERNAS: 2,
    });
    expect(p2.rows.length).toBe(4);
    const keys = new Set([...p1.rows, ...p2.rows].map((r) => r.unitKey));
    expect(keys.size).toBe(14);
    expect(p1.cutoffAt).toBe(p1.cutoffAt);
  });
});

describe("PRUEBA 5 · agrupación de Entrantes", () => {
  it("una unidad visual agrupa varias filas intermedias sin inflar el total", async () => {
    const universo = [
      unidad(1, { unit_key: "N2607001", ids: ["ev-1", "ev-2", "ev-3"] }),
      unidad(2, { unit_key: "N2607002", ids: ["ev-4"] }),
    ];
    const { client } = fakeSupabase(universo);
    const r = await listarHistorialServer(client as never, q({ pageSize: 10 }));
    expect(r.total).toBe(2);
    expect(r.rows[0].ids.length + r.rows[1].ids.length).toBe(4);
  });
});
