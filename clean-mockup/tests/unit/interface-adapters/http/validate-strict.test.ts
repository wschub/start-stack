import { describe, expect, it } from "vitest";
import { z } from "zod";
import { AppError } from "../../../../src/entities/errors/app-error.ts";
import { parseBody } from "../../../../src/interface-adapters/http/parse-body.ts";

function issuesOf(action: () => unknown): { field: string; code: string }[] {
  try {
    action();
  } catch (error) {
    if (error instanceof AppError)
      return error.details?.issues as { field: string; code: string }[];
    throw error;
  }
  throw new Error("no lanzó ningún error");
}

describe("parseBody con esquemas estrictos", () => {
  const schema = z.object({ email: z.string() }).strict();

  it("nombra cada campo desconocido en vez de dejar el campo vacío", () => {
    const issues = issuesOf(() => parseBody(schema, { email: "a", status: "x", role: "admin" }));
    expect(issues).toEqual(
      expect.arrayContaining([
        { field: "status", code: "unrecognized_key" },
        { field: "role", code: "unrecognized_key" },
      ]),
    );
    expect(issues.every((issue) => issue.field !== "")).toBe(true);
  });

  it("llama body al error de la raíz del cuerpo", () => {
    expect(issuesOf(() => parseBody(schema, "texto"))).toEqual([
      { field: "body", code: "invalid_type" },
    ]);
  });
});
