import { beforeEach, describe, expect, it } from "vitest";
import { AssignUserRoles } from "../../../../src/contexts/identity/application/commands/assign-user-roles.command.ts";
import { GetUserAccess } from "../../../../src/contexts/identity/application/queries/get-user-access.query.ts";
import { ManageRoles } from "../../../../src/contexts/identity/application/commands/manage-roles.command.ts";
import { Role } from "../../../../src/contexts/identity/domain/aggregates/role.ts";
import { User } from "../../../../src/contexts/identity/domain/aggregates/user.ts";
import { AppError } from "../../../../src/shared/errors/app-error.ts";
import { InMemoryUserRepository } from "../../../helpers/fakes.ts";
import {
  InMemoryRoleRepository,
  SUPER_ADMIN_ID,
  testRegistry,
} from "../../../helpers/role-fakes.ts";

const ALL = ["roles:read", "roles:manage", "roles:assign", "users:read", "users:update"];

async function codeOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof AppError) return `${error.kind}:${error.code}`;
    throw error;
  }
  return "sin error";
}

describe("roles y permisos", () => {
  let users: InMemoryUserRepository;
  let roles: InMemoryRoleRepository;
  let manage: ManageRoles;
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
    manage = new ManageRoles({ roles, registry });
    access = new GetUserAccess({ roles, registry });
    assign = new AssignUserRoles({ users, roles, getUserAccess: access });
    root = await newUser("root@example.com");
    ana = await newUser("ana@example.com");
    await roles.setUserRoles(root.publicId, [SUPER_ADMIN_ID]);
  });

  describe("ManageRoles", () => {
    it("lista primero el rol de sistema, con todos los permisos del catálogo", async () => {
      await manage.create({ name: "Soporte", permissions: ["users:read"] });

      const list = await manage.list();

      expect(list.map((role) => role.name)).toEqual(["SUPER_ADMIN", "Soporte"]);
      expect(list[0]).toMatchObject({ isSystem: true, permissions: ALL });
      expect(list[1]).toMatchObject({ isSystem: false, permissions: ["users:read"] });
    });

    it("crea un rol y lo devuelve con sus datos públicos", async () => {
      const role = await manage.create({
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
      expect(await manage.get(role.publicId)).toEqual(role);
    });

    it("rechaza permisos que no están en el catálogo y no guarda nada", async () => {
      const result = manage.create({ name: "Soporte", permissions: ["users:read", "users:fly"] });

      expect(await codeOf(result)).toBe("validation:UNKNOWN_PERMISSION");
      expect(await manage.list()).toHaveLength(1);
    });

    it("rechaza un nombre repetido aunque cambie la forma de escribirlo", async () => {
      await manage.create({ name: "Jefe de ventas" });

      expect(await codeOf(manage.create({ name: "jefe-de-ventas" }))).toBe(
        "conflict:ROLE_NAME_TAKEN",
      );
    });

    it("edita nombre, descripción y permisos", async () => {
      const role = await manage.create({ name: "Soporte", permissions: ["users:read"] });

      const updated = await manage.update(role.publicId, {
        name: "Soporte N2",
        permissions: ["users:read", "users:update"],
      });

      expect(updated).toMatchObject({
        name: "Soporte N2",
        permissions: ["users:read", "users:update"],
      });
      expect(await manage.get(role.publicId)).toEqual(updated);
    });

    it("al editar rechaza permisos desconocidos y nombres ya usados por otro rol", async () => {
      const role = await manage.create({ name: "Soporte" });
      await manage.create({ name: "Ventas" });

      expect(await codeOf(manage.update(role.publicId, { permissions: ["x:y"] }))).toBe(
        "validation:UNKNOWN_PERMISSION",
      );
      expect(await codeOf(manage.update(role.publicId, { name: "VENTAS" }))).toBe(
        "conflict:ROLE_NAME_TAKEN",
      );
      expect((await manage.update(role.publicId, { name: "SOPORTE" })).name).toBe("SOPORTE");
    });

    it("no permite editar ni borrar SUPER_ADMIN", async () => {
      expect(await codeOf(manage.update(SUPER_ADMIN_ID, { permissions: [] }))).toBe(
        "forbidden:SYSTEM_ROLE_IMMUTABLE",
      );
      expect(await codeOf(manage.remove(SUPER_ADMIN_ID))).toBe("forbidden:SYSTEM_ROLE_IMMUTABLE");
    });

    it("borra un rol y lo retira de quienes lo tenían", async () => {
      const role = await manage.create({ name: "Soporte", permissions: ["users:read"] });
      await roles.setUserRoles(ana.publicId, [role.publicId]);

      await manage.remove(role.publicId);

      expect(await codeOf(manage.get(role.publicId))).toBe("not_found:ROLE_NOT_FOUND");
      expect((await access.execute(ana.publicId)).permissions).toEqual([]);
    });

    it("responde ROLE_NOT_FOUND al ver, editar o borrar un rol que no existe", async () => {
      const id = "00000000-0000-4000-8000-00000000dead";

      expect(await codeOf(manage.get(id))).toBe("not_found:ROLE_NOT_FOUND");
      expect(await codeOf(manage.update(id, { name: "Otro" }))).toBe("not_found:ROLE_NOT_FOUND");
      expect(await codeOf(manage.remove(id))).toBe("not_found:ROLE_NOT_FOUND");
    });
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
      const a = await manage.create({ name: "A1", description: null, permissions: ["users:read"] });
      const b = await manage.create({ name: "B1", permissions: ["users:read", "roles:read"] });
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

  describe("AssignUserRoles", () => {
    it("sustituye los roles del usuario y devuelve su acceso", async () => {
      const soporte = await manage.create({ name: "Soporte", permissions: ["users:read"] });
      const ventas = await manage.create({ name: "Ventas", permissions: ["roles:read"] });
      const by = { actorPublicId: root.publicId, userPublicId: ana.publicId };

      await assign.execute({ ...by, roleIds: [soporte.publicId] });
      const result = await assign.execute({ ...by, roleIds: [ventas.publicId, ventas.publicId] });

      expect(result.roles.map((role) => role.name)).toEqual(["Ventas"]);
      expect(result.permissions).toEqual(["roles:read"]);
    });

    it("con una lista vacía deja al usuario sin roles", async () => {
      const soporte = await manage.create({ name: "Soporte" });
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
      const gestor = await manage.create({ name: "Gestor", permissions: ["roles:assign"] });
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
      const gestor = await manage.create({ name: "Gestor", permissions: ["roles:assign"] });
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
      const gestor = await manage.create({ name: "Gestor", permissions: ["roles:assign"] });
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
});
