import { beforeEach, describe, expect, it } from "vitest";
import { IssueSession } from "../../../../src/contexts/identity/application/commands/issue-session.command.ts";
import { RequestPasswordReset } from "../../../../src/contexts/identity/application/commands/request-password-reset.command.ts";
import { ResetPassword } from "../../../../src/contexts/identity/application/commands/reset-password.command.ts";
import { User } from "../../../../src/contexts/identity/domain/aggregates/user.ts";
import { AppError } from "../../../../src/shared/errors/app-error.ts";
import { FakePasswordHasher, InMemoryUserRepository } from "../../../helpers/fakes.ts";
import {
  identityEventBus,
  InMemoryPasswordResetRepository,
  RecordingPasswordResetNotifier,
} from "../../../helpers/password-reset-fakes.ts";
import {
  FakeAccessTokenService,
  InMemoryRefreshTokenRepository,
} from "../../../helpers/session-fakes.ts";

const NEW_PASSWORD = "otra-clave-bastante-larga";
const START = new Date("2026-11-15T10:00:00Z");

async function codeOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof AppError) return `${error.kind}:${error.code}`;
    throw error;
  }
  return "sin error";
}

describe("recuperación de contraseña", () => {
  let users: InMemoryUserRepository;
  let resets: InMemoryPasswordResetRepository;
  let refreshTokens: InMemoryRefreshTokenRepository;
  let notifier: RecordingPasswordResetNotifier;
  let hasher: FakePasswordHasher;
  let clock: Date;
  let request: RequestPasswordReset;
  let reset: ResetPassword;
  let user: User;

  const advance = (minutes: number) => {
    clock = new Date(clock.getTime() + minutes * 60_000);
  };

  beforeEach(async () => {
    refreshTokens = new InMemoryRefreshTokenRepository();
    notifier = new RecordingPasswordResetNotifier();
    const events = identityEventBus({ notifier, refreshTokens });
    users = new InMemoryUserRepository(events);
    resets = new InMemoryPasswordResetRepository(events);
    hasher = new FakePasswordHasher();
    clock = START;
    const now = () => clock;
    request = new RequestPasswordReset({
      users,
      resets,
      linkTtlSeconds: 30 * 60,
      codeTtlSeconds: 10 * 60,
      now,
    });
    reset = new ResetPassword({ users, resets, hasher, now });
    user = User.create({
      email: "ana@example.com",
      passwordHash: "hashed:la-clave-anterior-larga",
      firstName: "Ana",
      lastName: "Gómez",
      locale: "en",
    });
    await users.add(user);
  });

  describe("solicitud", () => {
    it("con enlace: notifica un token largo y guarda solo su hash", async () => {
      await request.execute({ email: " Ana@Example.com ", method: "link" });

      const message = notifier.last();
      expect(message).toMatchObject({
        email: "ana@example.com",
        firstName: "Ana",
        locale: "en",
        method: "link",
        expiresAt: new Date("2026-11-15T10:30:00Z"),
      });
      expect(message.secret.length).toBeGreaterThanOrEqual(43);
      const [stored] = resets.all();
      expect(stored?.method).toBe("link");
      expect(stored?.secretHash).toMatch(/^[0-9a-f]{64}$/);
      expect(JSON.stringify(stored)).not.toContain(message.secret);
    });

    it("con código: notifica 6 dígitos que caducan antes y guarda solo su hash", async () => {
      await request.execute({ email: "ana@example.com", method: "code" });

      const message = notifier.last();
      expect(message.method).toBe("code");
      expect(message.secret).toMatch(/^\d{6}$/);
      expect(message.expiresAt).toEqual(new Date("2026-11-15T10:10:00Z"));
      expect(JSON.stringify(resets.all())).not.toContain(message.secret);
    });

    it("no hace nada si el correo no existe, sin lanzar error", async () => {
      await request.execute({ email: "nadie@example.com", method: "link" });

      expect(notifier.sent).toEqual([]);
      expect(resets.all()).toEqual([]);
    });

    it("no hace nada si la cuenta está inactiva", async () => {
      await users.update(user.deactivate());

      await request.execute({ email: "ana@example.com", method: "code" });

      expect(notifier.sent).toEqual([]);
    });

    it("una solicitud nueva invalida la anterior", async () => {
      await request.execute({ email: "ana@example.com", method: "link" });
      const first = notifier.last().secret;
      await request.execute({ email: "ana@example.com", method: "link" });

      expect(resets.all()).toHaveLength(1);
      const result = reset.execute({ method: "link", token: first, password: NEW_PASSWORD });
      expect(await codeOf(result)).toBe("validation:INVALID_RESET_TOKEN");
    });
  });

  describe("cambio con enlace", () => {
    let token: string;

    beforeEach(async () => {
      await request.execute({ email: "ana@example.com", method: "link" });
      token = notifier.last().secret;
    });

    it("cambia la contraseña guardando su hash", async () => {
      await reset.execute({ method: "link", token, password: NEW_PASSWORD });

      const stored = await users.findByEmail("ana@example.com");
      expect(stored?.passwordHash).toBe(`hashed:${NEW_PASSWORD}`);
      expect(stored?.updatedAt).toEqual(START);
    });

    it("cierra todas las sesiones del usuario y deja intactas las de otros", async () => {
      const other = User.create({
        email: "luis@example.com",
        passwordHash: "hash",
        firstName: "Luis",
        lastName: "Pérez",
      });
      await users.add(other);
      const issue = new IssueSession({
        tokens: refreshTokens,
        accessTokens: new FakeAccessTokenService(),
        refreshTtlSeconds: 3600,
      });
      await issue.execute(user.publicId);
      await issue.execute(user.publicId);
      await issue.execute(other.publicId);

      await reset.execute({ method: "link", token, password: NEW_PASSWORD });

      const revoked = refreshTokens.all().filter((item) => item.revokedAt !== null);
      expect(revoked.map((item) => item.userPublicId)).toEqual([user.publicId, user.publicId]);
    });

    it("el token es de un solo uso", async () => {
      await reset.execute({ method: "link", token, password: NEW_PASSWORD });

      const again = reset.execute({ method: "link", token, password: "una-tercera-clave-larga" });
      expect(await codeOf(again)).toBe("validation:INVALID_RESET_TOKEN");
    });

    it("rechaza un token desconocido", async () => {
      const result = reset.execute({ method: "link", token: "no-existe", password: NEW_PASSWORD });

      expect(await codeOf(result)).toBe("validation:INVALID_RESET_TOKEN");
    });

    it("rechaza un token caducado", async () => {
      advance(30);

      const result = reset.execute({ method: "link", token, password: NEW_PASSWORD });
      expect(await codeOf(result)).toBe("validation:INVALID_RESET_TOKEN");
    });

    it("rechaza una contraseña débil sin consumir el token", async () => {
      const weak = reset.execute({ method: "link", token, password: "corta" });
      expect(await codeOf(weak)).toBe("validation:WEAK_PASSWORD");

      await reset.execute({ method: "link", token, password: NEW_PASSWORD });
      expect((await users.findByEmail("ana@example.com"))?.passwordHash).toBe(
        `hashed:${NEW_PASSWORD}`,
      );
    });

    it("rechaza el token si la cuenta se desactivó después de pedirlo", async () => {
      await users.update(user.deactivate());

      const result = reset.execute({ method: "link", token, password: NEW_PASSWORD });
      expect(await codeOf(result)).toBe("validation:INVALID_RESET_TOKEN");
    });

    it("un token de enlace no sirve como código", async () => {
      const result = reset.execute({
        method: "code",
        email: "ana@example.com",
        code: token,
        password: NEW_PASSWORD,
      });

      expect(await codeOf(result)).toBe("validation:INVALID_RESET_CODE");
    });
  });

  describe("cambio con código", () => {
    let code: string;
    const withCode = (value: string, email = "ana@example.com") =>
      reset.execute({ method: "code", email, code: value, password: NEW_PASSWORD });
    const wrongCode = () => (code === "000000" ? "000001" : "000000");

    beforeEach(async () => {
      await request.execute({ email: "ana@example.com", method: "code" });
      code = notifier.last().secret;
    });

    it("cambia la contraseña con el código correcto", async () => {
      await withCode(code, " ANA@example.com ");

      expect((await users.findByEmail("ana@example.com"))?.passwordHash).toBe(
        `hashed:${NEW_PASSWORD}`,
      );
    });

    it("el código es de un solo uso", async () => {
      await withCode(code);

      expect(await codeOf(withCode(code))).toBe("validation:INVALID_RESET_CODE");
    });

    it("rechaza un código incorrecto y uno de un correo desconocido con el mismo error", async () => {
      expect(await codeOf(withCode(wrongCode()))).toBe("validation:INVALID_RESET_CODE");
      expect(await codeOf(withCode(code, "nadie@example.com"))).toBe(
        "validation:INVALID_RESET_CODE",
      );
    });

    it("rechaza un código caducado", async () => {
      advance(10);

      expect(await codeOf(withCode(code))).toBe("validation:INVALID_RESET_CODE");
    });

    it("tras 5 intentos fallidos el código queda bloqueado, aunque luego sea el correcto", async () => {
      for (let attempt = 0; attempt < 5; attempt += 1) {
        expect(await codeOf(withCode(wrongCode()))).toBe("validation:INVALID_RESET_CODE");
      }

      expect(await codeOf(withCode(code))).toBe("validation:INVALID_RESET_CODE");
      expect((await users.findByEmail("ana@example.com"))?.passwordHash).toBe(
        "hashed:la-clave-anterior-larga",
      );
    });

    it("una contraseña débil no gasta intentos", async () => {
      for (let attempt = 0; attempt < 6; attempt += 1) {
        const weak = reset.execute({
          method: "code",
          email: "ana@example.com",
          code,
          password: "corta",
        });
        expect(await codeOf(weak)).toBe("validation:WEAK_PASSWORD");
      }

      await withCode(code);
      expect((await users.findByEmail("ana@example.com"))?.passwordHash).toBe(
        `hashed:${NEW_PASSWORD}`,
      );
    });
  });
});
