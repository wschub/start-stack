import { describe, expect, it } from "vitest";
import { z } from "zod";
import { AppError } from "../../../../src/entities/errors/app-error.ts";
import { parseBody } from "../../../../src/interface-adapters/http/parse-body.ts";

const schema = z.object({
  email: z.string().email(),
  age: z.number().int().min(18),
  nested: z.object({ name: z.string() }),
});

function errorOf(action: () => unknown): AppError {
  try {
    action();
  } catch (error) {
    if (error instanceof AppError) return error;
    throw error;
  }
  throw new Error("no lanzó ningún error");
}

describe("parseBody", () => {
  it("devuelve los datos ya validados", () => {
    const body = { email: "ana@example.com", age: 30, nested: { name: "Ana" } };
    expect(parseBody(schema, body)).toEqual(body);
  });

  it("lanza VALIDATION_ERROR con el campo y el código de cada problema", () => {
    const error = errorOf(() => parseBody(schema, { email: 1, age: 5, nested: {} }));
    expect(error.kind).toBe("validation");
    expect(error.code).toBe("VALIDATION_ERROR");
    expect(error.details?.issues).toEqual(
      expect.arrayContaining([
        { field: "email", code: expect.any(String) },
        { field: "age", code: expect.any(String) },
        { field: "nested.name", code: expect.any(String) },
      ]),
    );
  });

  it("no incluye los valores recibidos", () => {
    const error = errorOf(() =>
      parseBody(schema, { email: "no-es-email-secreto", age: 5, nested: { name: "x" } }),
    );
    expect(JSON.stringify(error.details)).not.toContain("secreto");
  });

  it("trata un cuerpo ausente como un objeto vacío", () => {
    const error = errorOf(() => parseBody(schema, undefined));
    const fields = (error.details?.issues as { field: string }[]).map((issue) => issue.field);
    expect(fields).toEqual(expect.arrayContaining(["email", "age", "nested"]));
  });
});
