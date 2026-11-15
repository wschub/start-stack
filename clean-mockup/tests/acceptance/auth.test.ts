import request from "supertest";
import { describe, expect, it } from "vitest";
import { testAuthenticate } from "../helpers/http-fakes.ts";
import { createApp } from "../../src/frameworks/express/app.ts";
import { AuthenticateUser } from "../../src/use-cases/auth/authenticate-user.use-case.ts";
import { GetUserAccess } from "../../src/use-cases/auth/get-user-access.use-case.ts";
import { IssueSession } from "../../src/use-cases/auth/issue-session.use-case.ts";
import { RegisterUser } from "../../src/use-cases/auth/register-user.use-case.ts";
import { Role } from "../../src/entities/role.ts";
import { hashRefreshToken } from "../../src/entities/rules/refresh-token-hash.ts";
import { JoseAccessTokenService } from "../../src/frameworks/security/jose-access-token-service.ts";
import { createAuthRouter } from "../../src/frameworks/express/routes/auth.routes.ts";
import { User } from "../../src/entities/user.ts";
import { FakePasswordHasher, InMemoryUserRepository } from "../helpers/fakes.ts";
import { InMemoryRoleRepository, SUPER_ADMIN_ID, testRegistry } from "../helpers/role-fakes.ts";
import { InMemoryRefreshTokenRepository } from "../helpers/session-fakes.ts";

const PASSWORD = "una-clave-bastante-larga";
const REFRESH_TTL = 7 * 24 * 3600;
const tokenOptions = {
  secret: "0123456789abcdef0123456789abcdef-test",
  issuer: "test",
  audience: "test-api",
  ttlSeconds: 3600,
};

function build(options: { publicRegistration?: boolean; secure?: boolean } = {}) {
  const users = new InMemoryUserRepository();
  const hasher = new FakePasswordHasher();
  const tokens = new InMemoryRefreshTokenRepository();
  const roles = new InMemoryRoleRepository();
  const accessTokens = new JoseAccessTokenService(tokenOptions);
  const issueSession = new IssueSession({ tokens, accessTokens, refreshTtlSeconds: REFRESH_TTL });
  const router = createAuthRouter({
    registerUser: new RegisterUser({ users, hasher }),
    authenticateUser: new AuthenticateUser({ users, hasher }),
    issueSession,
    getUserAccess: new GetUserAccess({ roles, registry: testRegistry() }),
    authenticate: testAuthenticate(users, accessTokens),
    publicRegistration: options.publicRegistration ?? true,
    refreshCookie: { secure: options.secure ?? false, sameSite: "strict" },
  });
  return { app: createApp({ routers: [router] }), users, tokens, accessTokens, roles };
}

const registration = {
  email: "Ana@Example.com",
  password: PASSWORD,
  firstName: "Ana",
  lastName: "Gómez",
};

async function seedUser(users: InMemoryUserRepository, inactive = false): Promise<User> {
  const created = User.create({
    email: "ana@example.com",
    passwordHash: `hashed:${PASSWORD}`,
    firstName: "Ana",
    lastName: "Gómez",
  });
  const user = inactive ? created.deactivate() : created;
  await users.add(user);
  return user;
}

function cookieOf(res: request.Response, name: string): string | undefined {
  const cookies = (res.headers["set-cookie"] as string[] | undefined) ?? [];
  return cookies.find((cookie) => cookie.startsWith(`${name}=`));
}

