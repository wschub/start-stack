import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../../src/app.ts";
import { RequestPasswordReset } from "../../src/modules/auth/application/use-cases/request-password-reset.use-case.ts";
import { ResetPassword } from "../../src/modules/auth/application/use-cases/reset-password.use-case.ts";
import {
  createPasswordRouter,
  type PasswordRateLimits,
} from "../../src/modules/auth/presentation/routes/password.routes.ts";
import { User } from "../../src/modules/users/domain/entities/user.entity.ts";
import { FakePasswordHasher, InMemoryUserRepository } from "../helpers/fakes.ts";
import {
  InMemoryPasswordResetRepository,
  RecordingPasswordResetNotifier,
} from "../helpers/password-reset-fakes.ts";
import { InMemoryRefreshTokenRepository } from "../helpers/session-fakes.ts";

const NEW_PASSWORD = "otra-clave-bastante-larga";

async function build(rateLimits?: Partial<PasswordRateLimits>) {
  const users = new InMemoryUserRepository();
  const resets = new InMemoryPasswordResetRepository();
  const notifier = new RecordingPasswordResetNotifier();
  const router = createPasswordRouter({
    requestPasswordReset: new RequestPasswordReset({
      users,
      resets,
      notifier,
      linkTtlSeconds: 1800,
      codeTtlSeconds: 600,
    }),
    resetPassword: new ResetPassword({
      users,
      resets,
      refreshTokens: new InMemoryRefreshTokenRepository(),
      hasher: new FakePasswordHasher(),
    }),
    rateLimits,
  });
  await users.add(
    User.create({
      email: "ana@example.com",
      passwordHash: "hashed:la-clave-anterior-larga",
      firstName: "Ana",
      lastName: "Gómez",
    }),
  );
  return { app: createApp({ routers: [router] }), users, notifier, resets };
}

describe("POST /auth/password/forgot", () => {
  it("responde 202 sin cuerpo y envía un enlace por defecto", async () => {
    const { app, notifier } = await build();

    const res = await request(app).post("/auth/password/forgot").send({ email: "ana@example.com" });

    expect(res.status).toBe(202);
    expect(res.text).toBe("");
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(notifier.last().method).toBe("link");
  });

  it("envía un código de 6 dígitos si se pide method=code", async () => {
    const { app, notifier } = await build();

    const res = await request(app)
      .post("/auth/password/forgot")
      .send({ email: "ana@example.com", method: "code" });

    expect(res.status).toBe(202);
    expect(notifier.last().secret).toMatch(/^\d{6}$/);
  });

  it("responde igual si el correo no existe, sin enviar nada", async () => {
    const { app, notifier } = await build();

    const res = await request(app)
      .post("/auth/password/forgot")
      .send({ email: "nadie@example.com" });

    expect(res.status).toBe(202);
    expect(res.text).toBe("");
    expect(notifier.sent).toEqual([]);
  });

  it("nunca devuelve el token ni el código en la respuesta", async () => {
    const { app, notifier } = await build();

    const res = await request(app)
      .post("/auth/password/forgot")
      .send({ email: "ana@example.com", method: "code" });

    expect(JSON.stringify([res.body, res.headers])).not.toContain(notifier.last().secret);
  });

  it.each([
    ["sin correo", {}],
    ["con un método desconocido", { email: "ana@example.com", method: "sms" }],
    ["con campos desconocidos", { email: "ana@example.com", role: "admin" }],
  ])("rechaza la petición %s", async (_name, body) => {
    const { app, notifier } = await build();

    const res = await request(app).post("/auth/password/forgot").send(body);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
    expect(notifier.sent).toEqual([]);
  });

  it("limita las solicitudes por cuenta, aunque cambie la forma de escribir el correo", async () => {
    const { app, notifier } = await build({ forgotPerAccount: { windowMs: 60_000, max: 2 } });
    const send = (email: string) => request(app).post("/auth/password/forgot").send({ email });

    expect((await send("ana@example.com")).status).toBe(202);
    expect((await send(" ANA@example.com")).status).toBe(202);
    const blocked = await send("Ana@Example.com");

    expect(blocked.status).toBe(429);
    expect(blocked.body.code).toBe("TOO_MANY_REQUESTS");
    expect(blocked.headers["retry-after"]).toBeDefined();
    expect(notifier.sent).toHaveLength(2);
  });

  it("limita las solicitudes por IP", async () => {
    const { app } = await build({ forgot: { windowMs: 60_000, max: 1 } });

    await request(app).post("/auth/password/forgot").send({ email: "a@example.com" });
    const blocked = await request(app)
      .post("/auth/password/forgot")
      .send({ email: "b@example.com" });

    expect(blocked.status).toBe(429);
  });
});

