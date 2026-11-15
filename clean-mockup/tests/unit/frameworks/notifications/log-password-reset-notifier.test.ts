import { describe, expect, it } from "vitest";
import type { PasswordResetMessage } from "../../../../src/use-cases/auth/ports/password-reset-notifier.ts";
import { LogPasswordResetNotifier } from "../../../../src/frameworks/notifications/log-password-reset-notifier.ts";

interface Entry {
  level: "info" | "warn";
  data: object;
  message: string;
}

function build(revealSecret: boolean) {
  const entries: Entry[] = [];
  const logger = {
    info: (data: object, message: string) => entries.push({ level: "info", data, message }),
    warn: (data: object, message: string) => entries.push({ level: "warn", data, message }),
  };
  const notifier = new LogPasswordResetNotifier({
    logger,
    resetUrl: "https://app.example.com/reset-password?lang=es",
    revealSecret,
  });
  return { notifier, entries };
}

const message = (overrides: Partial<PasswordResetMessage> = {}): PasswordResetMessage => ({
  email: "ana@example.com",
  firstName: "Ana",
  locale: "es",
  method: "link",
  secret: "tok/en+con=símbolos",
  expiresAt: new Date("2026-11-15T10:30:00Z"),
  ...overrides,
});

describe("LogPasswordResetNotifier", () => {
  it("en desarrollo escribe el enlace completo, con el token codificado en la URL", async () => {
    const { notifier, entries } = build(true);

    await notifier.notify(message());

    expect(entries).toHaveLength(1);
    expect(entries[0]?.level).toBe("info");
    expect(entries[0]?.data).toEqual({
      to: "ana@example.com",
      method: "link",
      expiresAt: new Date("2026-11-15T10:30:00Z"),
      link: "https://app.example.com/reset-password?lang=es&token=tok%2Fen%2Bcon%3Ds%C3%ADmbolos",
    });
  });

  it("en desarrollo escribe el código cuando el método es code", async () => {
    const { notifier, entries } = build(true);

    await notifier.notify(message({ method: "code", secret: "123456" }));

    expect(entries[0]?.data).toMatchObject({ method: "code", code: "123456" });
  });

  it.each(["link", "code"] as const)(
    "sin revealSecret avisa de que falta un proveedor y no escribe el secreto (%s)",
    async (method) => {
      const { notifier, entries } = build(false);

      await notifier.notify(message({ method, secret: "secreto-123456" }));

      expect(entries).toHaveLength(1);
      expect(entries[0]?.level).toBe("warn");
      expect(JSON.stringify(entries)).not.toContain("secreto-123456");
    },
  );
});
