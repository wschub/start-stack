import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { composeApp } from "../../../src/composition.ts";
import { loadEnv } from "../../../src/config/env.ts";
import { startTestDatabase, type TestDatabase } from "../../helpers/postgres.ts";

const ORIGIN = "https://app.example.com";
const PASSWORD = "una-clave-bastante-larga";

function refreshCookieOf(res: request.Response): string {
  const cookies = (res.headers["set-cookie"] as string[] | undefined) ?? [];
  const pair = cookies
    .find((cookie) => cookie.startsWith("refresh_token=") && !cookie.startsWith("refresh_token=;"))
    ?.split(";")[0];
  if (!pair) throw new Error("la respuesta no trae cookie de refresh");
  return pair;
}

describe("flujo de autenticación completo (Postgres real, Argon2 real)", () => {
  let db: TestDatabase;
  let app: ReturnType<typeof composeApp>["app"];
  let shutdown: () => Promise<void>;

  beforeAll(async () => {
    db = await startTestDatabase();
    const env = loadEnv({
      NODE_ENV: "test",
      DATABASE_URL: db.url,
      JWT_ACCESS_SECRET: "0123456789abcdef0123456789abcdef-e2e",
      CORS_ORIGINS: ORIGIN,
      LOG_LEVEL: "silent",
    });
    const composed = composeApp(env);
    app = composed.app;
    shutdown = composed.shutdown;
  });

  afterAll(async () => {
    await shutdown?.();
    await db?.stop();
  });

  it("/health/ready comprueba la base de datos real", async () => {
    const res = await request(app).get("/health/ready");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ready", checks: [{ name: "database", status: "up" }] });
  });

  it("registro, login, perfil, rotación, reutilización y cierre de sesión", async () => {
    const credentials = { email: "e2e@example.com", password: PASSWORD };

    const register = await request(app)
      .post("/auth/register")
      .send({ ...credentials, firstName: "E2E", lastName: "Flow" });
    expect(register.status).toBe(201);

    const stored = await db.prisma.user.findUniqueOrThrow({ where: { email: credentials.email } });
    expect(stored.passwordHash).toMatch(/^\$argon2id\$/);

    const login = await request(app).post("/auth/login").send(credentials);
    expect(login.status).toBe(200);
    const first = refreshCookieOf(login);

    const me = await request(app)
      .get("/auth/me")
      .set("Authorization", `Bearer ${login.body.accessToken}`);
    expect(me.status).toBe(200);
    expect(me.body.user.email).toBe(credentials.email);

    const refresh = (cookie: string) =>
      request(app)
        .post("/auth/refresh")
        .set("Cookie", cookie)
        .set("Origin", ORIGIN)
        .set("X-CSRF-Protection", "1");

    const rotated = await refresh(first);
    expect(rotated.status).toBe(200);
    const second = refreshCookieOf(rotated);
    expect(second).not.toBe(first);

    const reused = await refresh(first);
    expect(reused.status).toBe(401);
    expect(reused.body.code).toBe("REFRESH_TOKEN_REUSED");
    expect((await refresh(second)).body.code).toBe("INVALID_REFRESH_TOKEN");

    const relogin = await request(app).post("/auth/login").send(credentials);
    const third = refreshCookieOf(relogin);
    const logout = await request(app)
      .post("/auth/logout")
      .set("Cookie", third)
      .set("Origin", ORIGIN)
      .set("X-CSRF-Protection", "1");
    expect(logout.status).toBe(204);
    expect((await refresh(third)).status).toBe(401);

    const rows = await db.prisma.refreshToken.findMany();
    expect(rows).toHaveLength(3);
    expect(rows.every((row) => row.revokedAt !== null)).toBe(true);
  });

  it("rechaza al CORS desde un origen que no está en la lista", async () => {
    const res = await request(app)
      .options("/auth/refresh")
      .set("Origin", "https://evil.example.com")
      .set("Access-Control-Request-Method", "POST");
    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });
});