describe("POST /auth/register", () => {
  it("crea la cuenta y devuelve los datos públicos, sin hash", async () => {
    const { app, users } = build();
    const res = await request(app).post("/auth/register").send(registration);
    expect(res.status).toBe(201);
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(res.body.user).toMatchObject({
      email: "ana@example.com",
      firstName: "Ana",
      status: "ACTIVE",
      locale: "es",
    });
    expect(JSON.stringify(res.body)).not.toMatch(/hash/i);
    expect(users.byEmail.size).toBe(1);
  });

  it("rechaza campos obligatorios ausentes con la lista de campos", async () => {
    const { app } = build();
    const res = await request(app).post("/auth/register").send({ email: "ana@example.com" });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
    const fields = (res.body.errors as { field: string }[]).map((e) => e.field);
    expect(fields).toEqual(expect.arrayContaining(["password", "firstName", "lastName"]));
  });

  it("rechaza campos desconocidos y no guarda nada", async () => {
    const { app, users } = build();
    const res = await request(app)
      .post("/auth/register")
      .send({ ...registration, status: "INACTIVE", role: "admin" });
    expect(res.status).toBe(400);
    const fields = (res.body.errors as { field: string }[]).map((e) => e.field);
    expect(fields).toEqual(expect.arrayContaining(["status", "role"]));
    expect(users.byEmail.size).toBe(0);
  });

  it("rechaza una contraseña débil con WEAK_PASSWORD", async () => {
    const { app } = build();
    const res = await request(app)
      .post("/auth/register")
      .send({ ...registration, password: "corta" });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("WEAK_PASSWORD");
  });

  it("rechaza un email repetido con 409 y mensaje traducido", async () => {
    const { app } = build();
    await request(app).post("/auth/register").send(registration);
    const es = await request(app).post("/auth/register").send(registration);
    const en = await request(app)
      .post("/auth/register")
      .set("Accept-Language", "en")
      .send(registration);
    expect(es.status).toBe(409);
    expect(es.body.code).toBe("EMAIL_ALREADY_EXISTS");
    expect(es.body.detail).toBe("Ya existe una cuenta con ese correo electrónico.");
    expect(en.body.detail).toBe("An account with this email address already exists.");
  });

  it("no existe cuando el registro no es público, pero el login sigue funcionando", async () => {
    const { app, users } = build({ publicRegistration: false });
    await seedUser(users);
    const register = await request(app).post("/auth/register").send(registration);
    const login = await request(app)
      .post("/auth/login")
      .send({ email: "ana@example.com", password: PASSWORD });
    expect(register.status).toBe(404);
    expect(login.status).toBe(200);
  });
});

