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

describe("B.1.2D · cierre sin ingreso y DTO estricto", () => {
  it("aceptado que NO ingresa exporta S=NO, R vacío, TEP vacío y T con la causal", () => {
    const filas: FilaEntrante[] = [
      base({ tipo: "ACEP", unidad_prevista: "URGENCIAS" }),
      base({
        codigo: "E-1-CAN",
        tipo: "CAN",
        estado: "REGISTRADO",
        justificacion_confirmacion: "NO DISPONIBILIDAD DE AMBULANCIA · el paciente no fue trasladado",
        created_at: "2026-08-01T12:00:00Z",
      }),
      base({ tipo: "ACEP", estado: "CANCELADO", created_at: "2026-08-01T10:00:00Z" }),
    ];
    const [fila] = mapearEntrantesGuFr50(filas);
    expect(fila.ingresa).toBe("NO");
    expect(fila.unidad).toBe("");
    expect(fila.profesional).toBe("");
    expect(String(fila.justificacion_confirmacion)).toContain("NO DISPONIBILIDAD");
    expect(fila.estado).toBe("ACEPTADO");
  });

  it("nunca exporta CANCELADO_VENCIMIENTO como estado de solicitud", () => {
    const [fila] = mapearEntrantesGuFr50([
      base({ tipo: "ACEP", estado: "CANCELADO_VENCIMIENTO" }),
    ]);
    expect(fila.estado).toBe("ACEPTADO");
  });
});

describe("B.1.2D · DTO de creación rechaza mass assignment", () => {
  it("rechaza propiedades adicionales, edad sin unidad y metadata no permitida", async () => {
    const { crearCasoEntranteSchema } = await import("./entrantes-dto");
    const valido = {
      origen: "CON_GESTION",
      tipo: "ACEP",
      codigo: "E202600001",
      documento: "123456",
      edadValor: 3,
      edadUnidad: "MESES",
      especialidadRemision: "PEDIATRÍA",
      cie10Codigo: "A09",
      ips: "IPS X",
      sede: "MONTERÍA - CÓRDOBA",
      fechaEnvioRemision: "2026-08-01T10:00",
    };
    expect(crearCasoEntranteSchema.safeParse(valido).success).toBe(true);
    expect(
      crearCasoEntranteSchema.safeParse({ ...valido, ingreso_confirmado: true }).success,
    ).toBe(false);
    const { edadUnidad: _u, ...sinUnidad } = valido;
    expect(crearCasoEntranteSchema.safeParse(sinUnidad).success).toBe(false);
    const { edadValor: _v, ...sinEdad } = valido;
    expect(crearCasoEntranteSchema.safeParse(sinEdad).success).toBe(false);
    expect(
      crearCasoEntranteSchema.safeParse({ ...valido, metadata: { unidad_real: "UCI" } }).success,
    ).toBe(false);
  });

  it("la justificación de confirmación es obligatoria en toda modalidad excepcional", async () => {
    const { requiereJustificacionConfirmacion } = await import("./entrantes-dto");
    for (const m of [
      "INGRESO_TARDIO",
      "DIRECCIONAMIENTO_CRUE",
      "INGRESO_POSTERIOR_A_NEGACION",
      "SIN_GESTION_PREVIA_REFERENCIA",
    ] as const) {
      expect(requiereJustificacionConfirmacion({ modalidad: m })).toBe(true);
    }
    expect(
      requiereJustificacionConfirmacion({
        modalidad: "NORMAL_POR_ACEPTACION",
        unidadPrevista: "URGENCIAS",
        unidadReal: "UCI",
      }),
    ).toBe(true);
    expect(
      requiereJustificacionConfirmacion({
        modalidad: "NORMAL_POR_ACEPTACION",
        unidadPrevista: "URGENCIAS",
        unidadReal: "urgencias",
      }),
    ).toBe(false);
  });
});
