import { describe, expect, it } from "vitest";
import { AppError } from "../../../src/shared/errors/app-error.ts";
import { toProblem } from "../../../src/shared/http/problem.ts";

describe("toProblem (ampliaciones)", () => {
  it("traduce payload_too_large a 413", () => {
    const { status, body } = toProblem(new AppError("payload_too_large"), "es");
    expect(status).toBe(413);
    expect(body).toMatchObject({ code: "PAYLOAD_TOO_LARGE", title: "Payload Too Large" });
  });

  it("incluye la lista de errores por campo cuando el error trae issues", () => {
    const error = new AppError("validation", {
      details: {
        issues: [
          { field: "email", code: "invalid_format" },
          { field: "age", code: "too_small" },
        ],
      },
    });
    expect(toProblem(error, "es").body.errors).toEqual([
      { field: "email", code: "invalid_format" },
      { field: "age", code: "too_small" },
    ]);
  });

  it("ignora los issues mal formados", () => {
    const error = new AppError("validation", {
      details: { issues: [{ field: 1 }, "x", null, { field: "ok", code: "c" }] },
    });
    expect(toProblem(error, "es").body.errors).toEqual([{ field: "ok", code: "c" }]);
  });

  it("no añade errors cuando no hay issues", () => {
    expect(toProblem(new AppError("validation"), "es").body).not.toHaveProperty("errors");
  });
});