describe("POST /auth/login", () => {
  it("devuelve el token de acceso y el usuario, sin el refresh token en el cuerpo", async () => {
    const { app, users } = build();
    const user = await seedUser(users);
    const res = await request(app)
      .post("/auth/login")
      .send({ email: "  ANA@example.com ", password: PASSWORD });
    expect(res.status).toBe(200);
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(res.body).toMatchObject({ tokenType: "Bearer", expiresIn: 3600 });
    expect(res.body.accessToken.split(".")).toHaveLength(3);
    expect(res.body.user.publicId).toBe(user.publicId);
    expect(JSON.stringify(res.body)).not.toMatch(/refresh|hash/i);
  });

  it("entrega el refresh token en una cookie HttpOnly con vencimiento de 7 días", async () => {
    const { app, users } = build();
    await seedUser(users);
    const res = await request(app)
      .post("/auth/login")
      .send({ email: "ana@example.com", password: PASSWORD });
    const cookie = cookieOf(res, "refresh_token");
    expect(cookie).toBeDefined();
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Strict");
    expect(cookie).toContain("Path=/auth");
    expect(cookie).not.toContain("Secure");
    const match = /Expires=([^;]+)/.exec(cookie ?? "");
    expect(match).not.toBeNull();
    const days = (new Date(match?.[1] ?? 0).getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(6.9);
    expect(days).toBeLessThan(7.1);
  });

  it("marca la cookie como Secure cuando se configura", async () => {
    const { app, users } = build({ secure: true });
    await seedUser(users);
    const res = await request(app)
      .post("/auth/login")
      .send({ email: "ana@example.com", password: PASSWORD });
    expect(cookieOf(res, "refresh_token")).toContain("Secure");
  });

  it("guarda solo el hash del refresh token", async () => {
    const { app, users, tokens } = build();
    await seedUser(users);
    const res = await request(app)
      .post("/auth/login")
      .send({ email: "ana@example.com", password: PASSWORD });
    const value = /refresh_token=([^;]+)/.exec(cookieOf(res, "refresh_token") ?? "")?.[1] ?? "";
    expect(value).not.toBe("");
    const [stored] = tokens.all();
    expect(tokens.all()).toHaveLength(1);
    expect(stored?.tokenHash).toBe(hashRefreshToken(decodeURIComponent(value)));
    expect(JSON.stringify(tokens.all())).not.toContain(value);
  });

  it("responde igual ante un email desconocido y una clave incorrecta, sin cookie", async () => {
    const { app, users } = build();
    await seedUser(users);
    const unknown = await request(app)
      .post("/auth/login")
      .send({ email: "nadie@example.com", password: PASSWORD });
    const wrong = await request(app)
      .post("/auth/login")
      .send({ email: "ana@example.com", password: "otra-clave-distinta" });
    for (const res of [unknown, wrong]) {
      expect(res.status).toBe(401);
      expect(res.body.code).toBe("INVALID_CREDENTIALS");
      expect(res.headers["set-cookie"]).toBeUndefined();
    }
    expect(unknown.body.detail).toBe(wrong.body.detail);
  });

  it("responde 403 ACCOUNT_INACTIVE a una cuenta inactiva con la clave correcta", async () => {
    const { app, users } = build();
    await seedUser(users, true);
    const res = await request(app)
      .post("/auth/login")
      .send({ email: "ana@example.com", password: PASSWORD });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("ACCOUNT_INACTIVE");
    expect(res.headers["set-cookie"]).toBeUndefined();
  });

  it("rechaza un cuerpo incompleto o con campos de más", async () => {
    const { app } = build();
    const missing = await request(app).post("/auth/login").send({ email: "ana@example.com" });
    const extra = await request(app)
      .post("/auth/login")
      .send({ email: "ana@example.com", password: PASSWORD, remember: true });
    expect(missing.status).toBe(400);
    expect(extra.status).toBe(400);
  });
});

describe("GET /auth/me", () => {
  it("devuelve el usuario autenticado con un token válido", async () => {
    const { app, users, accessTokens } = build();
    const user = await seedUser(users);
    const { token } = await accessTokens.issue(user.publicId);
    const res = await request(app).get("/auth/me").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.user.publicId).toBe(user.publicId);
    expect(JSON.stringify(res.body)).not.toMatch(/hash/i);
  });

  it("incluye roles y permisos vacíos para un usuario sin roles", async () => {
    const { app, users, accessTokens } = build();
    const user = await seedUser(users);
    const { token } = await accessTokens.issue(user.publicId);

    const res = await request(app).get("/auth/me").set("Authorization", `Bearer ${token}`);

    expect(res.body.roles).toEqual([]);
    expect(res.body.permissions).toEqual([]);
  });

  it("incluye los nombres de sus roles y la unión de sus permisos", async () => {
    const { app, users, accessTokens, roles } = build();
    const user = await seedUser(users);
    const role = Role.create({ name: "Soporte", permissions: ["users:read"] });
    await roles.add(role);
    await roles.setUserRoles(user.publicId, [role.publicId, SUPER_ADMIN_ID]);
    const { token } = await accessTokens.issue(user.publicId);

    const res = await request(app).get("/auth/me").set("Authorization", `Bearer ${token}`);

    expect(res.body.roles).toEqual(["SUPER_ADMIN", "Soporte"]);
    expect(res.body.permissions).toEqual([
      "roles:read",
      "roles:manage",
      "roles:assign",
      "users:read",
      "users:update",
    ]);
  });

  it("responde 401 UNAUTHENTICATED sin cabecera o con otro esquema", async () => {
    const { app } = build();
    const none = await request(app).get("/auth/me");
    const basic = await request(app).get("/auth/me").set("Authorization", "Basic abc");
    expect(none.status).toBe(401);
    expect(none.body.code).toBe("UNAUTHENTICATED");
    expect(basic.status).toBe(401);
    expect(basic.body.code).toBe("UNAUTHENTICATED");
  });

  it("responde 401 INVALID_TOKEN con un token basura", async () => {
    const { app } = build();
    const res = await request(app).get("/auth/me").set("Authorization", "Bearer basura");
    expect(res.status).toBe(401);
    expect(res.body.code).toBe("INVALID_TOKEN");
  });

  it("responde 401 TOKEN_EXPIRED con un token vencido", async () => {
    const { app, users } = build();
    const user = await seedUser(users);
    const stale = new JoseAccessTokenService({
      ...tokenOptions,
      now: () => new Date(Date.now() - 2 * 3600 * 1000),
    });
    const { token } = await stale.issue(user.publicId);
    const res = await request(app).get("/auth/me").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(401);
    expect(res.body.code).toBe("TOKEN_EXPIRED");
  });

  it("responde 403 si el usuario fue desactivado después de emitir el token", async () => {
    const { app, users, accessTokens } = build();
    const user = await seedUser(users);
    const { token } = await accessTokens.issue(user.publicId);
    users.byEmail.set(user.email, user.deactivate());
    const res = await request(app).get("/auth/me").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("ACCOUNT_INACTIVE");
  });

  it("responde 401 si el usuario ya no existe", async () => {
    const { app, users, accessTokens } = build();
    const user = await seedUser(users);
    const { token } = await accessTokens.issue(user.publicId);
    users.byEmail.clear();
    const res = await request(app).get("/auth/me").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(401);
  });
});
