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
  let createSuperAdmin: ReturnType<typeof composeApp>["createSuperAdmin"];
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
    createSuperAdmin = composed.createSuperAdmin;
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

  it("RBAC: el superadministrador crea un rol, lo asigna y el permiso se aplica al instante", async () => {
    const admin = { email: "root@example.com", password: PASSWORD };
    const created = await createSuperAdmin.execute({
      ...admin,
      firstName: "Root",
      lastName: "Admin",
    });
    expect(created.created).toBe(true);

    const member = { email: "soporte@example.com", password: PASSWORD };
    const registered = await request(app)
      .post("/auth/register")
      .send({ ...member, firstName: "So", lastName: "Porte" });
    const memberId: string = registered.body.user.publicId;

    const tokenOf = async (credentials: { email: string; password: string }) => {
      const login = await request(app).post("/auth/login").send(credentials);
      return `Bearer ${login.body.accessToken as string}`;
    };
    const rootAuth = await tokenOf(admin);
    const memberAuth = await tokenOf(member);

    const rootMe = await request(app).get("/auth/me").set("Authorization", rootAuth);
    expect(rootMe.body.roles).toEqual(["SUPER_ADMIN"]);
    // Solo los permisos base: un módulo añadido con `start-stack add module` suma los suyos.
    const basePermissions = (rootMe.body.permissions as string[]).filter((permission) =>
      /^(roles|users):/.test(permission),
    );
    expect(basePermissions).toEqual([
      "roles:read",
      "roles:manage",
      "roles:assign",
      "users:read",
      "users:update",
    ]);

    // Recién registrado no tiene permisos.
    const denied = await request(app).get("/users").set("Authorization", memberAuth);
    expect([denied.status, denied.body.code]).toEqual([403, "PERMISSION_DENIED"]);

    const catalog = await request(app).get("/permissions").set("Authorization", rootAuth);
    const baseGroups = catalog.body.groups
      .map((group: { module: string }) => group.module)
      .filter((module: string) => ["auth", "users"].includes(module));
    expect(baseGroups).toEqual(["auth", "users"]);

    const role = await request(app)
      .post("/roles")
      .set("Authorization", rootAuth)
      .send({ name: "Soporte", permissions: ["users:read"] });
    expect(role.status).toBe(201);
    const roleId: string = role.body.role.publicId;

    const assigned = await request(app)
      .put(`/users/${memberId}/roles`)
      .set("Authorization", rootAuth)
      .send({ roleIds: [roleId] });
    expect(assigned.body.permissions).toEqual(["users:read"]);

    // Mismo token de antes: el permiso nuevo ya vale.
    const allowed = await request(app)
      .get("/users?search=soporte")
      .set("Authorization", memberAuth);
    expect(allowed.status).toBe(200);
    expect(allowed.body.items[0].email).toBe(member.email);
    const stillDenied = await request(app)
      .patch(`/users/${memberId}/status`)
      .set("Authorization", memberAuth)
      .send({ status: "INACTIVE" });
    expect(stillDenied.status).toBe(403);

    // Sin el rol, vuelve a quedarse fuera.
    expect(
      (await request(app).delete(`/roles/${roleId}`).set("Authorization", rootAuth)).status,
    ).toBe(204);
    expect((await request(app).get("/users").set("Authorization", memberAuth)).status).toBe(403);

    // El superadministrador desactiva la cuenta y deja de poder entrar.
    const off = await request(app)
      .patch(`/users/${memberId}/status`)
      .set("Authorization", rootAuth)
      .send({ status: "INACTIVE" });
    expect(off.body.user.status).toBe("INACTIVE");
    const login = await request(app).post("/auth/login").send(member);
    expect([login.status, login.body.code]).toEqual([403, "ACCOUNT_INACTIVE"]);

    // Y el sistema nunca se queda sin superadministrador.
    const rootId: string = rootMe.body.user.publicId;
    const last = await request(app)
      .put(`/users/${rootId}/roles`)
      .set("Authorization", rootAuth)
      .send({ roleIds: [] });
    expect([last.status, last.body.code]).toEqual([409, "LAST_SUPER_ADMIN"]);
  });

  it("rechaza al CORS desde un origen que no está en la lista", async () => {
    const res = await request(app)
      .options("/auth/refresh")
      .set("Origin", "https://evil.example.com")
      .set("Access-Control-Request-Method", "POST");
    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });
});
