import { beforeEach, describe, expect, it } from "vitest";
import { GetUserAccess } from "../../../../src/use-cases/auth/get-user-access.use-case.ts";
import { ProtectSuperAdmins } from "../../../../src/use-cases/auth/protect-super-admins.use-case.ts";
import { ChangeUserStatus } from "../../../../src/use-cases/users/change-user-status.use-case.ts";
import { GetUser } from "../../../../src/use-cases/users/get-user.use-case.ts";
import { ListUsers } from "../../../../src/use-cases/users/list-users.use-case.ts";
import { User } from "../../../../src/entities/user.ts";
import { AppError } from "../../../../src/entities/errors/app-error.ts";
import { InMemoryUserRepository } from "../../../helpers/fakes.ts";
import {
  InMemoryRoleRepository,
  SUPER_ADMIN_ID,
  testRegistry,
} from "../../../helpers/role-fakes.ts";

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

describe("administración de usuarios", () => {
  let users: InMemoryUserRepository;

  const add = async (email: string, firstName = "Ana", lastName = "Gómez") => {
    const user = User.create({ email, passwordHash: "secreto", firstName, lastName });
    await users.add(user);
    return user;
  };

  beforeEach(() => {
    users = new InMemoryUserRepository();
  });

  describe("ListUsers", () => {
    beforeEach(async () => {
      await add("carla@example.com", "Carla", "Ruiz");
      await add("ana@example.com", "Ana", "Gómez");
      await add("beto@example.com", "Beto", "Anaya");
    });

    it("devuelve la primera página ordenada por correo, sin datos privados", async () => {
      const page = await new ListUsers({ users }).execute();

      expect(page).toMatchObject({ page: 1, pageSize: 20, total: 3 });
      expect(page.items.map((user) => user.email)).toEqual([
        "ana@example.com",
        "beto@example.com",
        "carla@example.com",
      ]);
      expect(JSON.stringify(page)).not.toMatch(/secreto|passwordHash/);
    });

    it("pagina y conserva el total", async () => {
      const page = await new ListUsers({ users }).execute({ page: 2, pageSize: 2 });

      expect(page.items.map((user) => user.email)).toEqual(["carla@example.com"]);
      expect(page).toMatchObject({ page: 2, pageSize: 2, total: 3 });
    });

    it("busca en correo, nombre y apellido sin distinguir mayúsculas", async () => {
      const page = await new ListUsers({ users }).execute({ search: " ANA " });

      expect(page.items.map((user) => user.email)).toEqual(["ana@example.com", "beto@example.com"]);
      expect(page.total).toBe(2);
    });

    it("corrige páginas y tamaños fuera de rango", async () => {
      const page = await new ListUsers({ users }).execute({ page: 0, pageSize: 5000 });

      expect(page).toMatchObject({ page: 1, pageSize: 100 });
    });
  });

  describe("GetUser", () => {
    it("devuelve los datos públicos o USER_NOT_FOUND", async () => {
      const ana = await add("ana@example.com");
      const getUser = new GetUser({ users });

      expect(await getUser.execute(ana.publicId)).toMatchObject({ email: "ana@example.com" });
      expect(await codeOf(getUser.execute("no-existe"))).toBe("not_found:USER_NOT_FOUND");
    });
  });

  describe("ChangeUserStatus", () => {
    it("desactiva y vuelve a activar a otro usuario", async () => {
      const admin = await add("admin@example.com");
      const ana = await add("ana@example.com");
      const change = new ChangeUserStatus({ users, now: () => NOW });
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
      const change = new ChangeUserStatus({ users, now: () => NOW });

      await change.execute({
        actorPublicId: admin.publicId,
        userPublicId: ana.publicId,
        status: "ACTIVE",
      });

      expect((await users.findByPublicId(ana.publicId))?.updatedAt).toEqual(ana.updatedAt);
    });

    it("nadie puede desactivarse a sí mismo", async () => {
      const admin = await add("admin@example.com");
      const change = new ChangeUserStatus({ users });

      const result = change.execute({
        actorPublicId: admin.publicId,
        userPublicId: admin.publicId,
        status: "INACTIVE",
      });

      expect(await codeOf(result)).toBe("conflict:CANNOT_DEACTIVATE_SELF");
    });

    it("responde USER_NOT_FOUND si el usuario no existe", async () => {
      const admin = await add("admin@example.com");
      const change = new ChangeUserStatus({ users });

      const result = change.execute({
        actorPublicId: admin.publicId,
        userPublicId: "no-existe",
        status: "INACTIVE",
      });

      expect(await codeOf(result)).toBe("not_found:USER_NOT_FOUND");
    });

    describe("con la protección de superadministradores", () => {
      let roles: InMemoryRoleRepository;
      let change: ChangeUserStatus;

      beforeEach(() => {
        roles = new InMemoryRoleRepository(users);
        const getUserAccess = new GetUserAccess({ roles, registry: testRegistry() });
        change = new ChangeUserStatus({ users, guard: new ProtectSuperAdmins({ getUserAccess }) });
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
});
