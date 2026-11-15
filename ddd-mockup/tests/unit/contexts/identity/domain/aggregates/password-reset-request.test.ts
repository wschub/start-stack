import { describe, expect, it } from "vitest";
import { PasswordResetRequest } from "../../../../../../src/contexts/identity/domain/aggregates/password-reset-request.ts";
import {
  hashResetCode,
  hashResetToken,
} from "../../../../../../src/contexts/identity/domain/services/password-reset-secret.ts";

const NOW = new Date("2026-11-15T10:00:00Z");
const minutesLater = (minutes: number) => new Date(NOW.getTime() + minutes * 60_000);
const user = {
  publicId: "11111111-1111-4111-8111-111111111111",
  email: "ana@example.com",
  firstName: "Ana",
  locale: "en",
} as const;

const issueLink = () =>
  PasswordResetRequest.issue({
    id: "reset-1",
    user,
    method: "link",
    secret: "un-token-largo",
    ttlSeconds: 30 * 60,
    now: NOW,
  });

const issueCode = () =>
  PasswordResetRequest.issue({
    id: "reset-2",
    user,
    method: "code",
    secret: "123456",
    ttlSeconds: 10 * 60,
    now: NOW,
  });

describe("PasswordResetRequest", () => {
  describe("issue", () => {
    it("nace sin usar, sin intentos y con la caducidad calculada desde ahora", () => {
      expect(issueLink().toProps()).toEqual({
        id: "reset-1",
        userPublicId: user.publicId,
        method: "link",
        secretHash: hashResetToken("un-token-largo"),
        expiresAt: minutesLater(30),
        usedAt: null,
        attempts: 0,
        createdAt: NOW,
      });
    });

    it("guarda solo el hash del secreto: el del código va ligado a la solicitud", () => {
      const reset = issueCode();

      expect(reset.secretHash).toBe(hashResetCode("reset-2", "123456"));
      expect(JSON.stringify(reset.toProps())).not.toContain("123456");
    });

    it("anota el evento password_reset.requested con el secreto en claro para enviarlo", () => {
      expect(issueLink().pullEvents()).toEqual([
        {
          name: "password_reset.requested",
          occurredAt: NOW,
          userId: user.publicId,
          email: "ana@example.com",
          firstName: "Ana",
          locale: "en",
          method: "link",
          secret: "un-token-largo",
          expiresAt: minutesLater(30),
        },
      ]);
    });

    it("los eventos se entregan una sola vez", () => {
      const reset = issueCode();

      expect(reset.pullEvents()).toHaveLength(1);
      expect(reset.pullEvents()).toEqual([]);
    });
  });

  describe("restore", () => {
    it("reconstruye la solicitud guardada sin anotar eventos", () => {
      const restored = PasswordResetRequest.restore(issueLink().toProps());

      expect(restored.toProps()).toEqual(issueLink().toProps());
      expect(restored.pullEvents()).toEqual([]);
    });
  });

  describe("isUsableWith", () => {
    it("sirve con su método mientras no caduque ni se haya usado", () => {
      const reset = issueLink();

      expect(reset.isUsableWith("link", NOW)).toBe(true);
      expect(reset.isUsableWith("link", minutesLater(29))).toBe(true);
    });

    it("no sirve con el otro método", () => {
      expect(issueLink().isUsableWith("code", NOW)).toBe(false);
      expect(issueCode().isUsableWith("link", NOW)).toBe(false);
    });

    it("caduca en el instante exacto de expiresAt", () => {
      const reset = issueCode();

      expect(reset.isExpired(minutesLater(10))).toBe(true);
      expect(reset.isUsableWith("code", minutesLater(10))).toBe(false);
      expect(reset.isExpired(new Date(minutesLater(10).getTime() - 1))).toBe(false);
    });

    it("no sirve si ya se usó", () => {
      const used = PasswordResetRequest.restore({ ...issueLink().toProps(), usedAt: NOW });

      expect(used.isUsableWith("link", NOW)).toBe(false);
    });
  });

  describe("matchesCode", () => {
    it("reconoce su código y rechaza cualquier otro", () => {
      const reset = issueCode();

      expect(reset.matchesCode("123456")).toBe(true);
      expect(reset.matchesCode("123457")).toBe(false);
      expect(reset.matchesCode("")).toBe(false);
    });

    it("una solicitud de enlace nunca coincide con un código, ni con su propio token", () => {
      expect(issueLink().matchesCode("un-token-largo")).toBe(false);
    });
  });

  it("es inmutable", () => {
    expect(Object.isFrozen(issueLink())).toBe(true);
  });
});
