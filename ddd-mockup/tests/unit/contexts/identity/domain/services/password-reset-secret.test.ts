import { describe, expect, it } from "vitest";
import {
  hashResetCode,
  hashResetToken,
  sameHash,
} from "../../../../../../src/contexts/identity/domain/services/password-reset-secret.ts";

const SHA256_HEX = /^[0-9a-f]{64}$/;

describe("secretos de recuperación de contraseña", () => {
  it("el hash del token es determinista y no contiene el token", () => {
    const hash = hashResetToken("un-token-largo");

    expect(hash).toMatch(SHA256_HEX);
    expect(hash).toBe(hashResetToken("un-token-largo"));
    expect(hash).not.toBe(hashResetToken("otro-token-largo"));
    expect(hash).not.toContain("un-token-largo");
  });

  it("el hash del código depende de la solicitud: el mismo código no se repite entre solicitudes", () => {
    expect(hashResetCode("solicitud-1", "123456")).toMatch(SHA256_HEX);
    expect(hashResetCode("solicitud-1", "123456")).toBe(hashResetCode("solicitud-1", "123456"));
    expect(hashResetCode("solicitud-1", "123456")).not.toBe(hashResetCode("solicitud-2", "123456"));
    expect(hashResetCode("solicitud-1", "123456")).not.toBe(hashResetCode("solicitud-1", "654321"));
  });

  it("sameHash compara dos hashes, también de distinta longitud", () => {
    const hash = hashResetToken("token");

    expect(sameHash(hash, hashResetToken("token"))).toBe(true);
    expect(sameHash(hash, hashResetToken("otro"))).toBe(false);
    expect(sameHash(hash, hash.slice(0, 10))).toBe(false);
    expect(sameHash("", "")).toBe(true);
  });
});
