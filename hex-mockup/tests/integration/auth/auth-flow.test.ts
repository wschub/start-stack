import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { composeApp } from "../../../src/composition.ts";
import { loadEnv } from "../../../src/config/env.ts";
import { RecordingPasswordResetNotifier } from "../../helpers/password-reset-fakes.ts";
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
  const notifier = new RecordingPasswordResetNotifier();

  beforeAll(async () => {
    db = await startTestDatabase();
    const env = loadEnv({
      NODE_ENV: "test",
      DATABASE_URL: db.url,
      JWT_ACCESS_SECRET: "0123456789abcdef0123456789abcdef-e2e",
      CORS_ORIGINS: ORIGIN,
      LOG_LEVEL: "silent",
    });
    const composed = composeApp(env, { passwordResetNotifier: notifier });
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

  it("recuperación de contraseña con enlace y con código: cambia la clave y cierra las sesiones", async () => {
    const email = "recupera@example.com";
    const login = (password: string) => request(app).post("/auth/login").send({ email, password });
    await request(app)
      .post("/auth/register")
      .send({ email, password: PASSWORD, firstName: "Re", lastName: "Cupera" });
    const session = refreshCookieOf(await login(PASSWORD));

    // Con enlace
    const forgot = await request(app).post("/auth/password/forgot").send({ email });
    expect(forgot.status).toBe(202);
    const token = notifier.last().secret;
    const stored = await db.prisma.passwordReset.findFirstOrThrow();
    expect(stored.secretHash).not.toBe(token);

    const linkPassword = "clave-nueva-por-enlace-1";
    const reset = await request(app)
      .post("/auth/password/reset")
      .send({ token, password: linkPassword });
    expect(reset.status).toBe(204);

    expect((await login(PASSWORD)).status).toBe(401);
    expect((await login(linkPassword)).status).toBe(200);
    const refreshed = await request(app)
      .post("/auth/refresh")
      .set("Cookie", session)
      .set("Origin", ORIGIN)
      .set("X-CSRF-Protection", "1");
    expect(refreshed.status).toBe(401);
    const again = await request(app)
      .post("/auth/password/reset")
      .send({ token, password: "otra-clave-distinta-1" });
    expect(again.body.code).toBe("INVALID_RESET_TOKEN");

    // Con código
    await request(app).post("/auth/password/forgot").send({ email, method: "code" });
    const code = notifier.last().secret;
    expect(code).toMatch(/^\d{6}$/);
    const wrong = code === "000000" ? "000001" : "000000";
    const codePassword = "clave-nueva-por-codigo-1";
    const failed = await request(app)
      .post("/auth/password/reset")
      .send({ email, code: wrong, password: codePassword });
    expect(failed.body.code).toBe("INVALID_RESET_CODE");

    const ok = await request(app)
      .post("/auth/password/reset")
      .send({ email, code, password: codePassword });
    expect(ok.status).toBe(204);
    expect((await login(codePassword)).status).toBe(200);

    const user = await db.prisma.user.findUniqueOrThrow({ where: { email } });
    expect(user.passwordHash).toMatch(/^\$argon2id\$/);
  });

  it("rechaza al CORS desde un origen que no está en la lista", async () => {
    const res = await request(app)
      .options("/auth/refresh")
      .set("Origin", "https://evil.example.com")
      .set("Access-Control-Request-Method", "POST");
    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });
});
