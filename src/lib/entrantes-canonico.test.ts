import { describe, expect, it } from "vitest";
import {
  clasificarCaso,
  mapearEntrantesGuFr50,
  type FilaEntrante,
} from "./entrantes-canonico";

const base = (over: Partial<FilaEntrante>): FilaEntrante => ({
  codigo: "E-1",
  cod_ref: "E-1",
  documento: "123",
  created_at: "2026-08-01T10:00:00Z",
  ...over,
});

describe("clasificación canónica de ENTRANTES", () => {
  it("aceptación explícita produce ACEPTADO", () => {
    expect(clasificarCaso([base({ tipo: "ACEP" })])).toBe("ACEPTADO");
  });

  it("negación explícita produce NEGADO", () => {
    expect(clasificarCaso([base({ tipo: "NEG" })])).toBe("NEGADO");
  });

  it("CRUE sin decisión produce DIRECCIONAMIENTO_CRUE", () => {
    expect(clasificarCaso([base({ tipo: "CRUE_ACEP" })])).toBe("DIRECCIONAMIENTO_CRUE");
  });

  it("ingreso sin gestión previa produce su propia clasificación", () => {
    expect(clasificarCaso([base({ tipo: "SIN_GESTION" })])).toBe(
      "INGRESO_SIN_GESTION_PREVIA_REFERENCIA",
    );
  });

  it("CRUE posterior a aceptación conserva ACEPTADO", () => {
    expect(
      clasificarCaso([base({ tipo: "ACEP" }), base({ tipo: "CRUE_ACEP" })]),
    ).toBe("ACEPTADO");
  });

  it("CRUE posterior a negación conserva NEGADO", () => {
    expect(clasificarCaso([base({ tipo: "NEG" }), base({ tipo: "CRUE_ACEP" })])).toBe("NEGADO");
  });

  it("CRUE previo y aceptación posterior produce ACEPTADO", () => {
    expect(clasificarCaso([base({ tipo: "CRUE_ACEP" }), base({ tipo: "ACEP" })])).toBe("ACEPTADO");
  });

  it("CRUE previo y negación posterior produce NEGADO", () => {
    expect(clasificarCaso([base({ tipo: "CRUE_NEG" }), base({ tipo: "NEG" })])).toBe("NEGADO");
  });

  it("los estados operativos no alimentan ESTADO DE SOLICITUD", () => {
    const [fila] = mapearEntrantesGuFr50([
      base({ tipo: "ACEP", estado: "CANCELADO_VENCIMIENTO" }),
    ]);
    expect(fila.estado).toBe("ACEPTADO");
    expect(fila.ingresa).toBe("NO");
    expect(fila.unidad).toBe("");
  });
});

describe("mapeo GU-FR-50 · ENTRANTES", () => {
  it("la especialidad principal no se contamina con la de la negación", () => {
    const [fila] = mapearEntrantesGuFr50([
      base({
        tipo: "NEG",
        especialidad: "CIRUGÍA PEDIÁTRICA",
        especialidad_remision: "PEDIATRÍA",
        metadata: {
          especialidad_negacion: "CIRUGÍA PEDIÁTRICA",
          motivo_negacion: "NO_RECURSO_HUMANO",
          motivo_negacion_label: "NO RECURSO HUMANO",
        },
      }),
    ]);
    expect(fila.especialidad).toBe("PEDIATRÍA");
    expect(fila.motivos).toBe("NO RECURSO HUMANO");
  });

  it("sin especialidad principal registrada no usa la de la negación", () => {
    const [fila] = mapearEntrantesGuFr50([
      base({
        tipo: "NEG",
        especialidad: "CIRUGÍA PEDIÁTRICA",
        metadata: { especialidad_negacion: "CIRUGÍA PEDIÁTRICA" },
      }),
    ]);
    expect(fila.especialidad).toBe("");
  });

  it("negado que ingresa por CRUE conserva motivo, código y unidad real", () => {
    const [fila] = mapearEntrantesGuFr50([
      base({
        tipo: "NEG",
        metadata: { motivo_negacion_label: "RED NO CONTRATADA" },
      }),
      base({
        tipo: "ING",
        created_at: "2026-08-02T10:00:00Z",
        unidad_real: "UCI ADULTOS",
        codigo_crue: "CRUE-99",
        profesional_tep_nombre: "JUAN PÉREZ",
        profesional_tep_cargo: "APH",
      }),
    ]);
    expect(fila.estado).toBe("NEGADO");
    expect(fila.motivos).toBe("RED NO CONTRATADA");
    expect(fila.codigo_crue).toBe("CRUE-99");
    expect(fila.unidad).toBe("UCI ADULTOS");
    expect(fila.ingresa).toBe("SI");
    expect(fila.profesional).toBe("JUAN PÉREZ");
    expect(fila.cargo).toBe("APH");
  });

  it("ingreso sin gestión previa no inventa fecha de remisión", () => {
    const [fila] = mapearEntrantesGuFr50([
      base({ tipo: "SIN_GESTION", fecha_envio_remision: "2026-08-01T10:00:00Z" }),
    ]);
    expect(fila.estado).toBe("INGRESO SIN GESTIÓN PREVIA DE REFERENCIA");
    expect(fila.fecha_envio).toBeNull();
    expect(fila.ingresa).toBe("SI");
  });
});
