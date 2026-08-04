import { describe, expect, it } from "vitest";

import {
  historialFilterSchema,
  normalizarFiltrosFuncionales,
  resolverFiltroTemporalHistorial,
} from "./historial-filtro";

const AHORA = new Date("2026-08-04T21:00:00.000Z"); // 16:00 en Bogotá

describe("intervalo técnico vs. visible", () => {
  it("MONTH julio 2026: técnico 01/07–01/08 exclusivo, visible 01/07–31/07", () => {
    const r = resolverFiltroTemporalHistorial(
      { periodMode: "MONTH", year: 2026, month: 7, startDate: null, endDate: null },
      AHORA,
    );
    expect(r.startAt).toBe("2026-07-01T05:00:00.000Z");
    expect(r.endExclusive).toBe("2026-08-01T05:00:00.000Z");
    expect(r.startDateVisible).toBe("2026-07-01");
    expect(r.endDateVisible).toBe("2026-07-31");
    expect(r.fileSuffix).toBe("2026-07-01_a_2026-07-31");
    expect(r.fileSuffix).not.toContain("2026-08-01");
  });

  it("RANGE conserva el final visible inclusivo y usa el día siguiente técnicamente", () => {
    const r = resolverFiltroTemporalHistorial(
      { periodMode: "RANGE", year: null, month: null, startDate: "2026-07-15", endDate: "2026-08-04" },
      AHORA,
    );
    expect(r.endExclusive).toBe("2026-08-05T05:00:00.000Z");
    expect(r.endDateVisible).toBe("2026-08-04");
    expect(r.fileSuffix).toBe("2026-07-15_a_2026-08-04");
  });

  it("ALL no acota el periodo y usa la fecha de corte visible del servidor", () => {
    const r = resolverFiltroTemporalHistorial({ periodMode: "ALL" }, AHORA);
    expect(r.startAt).toBeNull();
    expect(r.endExclusive).toBeNull();
    expect(r.fileSuffix).toBe("hasta_2026-08-04");
  });
});

describe("DTO canónico", () => {
  it("rechaza TRAMITES como módulo", () => {
    expect(historialFilterSchema.safeParse({ module: "TRAMITES" }).success).toBe(false);
  });

  it("rechaza subtipos desconocidos", () => {
    const base = { module: "ATENCION_DOMICILIARIA" as const };
    expect(historialFilterSchema.safeParse({ ...base, subtype: "PHD" }).success).toBe(true);
    expect(historialFilterSchema.safeParse({ ...base, subtype: "OTRO" }).success).toBe(false);
  });

  it("rechaza pageSize fuera de la allowlist", () => {
    const base = { module: "ENTRANTES" as const };
    expect(historialFilterSchema.safeParse({ ...base, pageSize: 25 }).success).toBe(true);
    for (const n of [0, -10, 7, 101, 5000]) {
      expect(historialFilterSchema.safeParse({ ...base, pageSize: n }).success).toBe(false);
    }
  });

  it("rechaza propiedades adicionales", () => {
    expect(
      historialFilterSchema.safeParse({ module: "ENTRANTES", orderBy: "id desc" }).success,
    ).toBe(false);
  });
});

describe("normalización de filtros funcionales", () => {
  it("descarta comodines y normaliza acentos", () => {
    const f = normalizarFiltrosFuncionales({
      status: "  aceptación ",
      sede: "TODAS LAS SEDES",
      servicio: "TODOS LOS SERVICIOS",
      documento: " 12.345-678 ",
      searchTerm: "  josé  pérez ",
      subtype: "TODOS",
    });
    expect(f.status).toBe("ACEPTACION");
    expect(f.sede).toBeNull();
    expect(f.servicio).toBeNull();
    expect(f.documento).toBe("12345-678");
    expect(f.searchTerm).toBe("JOSE PEREZ");
    expect(f.subtype).toBeNull();
  });

  it("conserva el subtipo canónico cuando no es TODOS", () => {
    expect(normalizarFiltrosFuncionales({ subtype: "PHD" }).subtype).toBe("PHD");
  });
});
