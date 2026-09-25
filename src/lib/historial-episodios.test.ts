import { describe, expect, it } from "vitest";
import { derivarFases, etiquetaEpisodio, TRANSICIONES } from "./historial-episodios";

const a = (accion: string, estado: string, t: number) => ({ accion, estado, _orden: t });

describe("derivarFases", () => {
  it("resultados de actuación no abren fase (Salientes)", () => {
    const acts = [
      a("SOLICITUD REGISTRADA", "SOLICITUD", 1),
      a("CREACIÓN DEL CASO", "CASO REGISTRADO EN SISTEMA", 2),
      a("TRAZABILIDAD DE NEGACIONES", "NO ACEPTA", 3),
      a("TRAZABILIDAD DE NEGACIONES", "PENDIENTE", 4),
      a("TRAZABILIDAD DE NEGACIONES", "NO ACEPTA", 5),
    ];
    const f = derivarFases(acts, { estadoActual: "PENDIENTE ACEPTACION", inicio: 0 });
    expect(f).toHaveLength(1);
    expect(f[0].estado).toBe("PENDIENTE ACEPTACION");
    expect(f[0].inicio).toBe(0);
    expect(f[0].actuaciones).toHaveLength(5);
  });
  it("hitos no abren fase y la única fase es el estado de cierre (RI)", () => {
    const f = derivarFases([a("CREACIÓN DEL CASO", "", 1), a("RADICACIÓN", "RADICADO", 2)], {
      estadoActual: "CERRADO POR CULMINACION DE SOLICITUD",
      inicio: 1,
    });
    expect(f.map((x) => x.estado)).toEqual(["CERRADO POR CULMINACION DE SOLICITUD"]);
    expect(f[0].actuaciones).toHaveLength(2);
  });
  it("evento de transición abre fase y la última fase = estado actual", () => {
    const f = derivarFases(
      [a("CREACIÓN DEL CASO", "", 1), a("ACEPTACIÓN", "", 2), a("EVOLUCIÓN", "X", 3)],
      { estadoActual: "EN ATENCION", inicio: 1, transiciones: TRANSICIONES.phd },
    );
    expect(f.map((x) => x.estado)).toEqual(["SIN ESTADO REGISTRADO", "EN ATENCION"]);
    expect(f[1].actuaciones).toHaveLength(2);
  });
  it("estado repetido tras reactivación abre fase nueva", () => {
    const tr = { CIERRE: "CERRADO", REACTIVACIÓN: "ACTIVO" };
    const f = derivarFases([a("CIERRE", "", 1), a("REACTIVACIÓN", "", 2), a("CIERRE", "", 3)], {
      estadoActual: "CERRADO",
      inicio: 0,
      estadoInicial: "ACTIVO",
      transiciones: tr,
    });
    expect(f.map((x) => x.estado)).toEqual(["CERRADO", "ACTIVO", "CERRADO"]);
  });
  it("suma de actuaciones por fase = total", () => {
    const acts = [a("X", "A", 1), a("ACEPTACIÓN", "", 2), a("Y", "B", 3)];
    const f = derivarFases(acts, {
      estadoActual: "Z",
      inicio: 0,
      estadoInicial: "PENDIENTE",
      transiciones: TRANSICIONES.phd,
    });
    expect(f.reduce((n, x) => n + x.actuaciones.length, 0)).toBe(3);
  });
});

describe("etiquetaEpisodio", () => {
  it("remisión con fecha y hora Bogotá", () => {
    expect(etiquetaEpisodio("salientes", "2026-09-02T23:00:00Z")).toBe(
      "REMISIÓN del 02/09/2026 18:00",
    );
  });
  it("RI usa el examen real y nunca la palabra trámite", () => {
    const l = etiquetaEpisodio("interna", "2026-09-05T18:00:35Z", "resonancia");
    expect(l).toBe("RESONANCIA del 05/09/2026");
    expect(l.toUpperCase()).not.toContain("TRÁMITE");
  });
});

