import { describe, expect, it } from "vitest";
import { AppError } from "../../../src/shared/errors/app-error.ts";
import { normalizeError } from "../../../src/shared/http/normalize-error.ts";

class PrismaClientKnownRequestError extends Error {
  readonly code: string;

  constructor(code: string) {
    super("Can't reach database server at 127.0.0.1:55432");
    this.name = "PrismaClientKnownRequestError";
    this.code = code;
  }
}

describe("normalizeError", () => {
  it.each(["P1001", "P1002", "P1008", "P1017"])(
    "traduce el error de conectividad %s de Prisma a service_unavailable",
    (code) => {
      expect(normalizeError(new PrismaClientKnownRequestError(code))).toMatchObject({
        kind: "service_unavailable",
        code: "SERVICE_UNAVAILABLE",
      });
    },
  );

  it("conserva el error original como causa", () => {
    const original = new PrismaClientKnownRequestError("P1001");
    const result = normalizeError(original);
    expect(result).toBeInstanceOf(AppError);
    expect((result as AppError).cause).toBe(original);
  });

  it("no toca otros errores de Prisma, como una violación de unicidad", () => {
    const error = new PrismaClientKnownRequestError("P2002");
    expect(normalizeError(error)).toBe(error);
  });

  it("no toca errores ajenos ni valores que no son objetos", () => {
    const error = new Error("otro");
    expect(normalizeError(error)).toBe(error);
    expect(normalizeError("texto")).toBe("texto");
    expect(normalizeError(undefined)).toBeUndefined();
  });

  it("sigue traduciendo los errores de lectura del cuerpo", () => {
    expect(normalizeError({ type: "entity.parse.failed" })).toMatchObject({ code: "INVALID_JSON" });
    expect(normalizeError({ type: "entity.too.large" })).toMatchObject({
      kind: "payload_too_large",
    });
  });
});