describe("POST /auth/password/reset", () => {
  it("cambia la contraseña con el token del enlace y responde 204", async () => {
    const { app, users, notifier } = await build();
    await request(app).post("/auth/password/forgot").send({ email: "ana@example.com" });

    const res = await request(app)
      .post("/auth/password/reset")
      .send({ token: notifier.last().secret, password: NEW_PASSWORD });

    expect(res.status).toBe(204);
    expect((await users.findByEmail("ana@example.com"))?.passwordHash).toBe(
      `hashed:${NEW_PASSWORD}`,
    );
  });

  it("cambia la contraseña con el correo y el código", async () => {
    const { app, users, notifier } = await build();
    await request(app)
      .post("/auth/password/forgot")
      .send({ email: "ana@example.com", method: "code" });

    const res = await request(app)
      .post("/auth/password/reset")
      .send({ email: "ana@example.com", code: notifier.last().secret, password: NEW_PASSWORD });

    expect(res.status).toBe(204);
    expect((await users.findByEmail("ana@example.com"))?.passwordHash).toBe(
      `hashed:${NEW_PASSWORD}`,
    );
  });

  it("responde 400 INVALID_RESET_TOKEN, traducido, con un token que no existe", async () => {
    const { app } = await build();

    const res = await request(app)
      .post("/auth/password/reset")
      .set("Accept-Language", "en")
      .send({ token: "no-existe", password: NEW_PASSWORD });

    expect(res.status).toBe(400);
    expect(res.headers["content-type"]).toContain("application/problem+json");
    expect(res.body.code).toBe("INVALID_RESET_TOKEN");
    expect(res.body.detail).toBe("The reset link is not valid or has expired. Request a new one.");
  });

  it("responde 400 INVALID_RESET_CODE con un código incorrecto", async () => {
    const { app, notifier } = await build();
    await request(app)
      .post("/auth/password/forgot")
      .send({ email: "ana@example.com", method: "code" });
    const wrong = notifier.last().secret === "000000" ? "000001" : "000000";

    const res = await request(app)
      .post("/auth/password/reset")
      .send({ email: "ana@example.com", code: wrong, password: NEW_PASSWORD });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("INVALID_RESET_CODE");
    expect(res.body.detail).toBe("El código no es válido o ha caducado. Solicita uno nuevo.");
  });

  it("responde 400 WEAK_PASSWORD si la contraseña nueva es corta", async () => {
    const { app, notifier } = await build();
    await request(app).post("/auth/password/forgot").send({ email: "ana@example.com" });

    const res = await request(app)
      .post("/auth/password/reset")
      .send({ token: notifier.last().secret, password: "corta" });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("WEAK_PASSWORD");
  });

  it.each([
    ["sin token ni código", { password: NEW_PASSWORD }],
    [
      "con token y código a la vez",
      { token: "t", email: "a@b.co", code: "123456", password: NEW_PASSWORD },
    ],
    [
      "con un código que no son 6 dígitos",
      { email: "a@b.co", code: "12ab", password: NEW_PASSWORD },
    ],
    ["sin contraseña", { token: "t" }],
    ["con campos desconocidos", { token: "t", password: NEW_PASSWORD, status: "ACTIVE" }],
  ])("rechaza el cuerpo %s", async (_name, body) => {
    const { app } = await build();

    const res = await request(app).post("/auth/password/reset").send(body);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
  });

  it("limita los intentos por IP", async () => {
    const { app } = await build({ reset: { windowMs: 60_000, max: 2 } });
    const attempt = () =>
      request(app).post("/auth/password/reset").send({ token: "x", password: NEW_PASSWORD });

    await attempt();
    await attempt();

    expect((await attempt()).status).toBe(429);
  });
});
