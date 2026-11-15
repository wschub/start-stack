import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../../src/app.ts";
import { AuthenticateUser } from "../../src/contexts/identity/application/commands/authenticate-user.command.ts";
import { GetUserAccess } from "../../src/contexts/identity/application/queries/get-user-access.query.ts";
import { IssueSession } from "../../src/contexts/identity/application/commands/issue-session.command.ts";
import { RefreshSession } from "../../src/contexts/identity/application/commands/refresh-session.command.ts";
import { RegisterUser } from "../../src/contexts/identity/application/commands/register-user.command.ts";
import { RevokeSession } from "../../src/contexts/identity/application/commands/revoke-session.command.ts";
import { JoseAccessTokenService } from "../../src/contexts/identity/infrastructure/security/jose-access-token-service.ts";
import { createAuthRouter } from "../../src/contexts/identity/presentation/routes/auth.routes.ts";
import { createSessionRouter } from "../../src/contexts/identity/presentation/routes/session.routes.ts";
import { User } from "../../src/contexts/identity/domain/aggregates/user.ts";
import { FakePasswordHasher, InMemoryUserRepository } from "../helpers/fakes.ts";
import { InMemoryRoleRepository, testRegistry } from "../helpers/role-fakes.ts";
import { InMemoryRefreshTokenRepository } from "../helpers/session-fakes.ts";

const ORIGIN = "https://app.example.com";
const PASSWORD = "una-clave-bastante-larga";
const CSRF = { "X-CSRF-Protection": "1" };
const tokenOptions = {
  secret: "0123456789abcdef0123456789abcdef-test",
  issuer: "test",
  audience: "test-api",
  ttlSeconds: 3600,
};

function build() {
  const users = new InMemoryUserRepository();
  const hasher = new FakePasswordHasher();
  const tokens = new InMemoryRefreshTokenRepository();
  const accessTokens = new JoseAccessTokenService(tokenOptions);
  const issueSession = new IssueSession({ tokens, accessTokens, refreshTtlSeconds: 7 * 24 * 3600 });
  const refreshCookie = { secure: false, sameSite: "strict" } as const;
  const authRouter = createAuthRouter({
    registerUser: new RegisterUser({ users, hasher }),
    authenticateUser: new AuthenticateUser({ users, hasher }),
    issueSession,
    getUserAccess: new GetUserAccess({
      roles: new InMemoryRoleRepository(),
      registry: testRegistry(),
    }),
    accessTokens,
    users,
    publicRegistration: true,
    refreshCookie,
  });
  const sessionRouter = createSessionRouter({
    refreshSession: new RefreshSession({ tokens, users, issueSession }),
    revokeSession: new RevokeSession({ tokens }),
    refreshCookie,
    allowedOrigins: [ORIGIN],
  });
  return { app: createApp({ routers: [authRouter, sessionRouter] }), users, tokens };
}

type App = ReturnType<typeof build>["app"];

function setCookies(res: request.Response): string[] {
  return (res.headers["set-cookie"] as string[] | undefined) ?? [];
}

function refreshCookieOf(res: request.Response): string {
  const pair = setCookies(res)
    .find((cookie) => cookie.startsWith("refresh_token=") && !cookie.startsWith("refresh_token=;"))
    ?.split(";")[0];
  if (!pair) throw new Error("la respuesta no trae cookie de refresh");
  return pair;
}

function clearsCookie(res: request.Response): boolean {
  return setCookies(res).some(
    (cookie) => cookie.startsWith("refresh_token=;") && cookie.includes("Expires=Thu, 01 Jan 1970"),
  );
}

async function loginAs(app: App, users: InMemoryUserRepository) {
  const user = User.create({
    email: "ana@example.com",
    passwordHash: `hashed:${PASSWORD}`,
    firstName: "Ana",
    lastName: "Gómez",
  });
  await users.add(user);
  const res = await request(app)
    .post("/auth/login")
    .send({ email: "ana@example.com", password: PASSWORD });
  return { user, cookie: refreshCookieOf(res) };
}

const refresh = (app: App, cookie: string) =>
  request(app).post("/auth/refresh").set("Cookie", cookie).set(CSRF);

