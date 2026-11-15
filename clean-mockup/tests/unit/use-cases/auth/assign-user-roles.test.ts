import { beforeEach, describe, expect, it } from "vitest";
import { AssignUserRoles } from "../../../../src/use-cases/auth/assign-user-roles.use-case.ts";
import { CreateRole } from "../../../../src/use-cases/auth/create-role.use-case.ts";
import { GetUserAccess } from "../../../../src/use-cases/auth/get-user-access.use-case.ts";
import { User } from "../../../../src/entities/user.ts";
import { AppError } from "../../../../src/entities/errors/app-error.ts";
import { InMemoryUserRepository } from "../../../helpers/fakes.ts";
import {
  InMemoryRoleRepository,
  SUPER_ADMIN_ID,
  testRegistry,
} from "../../../helpers/role-fakes.ts";

async function codeOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof AppError) return `${error.kind}:${error.code}`;
    throw error;
  }
  return "sin error";
}

let users: InMemoryUserRepository;
let roles: InMemoryRoleRepository;
let createRole: CreateRole;
let access: GetUserAccess;
let assign: AssignUserRoles;
let root: User;
let ana: User;

const newUser = async (email: string) => {
  const user = User.create({ email, passwordHash: "hash", firstName: "Ana", lastName: "Gómez" });
  await users.add(user);
  return user;
};

beforeEach(async () => {
  users = new InMemoryUserRepository();
  roles = new InMemoryRoleRepository(users);
  const registry = testRegistry();
  createRole = new CreateRole({ roles, registry });
  access = new GetUserAccess({ roles, registry });
  assign = new AssignUserRoles({ users, roles, getUserAccess: access });
  root = await newUser("root@example.com");
  ana = await newUser("ana@example.com");
  await roles.setUserRoles(root.publicId, [SUPER_ADMIN_ID]);
});

describe("AssignUserRoles", () => {
  it("sustituye los roles del usuario y devuelve su acceso", async () => {
    const soporte = await createRole.execute({ name: "Soporte", permissions: ["users:read"] });
    const ventas = await createRole.execute({ name: "Ventas", permissions: ["roles:read"] });
    const by = { actorPublicId: root.publicId, userPublicId: ana.publicId };

    await assign.execute({ ...by, roleIds: [soporte.publicId] });
    const result = await assign.execute({ ...by, roleIds: [ventas.publicId, ventas.publicId] });

    expect(result.roles.map((role) => role.name)).toEqual(["Ventas"]);
    expect(result.permissions).toEqual(["roles:read"]);
  });

  it("con una lista vacía deja al usuario sin roles", async () => {
    const soporte = await createRole.execute({ name: "Soporte" });
    await roles.setUserRoles(ana.publicId, [soporte.publicId]);

    const result = await assign.execute({
      actorPublicId: root.publicId,
      userPublicId: ana.publicId,
      roleIds: [],
    });

    expect(result.roles).toEqual([]);
  });

  it("rechaza un usuario o un rol que no existen", async () => {
    const missing = "00000000-0000-4000-8000-00000000dead";

    expect(
      await codeOf(
        assign.execute({ actorPublicId: root.publicId, userPublicId: missing, roleIds: [] }),
      ),
    ).toBe("not_found:USER_NOT_FOUND");
    expect(
      await codeOf(
        assign.execute({
          actorPublicId: root.publicId,
          userPublicId: ana.publicId,
          roleIds: [missing],
        }),
      ),
    ).toBe("validation:UNKNOWN_ROLE");
  });

  it("solo un superadministrador puede conceder SUPER_ADMIN", async () => {
    const gestor = await createRole.execute({ name: "Gestor", permissions: ["roles:assign"] });
    const luis = await newUser("luis@example.com");
    await roles.setUserRoles(luis.publicId, [gestor.publicId]);

    const escalation = assign.execute({
      actorPublicId: luis.publicId,
      userPublicId: luis.publicId,
      roleIds: [gestor.publicId, SUPER_ADMIN_ID],
    });
    expect(await codeOf(escalation)).toBe("forbidden:SUPER_ADMIN_REQUIRED");

    const granted = await assign.execute({
      actorPublicId: root.publicId,
      userPublicId: ana.publicId,
      roleIds: [SUPER_ADMIN_ID],
    });
    expect(granted.isSuperAdmin).toBe(true);
  });

  it("solo un superadministrador puede retirar SUPER_ADMIN a otro", async () => {
    const gestor = await createRole.execute({ name: "Gestor", permissions: ["roles:assign"] });
    const luis = await newUser("luis@example.com");
    await roles.setUserRoles(luis.publicId, [gestor.publicId]);
    await roles.setUserRoles(ana.publicId, [SUPER_ADMIN_ID]);

    const result = assign.execute({
      actorPublicId: luis.publicId,
      userPublicId: ana.publicId,
      roleIds: [],
    });

    expect(await codeOf(result)).toBe("forbidden:SUPER_ADMIN_REQUIRED");
  });

  it("quien no es superadministrador sí puede cambiar los demás roles de un superadministrador", async () => {
    const gestor = await createRole.execute({ name: "Gestor", permissions: ["roles:assign"] });
    const luis = await newUser("luis@example.com");
    await roles.setUserRoles(luis.publicId, [gestor.publicId]);

    const result = await assign.execute({
      actorPublicId: luis.publicId,
      userPublicId: root.publicId,
      roleIds: [SUPER_ADMIN_ID, gestor.publicId],
    });

    expect(result.roles.map((role) => role.name)).toEqual(["SUPER_ADMIN", "Gestor"]);
  });

  it("no permite retirar SUPER_ADMIN al último superadministrador activo", async () => {
    const result = assign.execute({
      actorPublicId: root.publicId,
      userPublicId: root.publicId,
      roleIds: [],
    });

    expect(await codeOf(result)).toBe("conflict:LAST_SUPER_ADMIN");
    expect((await access.execute(root.publicId)).isSuperAdmin).toBe(true);
  });

  it("un superadministrador inactivo no cuenta como el último", async () => {
    await roles.setUserRoles(ana.publicId, [SUPER_ADMIN_ID]);
    await users.update(ana.deactivate());

    const result = assign.execute({
      actorPublicId: root.publicId,
      userPublicId: root.publicId,
      roleIds: [],
    });

    expect(await codeOf(result)).toBe("conflict:LAST_SUPER_ADMIN");
  });

  it("sí permite retirarlo cuando queda otro superadministrador activo", async () => {
    await roles.setUserRoles(ana.publicId, [SUPER_ADMIN_ID]);

    const result = await assign.execute({
      actorPublicId: root.publicId,
      userPublicId: root.publicId,
      roleIds: [],
    });

    expect(result.isSuperAdmin).toBe(false);
  });
});
