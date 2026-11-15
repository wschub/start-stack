import { describe, expect, it } from "vitest";
import { AppError } from "../../../src/shared/errors/app-error.ts";
import { toProblem } from "../../../src/shared/http/problem.ts";

describe("toProblem (traducciones específicas)", () => {
  it("usa la traducción propia de un código cuando existe", () => {
    const error = new AppError("conflict", { code: "EMAIL_ALREADY_EXISTS" });
    expect(toProblem(error, "en").body.detail).toBe(
      "An account with this email address already exists.",
    );
    expect(toProblem(error, "es").body.detail).toBe(
      "Ya existe una cuenta con ese correo electrónico.",
    );
  });
});