describe("POST /auth/refresh", () => {
  it("rota el refresh token y emite un access token nuevo", async () => {
    const { app, users } = build();
    const { cookie } = await loginAs(app, users);
    const res = await refresh(app, cookie).set("Origin", ORIGIN);
    expect(res.status).toBe(200);
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(res.body).toMatchObject({ tokenType: "Bearer", expiresIn: 3600 });
    expect(res.body.accessToken.split(".")).toHaveLength(3);
    expect(JSON.stringify(res.body)).not.toMatch(/refresh/i);
    expect(refreshCookieOf(res)).not.toBe(cookie);
  });

  it("al reutilizar un token consumido responde 401, revoca la familia y borra la cookie", async () => {
    const { app, users } = build();
    const { cookie: first } = await loginAs(app, users);
    const second = refreshCookieOf(await refresh(app, first));

    const reused = await refresh(app, first);
    expect(reused.status).toBe(401);
    expect(reused.body.code).toBe("REFRESH_TOKEN_REUSED");
    expect(clearsCookie(reused)).toBe(true);

    const afterwards = await refresh(app, second);
    expect(afterwards.status).toBe(401);
    expect(afterwards.body.code).toBe("INVALID_REFRESH_TOKEN");
  });

  it("exige la cabecera X-CSRF-Protection y no rota el token si falta", async () => {
    const { app, users } = build();
    const { cookie } = await loginAs(app, users);
    const missing = await request(app).post("/auth/refresh").set("Cookie", cookie);
    expect(missing.status).toBe(403);
    expect(missing.body.code).toBe("CSRF_HEADER_MISSING");
    expect(setCookies(missing)).toHaveLength(0);
    expect((await refresh(app, cookie)).status).toBe(200);
  });

  it.each(["https://evil.example.com", "null", "http://app.example.com"])(
    "rechaza el Origin %s sin rotar el token",
    async (origin) => {
      const { app, users } = build();
      const { cookie } = await loginAs(app, users);
      const res = await refresh(app, cookie).set("Origin", origin);
      expect(res.status).toBe(403);
      expect(res.body.code).toBe("ORIGIN_NOT_ALLOWED");
      expect((await refresh(app, cookie).set("Origin", ORIGIN)).status).toBe(200);
    },
  );

  it("acepta peticiones sin Origin (clientes que no son navegadores)", async () => {
    const { app, users } = build();
    const { cookie } = await loginAs(app, users);
    expect((await refresh(app, cookie)).status).toBe(200);
  });

  it("responde 401 INVALID_REFRESH_TOKEN cuando no hay cookie", async () => {
    const { app } = build();
    const res = await request(app).post("/auth/refresh").set(CSRF);
    expect(res.status).toBe(401);
    expect(res.body.code).toBe("INVALID_REFRESH_TOKEN");
  });

  it("responde 401 y borra la cookie con un token desconocido", async () => {
    const { app } = build();
    const res = await refresh(app, "refresh_token=no-existe");
    expect(res.status).toBe(401);
    expect(res.body.code).toBe("INVALID_REFRESH_TOKEN");
    expect(clearsCookie(res)).toBe(true);
  });

  it("responde 403, revoca y borra la cookie si el usuario fue desactivado", async () => {
    const { app, users, tokens } = build();
    const { user, cookie } = await loginAs(app, users);
    users.byEmail.set(user.email, user.deactivate());
    const res = await refresh(app, cookie);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("ACCOUNT_INACTIVE");
    expect(clearsCookie(res)).toBe(true);
    expect(tokens.all().every((token) => token.revokedAt !== null)).toBe(true);
  });

  it("con dos peticiones simultáneas solo una tiene éxito", async () => {
    const { app, users } = build();
    const { cookie } = await loginAs(app, users);
    const results = await Promise.all([refresh(app, cookie), refresh(app, cookie)]);
    expect(results.map((res) => res.status).sort()).toEqual([200, 401]);
  });
});

describe("POST /auth/logout", () => {
  const logout = (app: App, cookie?: string) => {
    const req = request(app).post("/auth/logout").set(CSRF);
    return cookie ? req.set("Cookie", cookie) : req;
  };

  it("responde 204, borra la cookie y revoca la sesión", async () => {
    const { app, users } = build();
    const { cookie } = await loginAs(app, users);
    const res = await logout(app, cookie);
    expect(res.status).toBe(204);
    expect(clearsCookie(res)).toBe(true);
    const after = await refresh(app, cookie);
    expect(after.status).toBe(401);
    expect(after.body.code).toBe("INVALID_REFRESH_TOKEN");
  });

  it("también revoca los tokens ya rotados de la sesión", async () => {
    const { app, users } = build();
    const { cookie } = await loginAs(app, users);
    const rotated = refreshCookieOf(await refresh(app, cookie));
    expect((await logout(app, rotated)).status).toBe(204);
    expect((await refresh(app, rotated)).status).toBe(401);
  });

  it("es idempotente cuando no hay cookie", async () => {
    const { app } = build();
    expect((await logout(app)).status).toBe(204);
  });

  it("exige la cabecera y un Origin permitido, y no revoca si falla", async () => {
    const { app, users } = build();
    const { cookie } = await loginAs(app, users);
    const noHeader = await request(app).post("/auth/logout").set("Cookie", cookie);
    const badOrigin = await logout(app, cookie).set("Origin", "https://evil.example.com");
    expect(noHeader.status).toBe(403);
    expect(badOrigin.status).toBe(403);
    expect((await refresh(app, cookie)).status).toBe(200);
  });
});