import { actuacionCambioEstado } from "./historial-episodios";
describe("cambios de estado registrados", () => {
  const ce = (ant: string, nue: string, t: string, actor = "ANA") => ({
    ...actuacionCambioEstado({
      caso_id: "x",
      estado_anterior: ant,
      estado_nuevo: nue,
      actor_nombre: actor,
      created_at: t,
    }),
  });
  it("2 cambios → 3 fases, cambio es primera actuación y gestores propios", () => {
    const acts = [
      {
        accion: "SEG",
        estado: "NO ACEPTA",
        funcionario: "LUIS",
        _orden: Date.parse("2026-01-01T01:00Z"),
      },
      ce("PENDIENTE ACEPTACION", "ACEPTADO", "2026-01-01T02:00Z"),
      { accion: "SEG", estado: "X", funcionario: "PEDRO", _orden: Date.parse("2026-01-01T03:00Z") },
      ce("ACEPTADO", "AMBULANCIA COORDINADA", "2026-01-01T04:00Z", "SISTEMA"),
    ];
    const f = derivarFases(acts, { estadoActual: "AMBULANCIA COORDINADA", inicio: 0 });
    expect(f.map((x) => x.estado)).toEqual([
      "PENDIENTE ACEPTACION",
      "ACEPTADO",
      "AMBULANCIA COORDINADA",
    ]);
    expect(f[1].actuaciones[0].accion).toBe("CAMBIO DE ESTADO");
    expect(f[1].actuaciones.map((a) => (a as { funcionario: string }).funcionario)).toEqual([
      "ANA",
      "PEDRO",
    ]);
    expect(f.reduce((n, x) => n + x.actuaciones.length, 0)).toBe(4);
  });
  it("entrantes: clasificación no abre fase, ingreso sí", () => {
    const f = derivarFases([a("ACEPTACIÓN", "ACEPTADO", 1), a("INGRESO CONFIRMADO", "", 2)], {
      estadoActual: "INGRESO CONFIRMADO",
      inicio: 0,
      transiciones: TRANSICIONES.entrantes,
    });
    expect(f).toHaveLength(2);
  });
});

import { transicionesParaFases } from "./historial-episodios";
describe("paridad Atención Domiciliaria", () => {
  it("eventos registrados mandan (sin fechas)", () => {
    expect(transicionesParaFases("phd", [a("ACEPTACIÓN", "", 1)], "X", true)).toBeUndefined();
  });
  it("fechas solo si la última fase coincide con estado_ciclo", () => {
    expect(transicionesParaFases("phd", [a("CIERRE", "", 1)], "CERRADO", false)).toBe(
      TRANSICIONES.phd,
    );
    expect(
      transicionesParaFases("phd", [a("CIERRE", "", 1)], "CERRADO POR EGRESO", false),
    ).toBeUndefined();
  });
  it("última fase reconstruida = último estado_nuevo de los eventos", () => {
    const ev = (ant: string, nue: string, t: string) =>
      actuacionCambioEstado({
        caso_id: "p",
        estado_anterior: ant,
        estado_nuevo: nue,
        actor_nombre: "A",
        created_at: t,
      });
    const f = derivarFases(
      [
        ev("PENDIENTE ACEPTACION", "ACEPTADO CON PENDIENTE EGRESO", "2026-08-01T00:00Z"),
        ev("ACEPTADO CON PENDIENTE EGRESO", "CERRADO POR EGRESO", "2026-08-02T00:00Z"),
      ],
      { estadoActual: "CERRADO POR EGRESO", inicio: 0 },
    );
    expect(f.map((x) => x.estado)).toEqual([
      "PENDIENTE ACEPTACION",
      "ACEPTADO CON PENDIENTE EGRESO",
      "CERRADO POR EGRESO",
    ]);
  });
});
