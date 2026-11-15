import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../../src/app.ts";
import { GetUserAccess } from "../../src/contexts/identity/application/queries/get-user-access.query.ts";
import { ProtectSuperAdmins } from "../../src/contexts/identity/application/commands/protect-super-admins.command.ts";
import { Role } from "../../src/contexts/identity/domain/aggregates/role.ts";
import {
  authenticatedUser,
  requireAuth,
} from "../../src/contexts/identity/presentation/middlewares/require-auth.ts";
import { createPermissionGuard } from "../../src/contexts/identity/presentation/middlewares/require-permission.ts";
import { ChangeUserStatus } from "../../src/contexts/identity/application/commands/change-user-status.command.ts";
import { GetUser } from "../../src/contexts/identity/application/queries/get-user.query.ts";
import { ListUsers } from "../../src/contexts/identity/application/queries/list-users.query.ts";
import { User } from "../../src/contexts/identity/domain/aggregates/user.ts";
import { createUsersRouter } from "../../src/contexts/identity/presentation/routes/users.routes.ts";
import { InMemoryUserRepository } from "../helpers/fakes.ts";
import { InMemoryRoleRepository, SUPER_ADMIN_ID, testRegistry } from "../helpers/role-fakes.ts";
import { FakeAccessTokenService } from "../helpers/session-fakes.ts";

const MISSING = "00000000-0000-4000-8000-00000000dead";

async function build() {
  const users = new InMemoryUserRepository();
  const roles = new InMemoryRoleRepository(users);
  const registry = testRegistry();
  const getUserAccess = new GetUserAccess({ roles, registry });
  const router = createUsersRouter({
    authenticate: requireAuth({ accessTokens: new FakeAccessTokenService(), users }),
    authorize: createPermissionGuard({ registry, getUserAccess }),
    currentUserId: (res) => authenticatedUser(res).publicId,
    listUsers: new ListUsers({ users }),
    getUser: new GetUser({ users }),
    changeUserStatus: new ChangeUserStatus({
      users,
      guard: new ProtectSuperAdmins({ getUserAccess }),
    }),
  });

  const userWith = async (email: string, permissions: string[] | "SUPER_ADMIN") => {
    const user = User.create({
      email,
      passwordHash: "secreto",
      firstName: "Ana",
      lastName: "Gómez",
    });
    await users.add(user);
    if (permissions === "SUPER_ADMIN") {
      await roles.setUserRoles(user.publicId, [SUPER_ADMIN_ID]);
    } else if (permissions.length > 0) {
      const role = Role.create({ name: `Rol de ${email.split("@")[0]}`, permissions });
      await roles.add(role);
      await roles.setUserRoles(user.publicId, [role.publicId]);
    }
    return { user, auth: `Bearer access:${user.publicId}` };
  };

  const root = await userWith("root@example.com", "SUPER_ADMIN");
  return { app: createApp({ routers: [router] }), users, userWith, root };
}

describe("GET /users", () => {
  it("responde 401 sin token y 403 sin el permiso users:read", async () => {
    const { app, userWith } = await build();
    const { auth } = await userWith("ana@example.com", ["users:update"]);

    const anonymous = await request(app).get("/users");
    const forbidden = await request(app).get("/users").set("Authorization", auth);

    expect(anonymous.status).toBe(401);
    expect([forbidden.status, forbidden.body.code]).toEqual([403, "PERMISSION_DENIED"]);
  });

  it("lista los usuarios paginados, sin hash de contraseña", async () => {
    const { app, userWith, root } = await build();
    await userWith("ana@example.com", []);
    await userWith("beto@example.com", []);

    const res = await request(app).get("/users?page=1&pageSize=2").set("Authorization", root.auth);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ page: 1, pageSize: 2, total: 3 });
    expect(res.body.items.map((user: { email: string }) => user.email)).toEqual([
      "ana@example.com",
      "beto@example.com",
    ]);
    expect(JSON.stringify(res.body)).not.toMatch(/secreto|hash/i);
  });

  it("filtra con search", async () => {
    const { app, userWith, root } = await build();
    await userWith("ana@example.com", []);

    const res = await request(app).get("/users?search=ROOT").set("Authorization", root.auth);

    expect(res.body.total).toBe(1);
    expect(res.body.items[0].email).toBe("root@example.com");
  });

  it.each(["page=0", "pageSize=101", "page=abc", "orden=email"])(
    "rechaza la consulta ?%s",
    async (query) => {
      const { app, root } = await build();

      const res = await request(app).get(`/users?${query}`).set("Authorization", root.auth);

      expect(res.status).toBe(400);
      expect(res.body.code).toBe("VALIDATION_ERROR");
    },
  );
});

