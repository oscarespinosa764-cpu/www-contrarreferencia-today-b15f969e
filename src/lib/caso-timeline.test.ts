import { describe, it, expect } from "vitest";
import {
  construirTimelineCaso,
  eventoFuncional,
  eventosDerivadosCaso,
  eventosDesdeSeguimientos,
  fusionarTimeline,
} from "./caso-timeline";

const seg = (created_at: string, tipo: string, detalle = "", usuario = "FUNCIONARIA A") => ({
  created_at,
  detalle,
  estado: "Pendiente",
  tipo,
  usuario,
  contacto: "",
});

describe("línea de tiempo canónica del caso", () => {
  it("un caso recién creado contiene CREACIÓN DEL CASO", () => {
    const t = construirTimelineCaso({
      module: "SALIENTES",
      caso: { id: "c1", created_at: "2026-09-02T23:19:37Z" },
    });
    expect(t.map((e) => e.eventType)).toContain("CREACION");
  });

  it("solicitud y creación en momentos distintos generan dos hitos ordenados", () => {
    const t = construirTimelineCaso({
      module: "SALIENTES",
      caso: { id: "c1", created_at: "2026-09-02T23:19:37Z", fecha_inicio: "2026-09-02T23:00:00Z" },
    });
    expect(t.map((e) => e.eventType)).toEqual(["SOLICITUD", "CREACION"]);
  });

  it("no duplica cuando solicitud y creación son el mismo hito", () => {
    const t = construirTimelineCaso({
      module: "SALIENTES",
      caso: { id: "c1", created_at: "2026-09-02T23:00:10Z", fecha_inicio: "2026-09-02T23:00:00Z" },
    });
    expect(t).toHaveLength(1);
    expect(t[0].eventType).toBe("CREACION");
  });

  it("radicado real genera RADICACIÓN", () => {
    const t = eventosDerivadosCaso("SALIENTES", {
      id: "c1",
      created_at: "2026-09-02T23:19:37Z",
      codigo_radicacion: "RAD-123",
      fecha_radicado: "2026-09-02T23:30:00Z",
    });
    const rad = t.find((e) => e.eventType === "RADICACION");
    expect(rad?.description).toContain("RAD-123");
  });

  it("NO APLICA no genera radicación falsa", () => {
    const t = eventosDerivadosCaso("SALIENTES", {
      id: "c1",
      created_at: "2026-09-02T23:19:37Z",
      codigo_radicacion: "NO APLICA",
    });
    expect(t.some((e) => e.eventType === "RADICACION")).toBe(false);
  });

  it("no inventa correo ni hitos sin evidencia", () => {
    const t = eventosDerivadosCaso("SALIENTES", { id: "c1", created_at: "2026-09-02T23:19:37Z" });
    expect(t.map((e) => e.eventType)).toEqual(["CREACION"]);
  });

  it("atención domiciliaria deriva aceptación, egreso y cierre reales", () => {
    const t = eventosDerivadosCaso("ATENCION_DOMICILIARIA", {
      id: "d1",
      created_at: "2026-09-01T10:00:00Z",
      fecha_aceptacion: "2026-09-01T12:00:00Z",
      fecha_egreso: "2026-09-02T10:00:00Z",
      fecha_cierre: "2026-09-03T10:00:00Z",
      motivo_cierre: "CULMINA TRATAMIENTO",
    });
    expect(t.map((e) => e.eventType)).toEqual(["CREACION", "ACEPTACION", "EGRESO", "CIERRE"]);
  });

  it("referencias internas sólo radica con fecha real", () => {
    const sin = eventosDerivadosCaso("REFERENCIAS_INTERNAS", {
      id: "r1",
      created_at: "2026-09-01T10:00:00Z",
    });
    expect(sin.some((e) => e.eventType === "RADICACION")).toBe(false);
    const con = eventosDerivadosCaso("REFERENCIAS_INTERNAS", {
      id: "r1",
      created_at: "2026-09-01T10:00:00Z",
      fecha_radicado: "2026-09-01T11:00:00Z",
    });
    expect(con.some((e) => e.eventType === "RADICACION")).toBe(true);
  });

  it("incluye seguimientos reales (evolución diaria y trazabilidad de negaciones)", () => {
    const t = construirTimelineCaso({
      module: "SALIENTES",
      caso: { id: "c1", created_at: "2026-09-02T23:19:37Z", fecha_inicio: "2026-09-02T23:00:00Z" },
      seguimientos: [
        seg("2026-09-03T02:26:45Z", "TRAZABILIDAD DE NEGACIONES"),
        seg("2026-09-03T22:11:35Z", "EVOLUCIÓN DIARIA"),
      ],
    });
    expect(t.map((e) => e.eventType)).toEqual([
      "SOLICITUD",
      "CREACION",
      "TRAZABILIDAD DE NEGACIONES",
      "EVOLUCIÓN DIARIA",
    ]);
    // La bitácora comienza por la primera actuación real, no por el primer
    // seguimiento registrado (caso de regresión 1007258461).
    expect(t[0].functionalDateTime).toBe("2026-09-02T23:00:00.000Z");
  });

  it("conserva el funcionario histórico de cada actuación", () => {
    const t = eventosDesdeSeguimientos("c1", "SALIENTES", [
      seg("2026-09-03T02:26:45Z", "TRAZABILIDAD DE NEGACIONES", "", "WENDY"),
      seg("2026-09-04T02:26:45Z", "EVOLUCIÓN DIARIA", "", "NAYIBET"),
    ]);
    expect(t.map((e) => e.actorSnapshot)).toEqual(["WENDY", "NAYIBET"]);
  });

  it("dos eventos distintos a la misma hora no se pierden", () => {
    const t = fusionarTimeline(
      eventosDesdeSeguimientos("c1", "SALIENTES", [
        seg("2026-09-03T02:26:45Z", "EVOLUCIÓN DIARIA"),
        seg("2026-09-03T02:26:45Z", "INFORMACIÓN DEL TRÁMITE"),
      ]),
    );
    expect(t).toHaveLength(2);
  });

  it("no duplica el mismo hito cuando existe en fuente funcional y derivada", () => {
    const derivado = eventosDerivadosCaso("SALIENTES", {
      id: "c1",
      created_at: "2026-09-02T23:19:00Z",
    });
    const funcional = eventoFuncional({
      caseId: "c1",
      module: "SALIENTES",
      eventType: "CREACION",
      fecha: "2026-09-02T23:19:20Z",
      title: "CREACIÓN DEL CASO",
      sourceId: "ev-1",
    });
    const t = fusionarTimeline(derivado, [funcional!]);
    expect(t).toHaveLength(1);
    expect(t[0].sourceType).toBe("EVENTO");
  });

  it("no mezcla eventos entre casos distintos", () => {
    const t = fusionarTimeline(
      eventosDerivadosCaso("SALIENTES", { id: "c1", created_at: "2026-09-02T23:00:00Z" }),
      eventosDerivadosCaso("SALIENTES", { id: "c2", created_at: "2026-09-02T23:00:00Z" }),
    );
    expect(t.filter((e) => e.caseId === "c1")).toHaveLength(1);
    expect(t.filter((e) => e.caseId === "c2")).toHaveLength(1);
  });

  it("ordena cronológicamente ascendente", () => {
    const t = construirTimelineCaso({
      module: "SALIENTES",
      caso: { id: "c1", created_at: "2026-09-02T23:19:37Z" },
      seguimientos: [
        seg("2026-09-10T02:00:00Z", "OTRO"),
        seg("2026-09-03T02:00:00Z", "EVOLUCIÓN DIARIA"),
      ],
    });
    const tiempos = t.map((e) => new Date(e.functionalDateTime).getTime());
    expect([...tiempos].sort((a, b) => a - b)).toEqual(tiempos);
  });

  it("un caso sin fecha utilizable no produce eventos inventados", () => {
    expect(eventosDerivadosCaso("SALIENTES", { id: "c1" })).toHaveLength(0);
    expect(eventosDerivadosCaso("SALIENTES", { created_at: "2026-09-02T23:00:00Z" })).toHaveLength(
      0,
    );
  });
});
