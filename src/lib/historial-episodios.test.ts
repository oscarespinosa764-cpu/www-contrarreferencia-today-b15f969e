import { describe, expect, it } from "vitest";
import { derivarFases, etiquetaEpisodio, SIN_ESTADO } from "./historial-episodios";

const a = (estado: string, t: number) => ({ estado, _orden: t });

describe("derivarFases", () => {
  it("estado consecutivo forma una sola fase", () => {
    const f = derivarFases([a("PENDIENTE", 1), a("PENDIENTE", 2)])!;
    expect(f).toHaveLength(1);
    expect(f[0].actuaciones).toHaveLength(2);
    expect(f[0].inicio).toBe(1);
    expect(f[0].fin).toBe(2);
  });
  it("estado repetido tras otro abre fase nueva", () => {
    const f = derivarFases([a("CANCELADO", 1), a("ACTIVO", 2), a("CANCELADO", 3)])!;
    expect(f.map((x) => x.estado)).toEqual(["CANCELADO", "ACTIVO", "CANCELADO"]);
  });
  it("actuación sin estado va a la fase vigente", () => {
    const f = derivarFases([a("ACEPTADO", 1), a("", 2), a("—", 3)])!;
    expect(f).toHaveLength(1);
    expect(f[0].actuaciones).toHaveLength(3);
  });
  it("sin estado antes del primer estado va a fase SIN ESTADO REGISTRADO", () => {
    const f = derivarFases([a("", 1), a("ACEPTADO", 2)])!;
    expect(f.map((x) => x.estado)).toEqual([SIN_ESTADO, "ACEPTADO"]);
  });
  it("sin estados en el módulo no genera fases ni inventa estados", () => {
    expect(derivarFases([a("", 1), a("", 2)])).toBeNull();
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
