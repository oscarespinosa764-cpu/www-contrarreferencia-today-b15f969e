import { describe, expect, it } from "vitest";
import { clasificarErrorAuth, mensajeLogin } from "./login-errores";

describe("clasificarErrorAuth", () => {
  it("credenciales inválidas", () => {
    expect(
      clasificarErrorAuth({
        status: 400,
        code: "invalid_credentials",
        message: "Invalid login credentials",
      }),
    ).toBe("AUTH_INVALID_CREDENTIALS");
  });

  it("límite de intentos", () => {
    expect(clasificarErrorAuth({ status: 429, code: "over_request_rate_limit" })).toBe(
      "AUTH_RATE_LIMIT",
    );
  });

  it("usuario bloqueado", () => {
    expect(clasificarErrorAuth({ status: 403, code: "user_banned" })).toBe("AUTH_USER_BANNED");
  });

  it("fallo de red", () => {
    expect(
      clasificarErrorAuth({ name: "AuthRetryableFetchError", message: "Failed to fetch" }),
    ).toBe("RED");
  });

  it("error interno por defecto", () => {
    expect(clasificarErrorAuth({ message: "algo raro" })).toBe("INTERNO");
  });

  it("mensajes diferenciados", () => {
    expect(mensajeLogin("USUARIO_INACTIVO")).not.toBe(mensajeLogin("AUTH_INVALID_CREDENTIALS"));
    expect(mensajeLogin("TURNO_NO_PERMITIDO")).toContain("turno");
  });
});
