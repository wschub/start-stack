import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../../src/app.ts";
import { AuthenticateUser } from "../../src/modules/auth/application/use-cases/authenticate-user.use-case.ts";
import { IssueSession } from "../../src/modules/auth/application/use-cases/issue-session.use-case.ts";
import { RefreshSession } from "../../src/modules/auth/application/use-cases/refresh-session.use-case.ts";
import { RegisterUser } from "../../src/modules/auth/application/use-cases/register-user.use-case.ts";
import { RevokeSession } from "../../src/modules/auth/application/use-cases/revoke-session.use-case.ts";
import { JoseAccessTokenService } from "../../src/modules/auth/infrastructure/security/jose-access-token-service.ts";
import type { AuthRateLimits } from "../../src/modules/auth/presentation/rate-limits.ts";
import { createAuthRouter } from "../../src/modules/auth/presentation/routes/auth.routes.ts";
import { createSessionRouter } from "../../src/modules/auth/presentation/routes/session.routes.ts";
import { User } from "../../src/modules/users/domain/entities/user.entity.ts";
import { FakePasswordHasher, InMemoryUserRepository } from "../helpers/fakes.ts";
import { InMemoryRefreshTokenRepository } from "../helpers/session-fakes.ts";

const ORIGIN = "https://app.example.com";
const PASSWORD = "una-clave-bastante-larga";
const OPEN = { windowMs: 60_000, max: 1000 };
const tokenOptions = {
  secret: "0123456789abcdef0123456789abcdef-test",
  issuer: "test",
  audience: "test-api",
  ttlSeconds: 3600,
};

function build(limits: Partial<AuthRateLimits> = {}, trustProxy?: number) {
  const users = new InMemoryUserRepository();
  const hasher = new FakePasswordHasher();
  const tokens = new InMemoryRefreshTokenRepository();
  const accessTokens = new JoseAccessTokenService(tokenOptions);
  const issueSession = new IssueSession({ tokens, accessTokens, refreshTtlSeconds: 7 * 24 * 3600 });
  const refreshCookie = { secure: false, sameSite: "strict" } as const;
  const rateLimits: AuthRateLimits = {
    login: OPEN,
    loginPerAccount: OPEN,
    register: OPEN,
    refresh: OPEN,
    ...limits,
  };
  const authRouter = createAuthRouter({
    registerUser: new RegisterUser({ users, hasher }),
    authenticateUser: new AuthenticateUser({ users, hasher }),
    issueSession,
    accessTokens,
    users,
    publicRegistration: true,
    refreshCookie,
    rateLimits,
  });
  const sessionRouter = createSessionRouter({
    refreshSession: new RefreshSession({ tokens, users, issueSession }),
    revokeSession: new RevokeSession({ tokens }),
    refreshCookie,
    allowedOrigins: [ORIGIN],
    refreshRateLimit: rateLimits.refresh,
  });
  return { app: createApp({ routers: [authRouter, sessionRouter], trustProxy }), users };
}

type App = ReturnType<typeof build>["app"];

async function seedUser(users: InMemoryUserRepository): Promise<void> {
  await users.add(
    User.create({
      email: "ana@example.com",
      passwordHash: `hashed:${PASSWORD}`,
      firstName: "Ana",
      lastName: "Gómez",
    }),
  );
}

const loginWith = (app: App, email: string, password: string) =>
  request(app).post("/auth/login").send({ email, password });

const failedLogin = (app: App, email = "ana@example.com") =>
  loginWith(app, email, "otra-clave-distinta");

