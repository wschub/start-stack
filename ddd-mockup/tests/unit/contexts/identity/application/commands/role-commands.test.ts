import { beforeEach, describe, expect, it } from "vitest";
import { CreateRole } from "../../../../../../src/contexts/identity/application/commands/create-role.command.ts";
import { DeleteRole } from "../../../../../../src/contexts/identity/application/commands/delete-role.command.ts";
import { UpdateRole } from "../../../../../../src/contexts/identity/application/commands/update-role.command.ts";
import { AppError } from "../../../../../../src/shared/errors/app-error.ts";
import {
  InMemoryRoleRepository,
  SUPER_ADMIN_ID,
  testRegistry,
} from "../../../../../helpers/role-fakes.ts";

const MISSING = "00000000-0000-4000-8000-00000000dead";
const USER = "11111111-1111-4111-8111-111111111111";

async function codeOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof AppError) return `${error.kind}:${error.code}`;
    throw error;
  }
  return "sin error";
}

let roles: InMemoryRoleRepository;
let createRole: CreateRole;
let updateRole: UpdateRole;
let deleteRole: DeleteRole;

beforeEach(() => {
  roles = new InMemoryRoleRepository();
  const registry = testRegistry();
  createRole = new CreateRole({ roles, registry });
  updateRole = new UpdateRole({ roles, registry });
  deleteRole = new DeleteRole({ roles });
});

describe("CreateRole", () => {
  it("crea un rol, lo guarda y lo devuelve con sus datos públicos", async () => {
    const role = await createRole.execute({
      name: "Soporte",
      description: "Nivel 1",
      permissions: ["users:read", "roles:read"],
    });

    expect(role).toMatchObject({
      name: "Soporte",
      description: "Nivel 1",
      isSystem: false,
      permissions: ["roles:read", "users:read"],
    });
    expect((await roles.findByPublicId(role.publicId))?.name).toBe("Soporte");
  });

  it("rechaza permisos que no están en el catálogo y no guarda nada", async () => {
    const result = createRole.execute({
      name: "Soporte",
      permissions: ["users:read", "users:fly"],
    });

    expect(await codeOf(result)).toBe("validation:UNKNOWN_PERMISSION");
    expect(await roles.list()).toHaveLength(1);
  });

  it("indica qué permisos son los desconocidos", async () => {
    const error = await createRole
      .execute({ name: "Soporte", permissions: ["users:fly", "x:y"] })
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).details).toEqual({
      issues: [
        { field: "permissions", code: "users:fly" },
        { field: "permissions", code: "x:y" },
      ],
    });
  });

  it("rechaza un nombre repetido aunque cambie la forma de escribirlo", async () => {
    await createRole.execute({ name: "Jefe de ventas" });

    expect(await codeOf(createRole.execute({ name: "jefe-de-ventas" }))).toBe(
      "conflict:ROLE_NAME_TAKEN",
    );
  });

  it("no deja crear otro rol con el nombre del rol de sistema", async () => {
    expect(await codeOf(createRole.execute({ name: "super admin" }))).toBe(
      "conflict:ROLE_NAME_TAKEN",
    );
  });
});

describe("UpdateRole", () => {
  it("edita nombre, descripción y permisos, y guarda el resultado", async () => {
    const role = await createRole.execute({ name: "Soporte", permissions: ["users:read"] });

    const updated = await updateRole.execute({
      publicId: role.publicId,
      changes: { name: "Soporte N2", permissions: ["users:read", "users:update"] },
    });

    expect(updated).toMatchObject({
      name: "Soporte N2",
      permissions: ["users:read", "users:update"],
    });
    expect((await roles.findByPublicId(role.publicId))?.toProps()).toMatchObject({
      name: "Soporte N2",
      permissions: ["users:read", "users:update"],
    });
  });

  it("rechaza permisos desconocidos y nombres ya usados por otro rol", async () => {
    const { publicId } = await createRole.execute({ name: "Soporte" });
    await createRole.execute({ name: "Ventas" });

    expect(await codeOf(updateRole.execute({ publicId, changes: { permissions: ["x:y"] } }))).toBe(
      "validation:UNKNOWN_PERMISSION",
    );
    expect(await codeOf(updateRole.execute({ publicId, changes: { name: "VENTAS" } }))).toBe(
      "conflict:ROLE_NAME_TAKEN",
    );
  });

  it("permite cambiar solo la forma de escribir su propio nombre", async () => {
    const { publicId } = await createRole.execute({ name: "Soporte" });

    const updated = await updateRole.execute({ publicId, changes: { name: "SOPORTE" } });

    expect(updated.name).toBe("SOPORTE");
  });

  it("no permite editar SUPER_ADMIN, ni siquiera con permisos desconocidos en la petición", async () => {
    expect(
      await codeOf(updateRole.execute({ publicId: SUPER_ADMIN_ID, changes: { permissions: [] } })),
    ).toBe("forbidden:SYSTEM_ROLE_IMMUTABLE");
    expect(
      await codeOf(
        updateRole.execute({ publicId: SUPER_ADMIN_ID, changes: { permissions: ["x:y"] } }),
      ),
    ).toBe("forbidden:SYSTEM_ROLE_IMMUTABLE");
  });

  it("responde ROLE_NOT_FOUND si el rol no existe", async () => {
    expect(await codeOf(updateRole.execute({ publicId: MISSING, changes: { name: "Otro" } }))).toBe(
      "not_found:ROLE_NOT_FOUND",
    );
  });
});

describe("DeleteRole", () => {
  it("borra el rol y lo retira de quienes lo tenían", async () => {
    const role = await createRole.execute({ name: "Soporte", permissions: ["users:read"] });
    await roles.setUserRoles(USER, [role.publicId]);

    await deleteRole.execute(role.publicId);

    expect(await roles.findByPublicId(role.publicId)).toBeNull();
    expect(await roles.findByUser(USER)).toEqual([]);
  });

  it("no permite borrar SUPER_ADMIN", async () => {
    expect(await codeOf(deleteRole.execute(SUPER_ADMIN_ID))).toBe(
      "forbidden:SYSTEM_ROLE_IMMUTABLE",
    );
    expect(await roles.findByPublicId(SUPER_ADMIN_ID)).not.toBeNull();
  });

  it("responde ROLE_NOT_FOUND si el rol no existe", async () => {
    expect(await codeOf(deleteRole.execute(MISSING))).toBe("not_found:ROLE_NOT_FOUND");
  });
});
