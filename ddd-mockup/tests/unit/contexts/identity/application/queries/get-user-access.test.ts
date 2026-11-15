import { beforeEach, describe, expect, it } from "vitest";
import { GetUserAccess } from "../../../../../../src/contexts/identity/application/queries/get-user-access.query.ts";
import { Role } from "../../../../../../src/contexts/identity/domain/aggregates/role.ts";
import { User } from "../../../../../../src/contexts/identity/domain/aggregates/user.ts";
import { InMemoryUserRepository } from "../../../../../helpers/fakes.ts";
import {
  InMemoryRoleRepository,
  SUPER_ADMIN_ID,
  testRegistry,
} from "../../../../../helpers/role-fakes.ts";
const ALL = ["roles:read", "roles:manage", "roles:assign", "users:read", "users:update"];

let users: InMemoryUserRepository;
let roles: InMemoryRoleRepository;
let access: GetUserAccess;
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
  access = new GetUserAccess({ roles, registry });
  root = await newUser("root@example.com");
  ana = await newUser("ana@example.com");
  await roles.setUserRoles(root.publicId, [SUPER_ADMIN_ID]);
});

describe("GetUserAccess", () => {
  it("un usuario sin roles no tiene permisos", async () => {
    expect(await access.execute(ana.publicId)).toEqual({
      roles: [],
      permissions: [],
      isSuperAdmin: false,
    });
  });

  it("une los permisos de todos sus roles, sin repetir", async () => {
    const a = Role.create({ name: "A1", description: null, permissions: ["users:read"] });
    const b = Role.create({ name: "B1", permissions: ["users:read", "roles:read"] });
    await roles.add(a);
    await roles.add(b);
    await roles.setUserRoles(ana.publicId, [a.publicId, b.publicId]);

    const result = await access.execute(ana.publicId);

    expect(result.permissions).toEqual(["roles:read", "users:read"]);
    expect(result.roles.map((role) => role.name)).toEqual(["A1", "B1"]);
    expect(result.isSuperAdmin).toBe(false);
  });

  it("SUPER_ADMIN tiene todos los permisos del catálogo", async () => {
    expect(await access.execute(root.publicId)).toMatchObject({
      permissions: ALL,
      isSuperAdmin: true,
    });
  });

  it("ignora los permisos guardados que ya no existen en el catálogo", async () => {
    const stale = Role.create({ name: "Viejo", permissions: ["users:read", "legacy:thing"] });
    await roles.add(stale);
    await roles.setUserRoles(ana.publicId, [stale.publicId]);

    expect((await access.execute(ana.publicId)).permissions).toEqual(["users:read"]);
  });
});
