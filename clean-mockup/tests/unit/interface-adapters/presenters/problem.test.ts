import { describe, expect, it } from "vitest";
import { AppError, type ErrorKind } from "../../../../src/entities/errors/app-error.ts";
import { toProblem } from "../../../../src/interface-adapters/presenters/problem.ts";

describe("toProblem", () => {
  it.each<[ErrorKind, number, string]>([
    ["validation", 400, "VALIDATION_ERROR"],
    ["unauthenticated", 401, "UNAUTHENTICATED"],
    ["forbidden", 403, "FORBIDDEN"],
    ["not_found", 404, "NOT_FOUND"],
    ["conflict", 409, "CONFLICT"],
  ])("traduce %s a %i con el código %s", (kind, status, code) => {
    const { status: s, body } = toProblem(new AppError(kind), "es");
    expect(s).toBe(status);
    expect(body).toMatchObject({ type: "about:blank", status, code });
  });

  it("conserva el código propio y usa el mensaje genérico si no hay traducción", () => {
    const { body } = toProblem(new AppError("conflict", { code: "UNTRANSLATED_CODE" }), "en");
    expect(body.code).toBe("UNTRANSLATED_CODE");
    expect(body.detail).toBe("The request conflicts with the current state of the resource.");
  });

  it("traduce el mensaje según el idioma", () => {
    expect(toProblem(new AppError("not_found"), "es").body.detail).toBe(
      "No se encontró el recurso solicitado.",
    );
    expect(toProblem(new AppError("not_found"), "en").body.detail).toBe(
      "The requested resource was not found.",
    );
  });

  it("convierte un error desconocido en 500 sin exponer su mensaje", () => {
    const { status, body } = toProblem(new Error("password=hex"), "es");
    expect(status).toBe(500);
    expect(body.code).toBe("INTERNAL_ERROR");
    expect(JSON.stringify(body)).not.toContain("password");
  });
});