describe("GET /users/:id", () => {
  it("devuelve el usuario o 404 USER_NOT_FOUND", async () => {
    const { app, userWith, root } = await build();
    const { user } = await userWith("ana@example.com", []);

    const found = await request(app).get(`/users/${user.publicId}`).set("Authorization", root.auth);
    const missing = await request(app).get(`/users/${MISSING}`).set("Authorization", root.auth);

    expect(found.status).toBe(200);
    expect(found.body.user).toMatchObject({ publicId: user.publicId, email: "ana@example.com" });
    expect([missing.status, missing.body.code]).toEqual([404, "USER_NOT_FOUND"]);
  });
});

describe("PATCH /users/:id/status", () => {
  it("exige el permiso users:update", async () => {
    const { app, userWith, root } = await build();
    const { auth } = await userWith("lector@example.com", ["users:read"]);

    const res = await request(app)
      .patch(`/users/${root.user.publicId}/status`)
      .set("Authorization", auth)
      .send({ status: "INACTIVE" });

    expect([res.status, res.body.code]).toEqual([403, "PERMISSION_DENIED"]);
  });

  it("desactiva a un usuario, que deja de poder usar la API al instante", async () => {
    const { app, userWith, root } = await build();
    const ana = await userWith("ana@example.com", ["users:read"]);

    const res = await request(app)
      .patch(`/users/${ana.user.publicId}/status`)
      .set("Authorization", root.auth)
      .send({ status: "INACTIVE" });

    expect(res.status).toBe(200);
    expect(res.body.user.status).toBe("INACTIVE");
    const blocked = await request(app).get("/users").set("Authorization", ana.auth);
    expect([blocked.status, blocked.body.code]).toEqual([403, "ACCOUNT_INACTIVE"]);
  });

  it("no deja desactivarse a uno mismo", async () => {
    const { app, root } = await build();

    const res = await request(app)
      .patch(`/users/${root.user.publicId}/status`)
      .set("Authorization", root.auth)
      .send({ status: "INACTIVE" });

    expect([res.status, res.body.code]).toEqual([409, "CANNOT_DEACTIVATE_SELF"]);
  });

  it("solo un superadministrador puede desactivar a otro", async () => {
    const { app, userWith, root } = await build();
    const gestor = await userWith("gestor@example.com", ["users:update"]);

    const res = await request(app)
      .patch(`/users/${root.user.publicId}/status`)
      .set("Authorization", gestor.auth)
      .send({ status: "INACTIVE" });

    expect([res.status, res.body.code]).toEqual([403, "SUPER_ADMIN_REQUIRED"]);
  });

  it.each([{}, { status: "DELETED" }, { status: "ACTIVE", role: "x" }])(
    "rechaza el cuerpo %j",
    async (body) => {
      const { app, root } = await build();

      const res = await request(app)
        .patch(`/users/${root.user.publicId}/status`)
        .set("Authorization", root.auth)
        .send(body);

      expect([res.status, res.body.code]).toEqual([400, "VALIDATION_ERROR"]);
    },
  );

  it("responde 404 si el usuario no existe", async () => {
    const { app, root } = await build();

    const res = await request(app)
      .patch(`/users/${MISSING}/status`)
      .set("Authorization", root.auth)
      .send({ status: "INACTIVE" });

    expect([res.status, res.body.code]).toEqual([404, "USER_NOT_FOUND"]);
  });
});
