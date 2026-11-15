import { beforeEach, describe, expect, it } from "vitest";
import { AppError } from "../../../../src/entities/errors/app-error.ts";
import {
  createRolesController,
  type RolesControllerDeps,
} from "../../../../src/interface-adapters/controllers/roles.controller.ts";
import type { AssignUserRolesInput } from "../../../../src/use-cases/auth/assign-user-roles.use-case.ts";
import type { CreateRoleInput } from "../../../../src/use-cases/auth/create-role.use-case.ts";
import type { UserAccess } from "../../../../src/use-cases/auth/get-user-access.use-case.ts";
import type { RoleView } from "../../../../src/use-cases/auth/role-view.ts";
import type { UpdateRoleInput } from "../../../../src/use-cases/auth/update-role.use-case.ts";
import type { PermissionGroup } from "../../../../src/use-cases/permissions/permission.ts";
import type { PublicUser } from "../../../../src/use-cases/users/public-user.ts";
import { ANA, httpRequest } from "../../../helpers/http-request.ts";
import { StubUseCase } from "../../../helpers/use-case-fakes.ts";

const ROLE: RoleView = {
  publicId: "role-1",
  name: "Soporte",
  description: null,
  isSystem: false,
  permissions: ["users:read"],
  createdAt: "2026-11-15T10:00:00.000Z",
  updatedAt: "2026-11-15T10:00:00.000Z",
};
const ACCESS: UserAccess = {
  roles: [{ publicId: "role-1", name: "Soporte" }],
  permissions: ["users:read"],
  isSuperAdmin: false,
};
const GROUPS: PermissionGroup[] = [
  {
    module: "users",
    permissions: [
      { key: "users:read", module: "users", label: { es: "Ver usuarios", en: "View users" } },
    ],
  },
];
const TARGET = "22222222-2222-4222-8222-222222222222";

describe("controlador de roles", () => {
  let createRole: StubUseCase<CreateRoleInput, RoleView>;
  let updateRole: StubUseCase<UpdateRoleInput, RoleView>;
  let deleteRole: StubUseCase<string, void>;
  let getRole: StubUseCase<string, RoleView>;
  let getUser: StubUseCase<string, PublicUser>;
  let getUserAccess: StubUseCase<string, UserAccess>;
  let assignUserRoles: StubUseCase<AssignUserRolesInput, UserAccess>;
  let deps: RolesControllerDeps;

  beforeEach(() => {
    createRole = StubUseCase.returning(ROLE);
    updateRole = StubUseCase.returning(ROLE);
    deleteRole = StubUseCase.returning(undefined);
    getRole = StubUseCase.returning(ROLE);
    getUser = StubUseCase.returning({ ...ANA, publicId: TARGET });
    getUserAccess = StubUseCase.returning(ACCESS);
    assignUserRoles = StubUseCase.returning(ACCESS);
    deps = {
      listPermissions: StubUseCase.returning(GROUPS),
      listRoles: StubUseCase.returning([ROLE]),
      getRole,
      createRole,
      updateRole,
      deleteRole,
      getUser,
      getUserAccess,
      assignUserRoles,
    };
  });

  it("listPermissions devuelve el catálogo en el idioma de Accept-Language", async () => {
    const controller = createRolesController(deps);

    const english = await controller.listPermissions(
      httpRequest({ headers: { "accept-language": "en-US,en;q=0.9" } }),
    );
    const fallback = await controller.listPermissions(httpRequest());

    expect(english).toEqual({
      status: 200,
      body: {
        groups: [{ module: "users", permissions: [{ key: "users:read", label: "View users" }] }],
      },
    });
    expect(fallback).toMatchObject({
      body: { groups: [{ permissions: [{ label: "Ver usuarios" }] }] },
    });
  });

  it("list y get devuelven los roles tal como los entrega el caso de uso", async () => {
    const controller = createRolesController(deps);

    expect(await controller.list(httpRequest())).toEqual({ status: 200, body: { roles: [ROLE] } });
    expect(await controller.get(httpRequest({ params: { id: "role-1" } }))).toEqual({
      status: 200,
      body: { role: ROLE },
    });
    expect(getRole.calls).toEqual(["role-1"]);
  });

  it("create valida el cuerpo y responde 201", async () => {
    const body = { name: "Soporte", permissions: ["users:read"] };

    const response = await createRolesController(deps).create(httpRequest({ body }));

    expect(createRole.calls).toEqual([body]);
    expect(response).toEqual({ status: 201, body: { role: ROLE } });
  });

  it("update une el id de la ruta con los cambios del cuerpo", async () => {
    const response = await createRolesController(deps).update(
      httpRequest({ params: { id: "role-1" }, body: { name: "Soporte N2" } }),
    );

    expect(updateRole.calls).toEqual([{ publicId: "role-1", changes: { name: "Soporte N2" } }]);
    expect(response).toEqual({ status: 200, body: { role: ROLE } });
  });

  it("remove responde 204 sin cuerpo", async () => {
    const response = await createRolesController(deps).remove(
      httpRequest({ params: { id: "role-1" } }),
    );

    expect(deleteRole.calls).toEqual(["role-1"]);
    expect(response).toEqual({ status: 204 });
  });

  it("getUserRoles comprueba que el usuario existe antes de leer su acceso", async () => {
    const response = await createRolesController(deps).getUserRoles(
      httpRequest({ params: { id: TARGET } }),
    );

    expect(getUser.calls).toEqual([TARGET]);
    expect(getUserAccess.calls).toEqual([TARGET]);
    expect(response).toEqual({
      status: 200,
      body: { roles: ACCESS.roles, permissions: ACCESS.permissions },
    });
  });

  it("getUserRoles no consulta el acceso de un usuario que no existe", async () => {
    deps.getUser = StubUseCase.failing(new AppError("not_found", { code: "USER_NOT_FOUND" }));

    await expect(
      createRolesController(deps).getUserRoles(httpRequest({ params: { id: TARGET } })),
    ).rejects.toMatchObject({ code: "USER_NOT_FOUND" });
    expect(getUserAccess.calls).toEqual([]);
  });

  it("setUserRoles indica quién hace el cambio y a quién", async () => {
    const response = await createRolesController(deps).setUserRoles(
      httpRequest({ user: ANA, params: { id: TARGET }, body: { roleIds: ["role-1"] } }),
    );

    expect(assignUserRoles.calls).toEqual([
      { actorPublicId: ANA.publicId, userPublicId: TARGET, roleIds: ["role-1"] },
    ]);
    expect(response).toMatchObject({ status: 200, body: { permissions: ["users:read"] } });
    expect(response).not.toHaveProperty("body.isSuperAdmin");
  });

  it("un cuerpo inválido no llega a ningún caso de uso", async () => {
    const controller = createRolesController(deps);

    await expect(controller.create(httpRequest({ body: {} }))).rejects.toMatchObject({
      kind: "validation",
    });
    await expect(
      controller.setUserRoles(httpRequest({ user: ANA, body: { roleIds: "role-1" } })),
    ).rejects.toMatchObject({ kind: "validation" });
    expect(createRole.calls).toEqual([]);
    expect(assignUserRoles.calls).toEqual([]);
  });
});
