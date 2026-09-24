import { describe, expect, it } from "vitest";
import { esCodigoReal, fmtRadicado, referenciaArchivo } from "./remisiones-utils";

describe("esCodigoReal", () => {
  it("rechaza NO APLICA, PENDIENTE, guion y vacío", () => {
    for (const v of ["NO APLICA", fmtRadicado("", false), "PENDIENTE DE RADICACIÓN", "—", "", null])
      expect(esCodigoReal(v)).toBe(false);
  });
  it("acepta códigos reales", () => {
    expect(esCodigoReal("RAD-12345")).toBe(true);
  });
});

describe("referenciaArchivo", () => {
  it("nunca devuelve NO APLICA; usa el documento como respaldo", () => {
    expect(referenciaArchivo("NO APLICA", "1007258461")).toBe("1007258461");
    expect(referenciaArchivo("NO APLICA")).toBe("caso");
    expect(referenciaArchivo("RAD-1", "1007258461")).toBe("RAD-1");
  });
});
