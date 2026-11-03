import { describe, expect, it } from "vitest";
import { JoseAccessTokenService } from "../../../../src/modules/auth/infrastructure/security/jose-access-token-service.ts";

const SECRET = "0123456789abcdef0123456789abcdef";
const T0 = new Date("2026-01-01T00:00:00Z");

const service = (
  overrides: Partial<ConstructorParameters<typeof JoseAccessTokenService>[0]> = {},
) =>
  new JoseAccessTokenService({
    secret: SECRET,
    issuer: "hex-mockup",
    audience: "hex-mockup-api",
    ttlSeconds: 900,
    now: () => T0,
    ...overrides,
  });

describe("JoseAccessTokenService", () => {
  it("emite un token y lo verifica devolviendo el sujeto", async () => {
    const issued = await service().issue("user-123");
    expect(issued.expiresInSeconds).toBe(900);
    expect(await service().verify(issued.token)).toEqual({ subject: "user-123" });
  });

  it("rechaza un token expirado con TOKEN_EXPIRED", async () => {
    const { token } = await service().issue("user-123");
    const later = service({ now: () => new Date(T0.getTime() + 901_000) });
    await expect(later.verify(token)).rejects.toMatchObject({
      kind: "unauthenticated",
      code: "TOKEN_EXPIRED",
    });
  });

  it("rechaza un token manipulado con INVALID_TOKEN", async () => {
    const { token } = await service().issue("user-123");
    const [header, , signature] = token.split(".");
    const payload = Buffer.from(JSON.stringify({ sub: "atacante" })).toString("base64url");
    await expect(service().verify(`${header}.${payload}.${signature}`)).rejects.toMatchObject({
      code: "INVALID_TOKEN",
    });
  });

  it("rechaza un token firmado con otro secreto", async () => {
    const { token } = await service({ secret: "f".repeat(32) }).issue("user-123");
    await expect(service().verify(token)).rejects.toMatchObject({ code: "INVALID_TOKEN" });
  });

  it("rechaza un token emitido para otra audiencia", async () => {
    const { token } = await service({ audience: "otra-api" }).issue("user-123");
    await expect(service().verify(token)).rejects.toMatchObject({ code: "INVALID_TOKEN" });
  });

  it("rechaza texto que no es un token", async () => {
    await expect(service().verify("basura")).rejects.toMatchObject({ code: "INVALID_TOKEN" });
  });

  it("no acepta un secreto de menos de 32 bytes", () => {
    expect(() => service({ secret: "corto" })).toThrow(/32/);
  });
});
