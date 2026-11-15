import { beforeEach, describe, expect, it } from "vitest";
import { ChangeUserStatus } from "../../../../../../src/contexts/identity/application/commands/change-user-status.command.ts";
import { RegisterUser } from "../../../../../../src/contexts/identity/application/commands/register-user.command.ts";
import { RequestPasswordReset } from "../../../../../../src/contexts/identity/application/commands/request-password-reset.command.ts";
import { ResetPassword } from "../../../../../../src/contexts/identity/application/commands/reset-password.command.ts";
import { RecordingEventBus } from "../../../../../helpers/event-fakes.ts";
import { FakePasswordHasher, InMemoryUserRepository } from "../../../../../helpers/fakes.ts";
import { InMemoryPasswordResetRepository } from "../../../../../helpers/password-reset-fakes.ts";
import { InMemoryRoleRepository } from "../../../../../helpers/role-fakes.ts";

const NOW = new Date("2026-11-15T10:00:00Z");
const ADMIN = "99999999-9999-4999-8999-999999999999";
const input = {
  email: "ana@example.com",
  password: "una-clave-bastante-larga",
  firstName: "Ana",
  lastName: "Gómez",
};

/** Qué eventos de dominio publica cada comando al guardar sus agregados. */
describe("eventos de dominio que publican los comandos", () => {
  let events: RecordingEventBus;
  let users: InMemoryUserRepository;
  let resets: InMemoryPasswordResetRepository;
  let hasher: FakePasswordHasher;
  let register: RegisterUser;

  beforeEach(() => {
    events = new RecordingEventBus();
    users = new InMemoryUserRepository(events);
    resets = new InMemoryPasswordResetRepository(events);
    hasher = new FakePasswordHasher();
    register = new RegisterUser({ users, hasher });
  });

  it("RegisterUser publica user.registered una vez guardado el usuario", async () => {
    const user = await register.execute(input);

    expect(events.published).toMatchObject([
      { name: "user.registered", userId: user.publicId, email: "ana@example.com", locale: "es" },
    ]);
  });

  it("un registro rechazado no publica nada", async () => {
    await register.execute(input);
    events.published.length = 0;

    await expect(register.execute(input)).rejects.toMatchObject({ code: "EMAIL_ALREADY_EXISTS" });
    await expect(register.execute({ ...input, email: "no-es-email" })).rejects.toMatchObject({
      code: "INVALID_EMAIL",
    });

    expect(events.published).toEqual([]);
  });

  it("ChangeUserStatus publica user.status_changed solo cuando el estado cambia", async () => {
    const user = await register.execute(input);
    const change = new ChangeUserStatus({
      users,
      roles: new InMemoryRoleRepository(users),
      now: () => NOW,
    });
    const by = { actorPublicId: ADMIN, userPublicId: user.publicId };
    events.published.length = 0;

    await change.execute({ ...by, status: "ACTIVE" });
    expect(events.published).toEqual([]);

    await change.execute({ ...by, status: "INACTIVE" });
    expect(events.published).toEqual([
      { name: "user.status_changed", occurredAt: NOW, userId: user.publicId, status: "INACTIVE" },
    ]);
  });

  it("RequestPasswordReset publica password_reset.requested con el secreto, y nada si la cuenta no existe", async () => {
    const user = await register.execute(input);
    const request = new RequestPasswordReset({
      users,
      resets,
      linkTtlSeconds: 30 * 60,
      codeTtlSeconds: 10 * 60,
      now: () => NOW,
    });
    events.published.length = 0;

    await request.execute({ email: "nadie@example.com", method: "link" });
    expect(events.published).toEqual([]);

    await request.execute({ email: "ana@example.com", method: "code" });
    expect(events.published).toMatchObject([
      { name: "password_reset.requested", userId: user.publicId, method: "code" },
    ]);
    expect(events.published[0]).toHaveProperty("secret", expect.stringMatching(/^\d{6}$/));
  });

  it("ResetPassword publica user.password_changed, sin repetir eventos anteriores del usuario", async () => {
    const user = await register.execute(input);
    const now = () => NOW;
    const request = new RequestPasswordReset({
      users,
      resets,
      linkTtlSeconds: 30 * 60,
      codeTtlSeconds: 10 * 60,
      now,
    });
    await request.execute({ email: "ana@example.com", method: "link" });
    const token = (events.published.at(-1) as unknown as { secret: string }).secret;
    events.published.length = 0;

    await new ResetPassword({ users, resets, hasher, now }).execute({
      method: "link",
      token,
      password: "otra-clave-bastante-larga",
    });

    expect(events.published).toEqual([
      { name: "user.password_changed", occurredAt: NOW, userId: user.publicId },
    ]);
  });
});
