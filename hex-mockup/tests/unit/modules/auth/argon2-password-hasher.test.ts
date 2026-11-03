import { describe, expect, it } from "vitest";
import { Argon2PasswordHasher } from "../../../../src/modules/auth/infrastructure/security/argon2-password-hasher.ts";

describe("Argon2PasswordHasher", () => {
  const hasher = new Argon2PasswordHasher();

  it("genera un hash argon2id distinto en cada llamada (sal aleatoria)", async () => {
    const [a, b] = await Promise.all([
      hasher.hash("una-clave-larga-1"),
      hasher.hash("una-clave-larga-1"),
    ]);
    expect(a).toMatch(/^\$argon2id\$/);
    expect(a).not.toBe(b);
  });

  it("verifica la clave correcta y rechaza la incorrecta", async () => {
    const hash = await hasher.hash("una-clave-larga-1");
    expect(await hasher.verify(hash, "una-clave-larga-1")).toBe(true);
    expect(await hasher.verify(hash, "una-clave-larga-2")).toBe(false);
  });

  it("devuelve false ante un hash mal formado en vez de lanzar", async () => {
    expect(await hasher.verify("esto-no-es-un-hash", "cualquier-clave")).toBe(false);
  });
});