function refreshCookieOf(res: request.Response): string {
  const cookies = (res.headers["set-cookie"] as string[] | undefined) ?? [];
  const pair = cookies
    .find((cookie) => cookie.startsWith("refresh_token=") && !cookie.startsWith("refresh_token=;"))
    ?.split(";")[0];
  if (!pair) throw new Error("la respuesta no trae cookie de refresh");
  return pair;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("límite de intentos de login por IP", () => {
  it("bloquea con 429 tras superar los intentos fallidos", async () => {
    const { app } = build({ login: { windowMs: 60_000, max: 3 } });
    for (let i = 0; i < 3; i += 1) {
      expect((await failedLogin(app, `u${i}@example.com`)).status).toBe(401);
    }
    const blocked = await failedLogin(app, "u9@example.com");
    expect(blocked.status).toBe(429);
    expect(blocked.headers["content-type"]).toContain("application/problem+json");
    expect(blocked.body).toMatchObject({ status: 429, code: "TOO_MANY_REQUESTS" });
    expect(Number(blocked.headers["retry-after"])).toBeGreaterThan(0);
    expect(blocked.headers["cache-control"]).toBe("no-store");
    expect(blocked.headers["set-cookie"]).toBeUndefined();
  });

  it("traduce el mensaje según Accept-Language", async () => {
    const { app } = build({ login: { windowMs: 60_000, max: 1 } });
    await failedLogin(app, "u0@example.com");
    const es = await failedLogin(app, "u1@example.com");
    const en = await request(app)
      .post("/auth/login")
      .set("Accept-Language", "en")
      .send({ email: "u2@example.com", password: "otra-clave-distinta" });
    expect(es.body.detail).toBe("Demasiados intentos. Inténtalo de nuevo más tarde.");
    expect(en.body.detail).toBe("Too many attempts. Please try again later.");
  });

  it("una vez superado el límite, ni la clave correcta pasa", async () => {
    const { app, users } = build({ login: { windowMs: 60_000, max: 3 } });
    await seedUser(users);
    for (let i = 0; i < 3; i += 1) await failedLogin(app, `u${i}@example.com`);
    expect((await loginWith(app, "ana@example.com", PASSWORD)).status).toBe(429);
  });

  it("los inicios de sesión correctos no cuentan", async () => {
    const { app, users } = build({ login: { windowMs: 60_000, max: 3 } });
    await seedUser(users);
    for (let i = 0; i < 6; i += 1) {
      expect((await loginWith(app, "ana@example.com", PASSWORD)).status).toBe(200);
    }
  });
});

describe("límite de intentos de login por cuenta", () => {
  it("cuenta por email normalizado y no afecta a otras cuentas", async () => {
    const { app, users } = build({ loginPerAccount: { windowMs: 60_000, max: 2 } });
    await seedUser(users);
    expect((await failedLogin(app, "ana@example.com")).status).toBe(401);
    expect((await failedLogin(app, "  ANA@example.com ")).status).toBe(401);
    expect((await failedLogin(app, "Ana@Example.com")).status).toBe(429);
    expect((await failedLogin(app, "otra@example.com")).status).toBe(401);
  });

  it("no cuenta las peticiones sin email", async () => {
    const { app } = build({ loginPerAccount: { windowMs: 60_000, max: 1 } });
    for (let i = 0; i < 4; i += 1) {
      expect((await request(app).post("/auth/login").send({})).status).toBe(400);
    }
  });
});

describe("límite de registros y de renovaciones", () => {
  it("limita los registros por IP, también los correctos", async () => {
    const { app } = build({ register: { windowMs: 60_000, max: 2 } });
    const register = (i: number) =>
      request(app)
        .post("/auth/register")
        .send({ email: `n${i}@example.com`, password: PASSWORD, firstName: "N", lastName: "U" });
    expect((await register(0)).status).toBe(201);
    expect((await register(1)).status).toBe(201);
    const blocked = await register(2);
    expect(blocked.status).toBe(429);
    expect(blocked.body.code).toBe("TOO_MANY_REQUESTS");
  });

  it("limita las renovaciones por IP", async () => {
    const { app, users } = build({ refresh: { windowMs: 60_000, max: 2 } });
    await seedUser(users);
    let cookie = refreshCookieOf(await loginWith(app, "ana@example.com", PASSWORD));
    const refresh = () =>
      request(app).post("/auth/refresh").set("Cookie", cookie).set("X-CSRF-Protection", "1");
    for (let i = 0; i < 2; i += 1) {
      const res = await refresh();
      expect(res.status).toBe(200);
      cookie = refreshCookieOf(res);
    }
    expect((await refresh()).status).toBe(429);
  });
});

describe("identificación del cliente detrás de un proxy", () => {
  it("sin TRUST_PROXY, falsificar X-Forwarded-For no evade el límite", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { app } = build({ login: { windowMs: 60_000, max: 3 } });
    const statuses: number[] = [];
    for (let i = 0; i < 4; i += 1) {
      const res = await request(app)
        .post("/auth/login")
        .set("X-Forwarded-For", `10.0.0.${i}`)
        .send({ email: `u${i}@example.com`, password: "otra-clave-distinta" });
      statuses.push(res.status);
    }
    expect(statuses).toEqual([401, 401, 401, 429]);
  });

  it("con TRUST_PROXY=1, cada IP real tiene su propio contador", async () => {
    const { app } = build({ login: { windowMs: 60_000, max: 2 } }, 1);
    const attempt = (ip: string, i: number) =>
      request(app)
        .post("/auth/login")
        .set("X-Forwarded-For", ip)
        .send({ email: `u${i}@example.com`, password: "otra-clave-distinta" });
    expect((await attempt("203.0.113.1", 0)).status).toBe(401);
    expect((await attempt("203.0.113.1", 1)).status).toBe(401);
    expect((await attempt("203.0.113.1", 2)).status).toBe(429);
    expect((await attempt("203.0.113.2", 3)).status).toBe(401);
  });
});
