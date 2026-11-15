import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../../src/app.ts";
import { AssignUserRoles } from "../../src/modules/auth/application/use-cases/assign-user-roles.use-case.ts";
import { GetUserAccess } from "../../src/modules/auth/application/use-cases/get-user-access.use-case.ts";
import { ManageRoles } from "../../src/modules/auth/application/use-cases/manage-roles.use-case.ts";
import { Role } from "../../src/modules/auth/domain/entities/role.ts";
import { requireAuth } from "../../src/modules/auth/presentation/middlewares/require-auth.ts";
import { createPermissionGuard } from "../../src/modules/auth/presentation/middlewares/require-permission.ts";
import { createRolesRouter } from "../../src/modules/auth/presentation/routes/roles.routes.ts";
import { User } from "../../src/modules/users/domain/entities/user.entity.ts";
import { InMemoryUserRepository } from "../helpers/fakes.ts";
import { InMemoryRoleRepository, SUPER_ADMIN_ID, testRegistry } from "../helpers/role-fakes.ts";
import { FakeAccessTokenService } from "../helpers/session-fakes.ts";

const ALL = ["roles:read", "roles:manage", "roles:assign", "users:read", "users:update"];
const MISSING = "00000000-0000-4000-8000-00000000dead";

async function build() {
  const users = new InMemoryUserRepository();
  const roles = new InMemoryRoleRepository(users);
  const registry = testRegistry();
  const getUserAccess = new GetUserAccess({ roles, registry });
  const router = createRolesRouter({
    authenticate: requireAuth({ accessTokens: new FakeAccessTokenService(), users }),
    authorize: createPermissionGuard({ registry, getUserAccess }),
    registry,
    manageRoles: new ManageRoles({ roles, registry }),
    getUserAccess,
    assignUserRoles: new AssignUserRoles({ users, roles, getUserAccess }),
    users,
  });
  const app = createApp({ routers: [router] });

  /** Crea un usuario con un rol hecho a medida y devuelve su cabecera de autenticación. */
  const userWith = async (email: string, permissions: string[] | "SUPER_ADMIN") => {
    const user = User.create({ email, passwordHash: "h", firstName: "Ana", lastName: "Gómez" });
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
  return { app, users, roles, userWith, root };
}

describe("protección por permisos", () => {
  it.each([
    ["get", "/permissions"],
    ["get", "/roles"],
    ["post", "/roles"],
    ["get", `/roles/${SUPER_ADMIN_ID}`],
    ["patch", `/roles/${SUPER_ADMIN_ID}`],
    ["delete", `/roles/${SUPER_ADMIN_ID}`],
    ["get", `/users/${MISSING}/roles`],
    ["put", `/users/${MISSING}/roles`],
  ] as const)("%s %s responde 401 sin token", async (method, path) => {
    const { app } = await build();

    const res = await request(app)[method](path);

    expect(res.status).toBe(401);
    expect(res.body.code).toBe("UNAUTHENTICATED");
  });

  it("responde 403 PERMISSION_DENIED, traducido, a quien no tiene el permiso", async () => {
    const { app, userWith } = await build();
    const { auth } = await userWith("ana@example.com", []);

    const res = await request(app).get("/roles").set("Authorization", auth);

    expect(res.status).toBe(403);
    expect(res.headers["content-type"]).toContain("application/problem+json");
    expect(res.body.code).toBe("PERMISSION_DENIED");
    expect(res.body.detail).toBe("No tienes el permiso necesario para esta acción.");
  });

  it("leer no basta para crear, editar, borrar ni asignar", async () => {
    const { app, userWith, root } = await build();
    const { auth } = await userWith("lector@example.com", ["roles:read"]);
    const as = (req: request.Test) => req.set("Authorization", auth);

    expect((await as(request(app).get("/roles"))).status).toBe(200);
    expect((await as(request(app).post("/roles").send({ name: "Otro" }))).status).toBe(403);
    expect((await as(request(app).patch(`/roles/${MISSING}`).send({}))).status).toBe(403);
    expect((await as(request(app).delete(`/roles/${MISSING}`))).status).toBe(403);
    const assign = as(request(app).put(`/users/${root.user.publicId}/roles`).send({ roleIds: [] }));
    expect((await assign).status).toBe(403);
  });

  it("un cambio de permisos del rol se aplica en la siguiente petición", async () => {
    const { app, userWith, roles } = await build();
    const { auth, user } = await userWith("ana@example.com", ["roles:read"]);
    expect((await request(app).get("/roles").set("Authorization", auth)).status).toBe(200);

    const [role] = await roles.findByUser(user.publicId);
    await roles.update(role!.update({ permissions: [] }));

    expect((await request(app).get("/roles").set("Authorization", auth)).status).toBe(403);
  });

  it("montar una ruta con un permiso sin registrar falla al arrancar", () => {
    const registry = testRegistry();
    const guard = createPermissionGuard({
      registry,
      getUserAccess: new GetUserAccess({ roles: new InMemoryRoleRepository(), registry }),
    });

    expect(() => guard("products:read")).toThrow(/not registered/);
  });
});

describe("GET /permissions", () => {
  it("devuelve el catálogo agrupado por módulo, en el idioma pedido", async () => {
    const { app, root } = await build();

    const es = await request(app).get("/permissions").set("Authorization", root.auth);
    const en = await request(app)
      .get("/permissions")
      .set("Authorization", root.auth)
      .set("Accept-Language", "en");

    expect(es.status).toBe(200);
    expect(es.body.groups.map((group: { module: string }) => group.module)).toEqual([
      "auth",
      "users",
    ]);
    expect(es.body.groups[1].permissions).toEqual([
      { key: "users:read", label: "Ver usuarios" },
      { key: "users:update", label: "Activar y desactivar usuarios" },
    ]);
    expect(en.body.groups[1].permissions[0]).toEqual({ key: "users:read", label: "View users" });
  });
});

describe("roles", () => {
  it("GET /roles lista SUPER_ADMIN con todos los permisos", async () => {
    const { app, root } = await build();

    const res = await request(app).get("/roles").set("Authorization", root.auth);

    expect(res.status).toBe(200);
    expect(res.body.roles).toHaveLength(1);
    expect(res.body.roles[0]).toMatchObject({
      publicId: SUPER_ADMIN_ID,
      name: "SUPER_ADMIN",
      isSystem: true,
      permissions: ALL,
    });
  });

  it("POST /roles crea un rol y GET /roles/:id lo devuelve", async () => {
    const { app, root } = await build();

    const created = await request(app)
      .post("/roles")
      .set("Authorization", root.auth)
      .send({ name: "Soporte", description: "Nivel 1", permissions: ["users:read"] });

    expect(created.status).toBe(201);
    expect(created.body.role).toMatchObject({
      name: "Soporte",
      description: "Nivel 1",
      isSystem: false,
      permissions: ["users:read"],
    });
    const fetched = await request(app)
      .get(`/roles/${created.body.role.publicId}`)
      .set("Authorization", root.auth);
    expect(fetched.status).toBe(200);
    expect(fetched.body.role).toEqual(created.body.role);
  });

  it.each([
    ["sin nombre", {}, "VALIDATION_ERROR"],
    ["con campos desconocidos", { name: "Soporte", isSystem: true }, "VALIDATION_ERROR"],
    [
      "con permisos que no son una lista",
      { name: "Soporte", permissions: "all" },
      "VALIDATION_ERROR",
    ],
    ["con un nombre inválido", { name: "!" }, "INVALID_ROLE_NAME"],
    ["con un permiso inexistente", { name: "Soporte", permissions: ["x:y"] }, "UNKNOWN_PERMISSION"],
  ])("POST /roles rechaza el cuerpo %s", async (_name, body, code) => {
    const { app, root } = await build();

    const res = await request(app).post("/roles").set("Authorization", root.auth).send(body);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe(code);
  });

  it("UNKNOWN_PERMISSION indica qué permisos no existen", async () => {
    const { app, root } = await build();

    const res = await request(app)
      .post("/roles")
      .set("Authorization", root.auth)
      .send({ name: "Soporte", permissions: ["users:read", "users:fly"] });

    expect(res.body.errors).toEqual([{ field: "permissions", code: "users:fly" }]);
  });

  it("POST /roles responde 409 si el nombre ya existe o es el reservado", async () => {
    const { app, root } = await build();
    const create = (name: string) =>
      request(app).post("/roles").set("Authorization", root.auth).send({ name });
    await create("Soporte");

    for (const name of ["soporte", "super admin"]) {
      const res = await create(name);
      expect(res.status).toBe(409);
      expect(res.body.code).toBe("ROLE_NAME_TAKEN");
    }
  });

  it("PATCH /roles/:id edita el rol", async () => {
    const { app, root } = await build();
    const created = await request(app)
      .post("/roles")
      .set("Authorization", root.auth)
      .send({ name: "Soporte", description: "Nivel 1" });

    const res = await request(app)
      .patch(`/roles/${created.body.role.publicId}`)
      .set("Authorization", root.auth)
      .send({ description: null, permissions: ["users:read", "users:update"] });

    expect(res.status).toBe(200);
    expect(res.body.role).toMatchObject({
      name: "Soporte",
      description: null,
      permissions: ["users:read", "users:update"],
    });
  });

  it("no deja editar ni borrar SUPER_ADMIN, ni siquiera a un superadministrador", async () => {
    const { app, root } = await build();

    const patch = await request(app)
      .patch(`/roles/${SUPER_ADMIN_ID}`)
      .set("Authorization", root.auth)
      .send({ permissions: [] });
    const del = await request(app)
      .delete(`/roles/${SUPER_ADMIN_ID}`)
      .set("Authorization", root.auth);

    expect(patch.status).toBe(403);
    expect(patch.body.code).toBe("SYSTEM_ROLE_IMMUTABLE");
    expect(del.status).toBe(403);
    expect(del.body.code).toBe("SYSTEM_ROLE_IMMUTABLE");
  });

  it("DELETE /roles/:id borra el rol y responde 204; después, 404", async () => {
    const { app, root } = await build();
    const created = await request(app)
      .post("/roles")
      .set("Authorization", root.auth)
      .send({ name: "Soporte" });
    const path = `/roles/${created.body.role.publicId}`;

    expect((await request(app).delete(path).set("Authorization", root.auth)).status).toBe(204);
    const again = await request(app).get(path).set("Authorization", root.auth);
    expect(again.status).toBe(404);
    expect(again.body.code).toBe("ROLE_NOT_FOUND");
  });
});

describe("roles de un usuario", () => {
  it("PUT /users/:id/roles asigna roles y GET los devuelve con sus permisos", async () => {
    const { app, root, userWith } = await build();
    const { user } = await userWith("ana@example.com", []);
    const role = await request(app)
      .post("/roles")
      .set("Authorization", root.auth)
      .send({ name: "Soporte", permissions: ["users:read"] });

    const put = await request(app)
      .put(`/users/${user.publicId}/roles`)
      .set("Authorization", root.auth)
      .send({ roleIds: [role.body.role.publicId] });
    const get = await request(app)
      .get(`/users/${user.publicId}/roles`)
      .set("Authorization", root.auth);

    expect(put.status).toBe(200);
    expect(put.body).toEqual({
      roles: [{ publicId: role.body.role.publicId, name: "Soporte" }],
      permissions: ["users:read"],
    });
    expect(get.body).toEqual(put.body);
  });

  it("responde 404 si el usuario no existe y 400 si un rol no existe", async () => {
    const { app, root } = await build();

    const noUser = await request(app)
      .put(`/users/${MISSING}/roles`)
      .set("Authorization", root.auth)
      .send({ roleIds: [] });
    const noRole = await request(app)
      .put(`/users/${root.user.publicId}/roles`)
      .set("Authorization", root.auth)
      .send({ roleIds: [SUPER_ADMIN_ID, MISSING] });
    const getNoUser = await request(app)
      .get(`/users/${MISSING}/roles`)
      .set("Authorization", root.auth);

    expect([noUser.status, noUser.body.code]).toEqual([404, "USER_NOT_FOUND"]);
    expect([noRole.status, noRole.body.code]).toEqual([400, "UNKNOWN_ROLE"]);
    expect([getNoUser.status, getNoUser.body.code]).toEqual([404, "USER_NOT_FOUND"]);
  });

  it("rechaza un cuerpo sin roleIds o con campos desconocidos", async () => {
    const { app, root } = await build();
    const put = (body: object) =>
      request(app)
        .put(`/users/${root.user.publicId}/roles`)
        .set("Authorization", root.auth)
        .send(body);

    expect((await put({})).body.code).toBe("VALIDATION_ERROR");
    expect((await put({ roleIds: [], admin: true })).body.code).toBe("VALIDATION_ERROR");
  });

  it("quien solo puede asignar roles no puede hacerse superadministrador", async () => {
    const { app, userWith } = await build();
    const { user, auth } = await userWith("gestor@example.com", ["roles:assign"]);

    const res = await request(app)
      .put(`/users/${user.publicId}/roles`)
      .set("Authorization", auth)
      .send({ roleIds: [SUPER_ADMIN_ID] });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe("SUPER_ADMIN_REQUIRED");
  });

  it("no deja al sistema sin superadministradores", async () => {
    const { app, root } = await build();

    const res = await request(app)
      .put(`/users/${root.user.publicId}/roles`)
      .set("Authorization", root.auth)
      .send({ roleIds: [] });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe("LAST_SUPER_ADMIN");
  });
});
