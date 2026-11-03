import { describe, expect, it } from "vitest";
import { assertPasswordPolicy } from "../../../../src/modules/auth/domain/services/password-policy.ts";
import { AppError } from "../../../../src/shared/errors/app-error.ts";

function codeOf(action: () => unknown): string | undefined {
  try {
    action();
  } catch (error) {
    return error instanceof AppError ? error.code : "NOT_AN_APP_ERROR";
  }
  return undefined;
}

describe("assertPasswordPolicy", () => {
  it.each(["a".repeat(12), "una frase larga y fácil de recordar", "a".repeat(128)])(
    "acepta una contraseña de longitud válida",
    (password) => {
      expect(codeOf(() => assertPasswordPolicy(password))).toBeUndefined();
    },
  );

  it.each(["", "corta", "a".repeat(11), "a".repeat(129)])(
    "rechaza una contraseña fuera de 12 a 128 caracteres",
    (password) => {
      expect(codeOf(() => assertPasswordPolicy(password))).toBe("WEAK_PASSWORD");
    },
  );
});
