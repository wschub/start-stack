import { beforeEach, describe, expect, it } from "vitest";
import { ChangeUserStatus } from "../../../../../../src/contexts/identity/application/commands/change-user-status.command.ts";
import { User } from "../../../../../../src/contexts/identity/domain/aggregates/user.ts";
import { AppError } from "../../../../../../src/shared/errors/app-error.ts";
import { InMemoryUserRepository } from "../../../../../helpers/fakes.ts";
import { InMemoryRoleRepository, SUPER_ADMIN_ID } from "../../../../../helpers/role-fakes.ts";

const NOW = new Date("2026-11-15T10:00:00Z");

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

const add = async (email: string, firstName = "Ana", lastName = "Gómez") => {
  const user = User.create({ email, passwordHash: "secreto", firstName, lastName });
  await users.add(user);
  return user;
};
let roles: InMemoryRoleRepository;

beforeEach(() => {
  users = new InMemoryUserRepository();
  roles = new InMemoryRoleRepository(users);
});

describe("ChangeUserStatus", () => {
  it("desactiva y vuelve a activar a otro usuario", async () => {
    const admin = await add("admin@example.com");
    const ana = await add("ana@example.com");
    const change = new ChangeUserStatus({ users, roles, now: () => NOW });
    const input = { actorPublicId: admin.publicId, userPublicId: ana.publicId };

    const off = await change.execute({ ...input, status: "INACTIVE" });
    expect(off.status).toBe("INACTIVE");
    expect((await users.findByPublicId(ana.publicId))?.updatedAt).toEqual(NOW);

    const on = await change.execute({ ...input, status: "ACTIVE" });
    expect(on.status).toBe("ACTIVE");
  });

  it("no hace nada si el usuario ya tiene ese estado", async () => {
    const admin = await add("admin@example.com");
    const ana = await add("ana@example.com");
    const change = new ChangeUserStatus({ users, roles, now: () => NOW });

    await change.execute({
      actorPublicId: admin.publicId,
      userPublicId: ana.publicId,
      status: "ACTIVE",
    });

    expect((await users.findByPublicId(ana.publicId))?.updatedAt).toEqual(ana.updatedAt);
  });

  it("nadie puede desactivarse a sí mismo", async () => {
    const admin = await add("admin@example.com");
    const change = new ChangeUserStatus({ users, roles });

    const result = change.execute({
      actorPublicId: admin.publicId,
      userPublicId: admin.publicId,
      status: "INACTIVE",
    });

    expect(await codeOf(result)).toBe("conflict:CANNOT_DEACTIVATE_SELF");
  });

  it("responde USER_NOT_FOUND si el usuario no existe", async () => {
    const admin = await add("admin@example.com");
    const change = new ChangeUserStatus({ users, roles });

    const result = change.execute({
      actorPublicId: admin.publicId,
      userPublicId: "no-existe",
      status: "INACTIVE",
    });

    expect(await codeOf(result)).toBe("not_found:USER_NOT_FOUND");
  });

  describe("con la protección de superadministradores", () => {
    let change: ChangeUserStatus;

    beforeEach(() => {
      change = new ChangeUserStatus({ users, roles });
    });

    it("quien no es superadministrador no puede desactivar a uno", async () => {
      const root = await add("root@example.com");
      const gestor = await add("gestor@example.com");
      await roles.setUserRoles(root.publicId, [SUPER_ADMIN_ID]);

      const result = change.execute({
        actorPublicId: gestor.publicId,
        userPublicId: root.publicId,
        status: "INACTIVE",
      });

      expect(await codeOf(result)).toBe("forbidden:SUPER_ADMIN_REQUIRED");
      expect((await users.findByPublicId(root.publicId))?.status).toBe("ACTIVE");
    });

    it("un superadministrador sí puede desactivar a otro, y cualquiera a un usuario normal", async () => {
      const root = await add("root@example.com");
      const other = await add("other@example.com");
      const gestor = await add("gestor@example.com");
      const ana = await add("ana@example.com");
      await roles.setUserRoles(root.publicId, [SUPER_ADMIN_ID]);
      await roles.setUserRoles(other.publicId, [SUPER_ADMIN_ID]);

      const first = await change.execute({
        actorPublicId: root.publicId,
        userPublicId: other.publicId,
        status: "INACTIVE",
      });
      const second = await change.execute({
        actorPublicId: gestor.publicId,
        userPublicId: ana.publicId,
        status: "INACTIVE",
      });

      expect([first.status, second.status]).toEqual(["INACTIVE", "INACTIVE"]);
    });
  });
});
