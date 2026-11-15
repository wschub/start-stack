import { describe, expect, it } from "vitest";
import { hashRefreshToken } from "../../../../../../src/contexts/identity/domain/services/refresh-token-hash.ts";

describe("hashRefreshToken", () => {
  it("devuelve un SHA-256 determinista que no contiene el token", () => {
    const hash = hashRefreshToken("token-de-sesion");

    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).toBe(hashRefreshToken("token-de-sesion"));
    expect(hash).not.toContain("token-de-sesion");
  });

  it("tokens distintos dan hashes distintos", () => {
    expect(hashRefreshToken("a")).not.toBe(hashRefreshToken("b"));
  });
});
