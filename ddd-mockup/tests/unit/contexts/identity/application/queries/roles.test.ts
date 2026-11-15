import { beforeEach, describe, expect, it } from "vitest";
import { GetRole } from "../../../../../../src/contexts/identity/application/queries/get-role.query.ts";
import { ListRoles } from "../../../../../../src/contexts/identity/application/queries/list-roles.query.ts";
import { Role } from "../../../../../../src/contexts/identity/domain/aggregates/role.ts";
import { AppError } from "../../../../../../src/shared/errors/app-error.ts";
import {
  InMemoryRoleRepository,
  SUPER_ADMIN_ID,
  testRegistry,
} from "../../../../../helpers/role-fakes.ts";

const ALL = ["roles:read", "roles:manage", "roles:assign", "users:read", "users:update"];
const T0 = new Date("2026-11-15T10:00:00Z");

let roles: InMemoryRoleRepository;
let listRoles: ListRoles;
let getRole: GetRole;

const add = async (name: string, permissions: string[] = []) => {
  const role = Role.create({ name, permissions }, { now: () => T0 });
  await roles.add(role);
  return role;
};

beforeEach(() => {
  roles = new InMemoryRoleRepository();
  const registry = testRegistry();
  listRoles = new ListRoles({ roles, registry });
  getRole = new GetRole({ roles, registry });
});

describe("ListRoles", () => {
  it("lista primero el rol de sistema, con todos los permisos del catálogo", async () => {
    await add("Ventas", ["roles:read"]);
    await add("Soporte", ["users:read"]);

    const list = await listRoles.execute();

    expect(list.map((role) => role.name)).toEqual(["SUPER_ADMIN", "Soporte", "Ventas"]);
    expect(list[0]).toMatchObject({ isSystem: true, permissions: ALL });
    expect(list[1]).toMatchObject({ isSystem: false, permissions: ["users:read"] });
  });

  it("no muestra los permisos guardados que ya no existen en el catálogo", async () => {
    await add("Viejo", ["users:read", "legacy:thing"]);

    const [, viejo] = await listRoles.execute();

    expect(viejo?.permissions).toEqual(["users:read"]);
  });
});

describe("GetRole", () => {
  it("devuelve la vista pública del rol, con las fechas en ISO 8601", async () => {
    const role = await add("Soporte", ["users:read"]);

    expect(await getRole.execute(role.publicId)).toEqual({
      publicId: role.publicId,
      name: "Soporte",
      description: null,
      isSystem: false,
      permissions: ["users:read"],
      createdAt: T0.toISOString(),
      updatedAt: T0.toISOString(),
    });
  });

  it("SUPER_ADMIN tiene todos los permisos aunque no guarde ninguno", async () => {
    expect((await getRole.execute(SUPER_ADMIN_ID)).permissions).toEqual(ALL);
  });

  it("responde ROLE_NOT_FOUND si el rol no existe", async () => {
    const error = await getRole
      .execute("00000000-0000-4000-8000-00000000dead")
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject({ kind: "not_found", code: "ROLE_NOT_FOUND" });
  });
});
