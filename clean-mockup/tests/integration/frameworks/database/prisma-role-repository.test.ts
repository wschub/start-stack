import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Role } from "../../../../src/entities/role.ts";
import { PrismaRoleRepository } from "../../../../src/frameworks/database/prisma-role.repository.ts";
import { User } from "../../../../src/entities/user.ts";
import { PrismaUserRepository } from "../../../../src/frameworks/database/prisma-user.repository.ts";
import { startTestDatabase, type TestDatabase } from "../../../helpers/postgres.ts";

const T0 = new Date("2026-11-15T10:00:00Z");
const T1 = new Date("2026-11-15T11:00:00Z");
const MISSING = "00000000-0000-4000-8000-00000000dead";

describe("PrismaRoleRepository (Postgres real)", () => {
  let db: TestDatabase;
  let roles: PrismaRoleRepository;
  let users: PrismaUserRepository;
  let ana: User;
  let luis: User;

  const newUser = (email: string) =>
    User.create({ email, passwordHash: "hash", firstName: "Ana", lastName: "Gómez" });
  const newRole = (name: string, permissions: string[] = []) =>
    Role.create({ name, permissions }, { now: () => T0 });
  const superAdmin = async () => {
    const role = await roles.findByName("SUPER_ADMIN");
    if (!role) throw new Error("falta el rol de sistema");
    return role;
  };

  beforeAll(async () => {
    db = await startTestDatabase();
    roles = new PrismaRoleRepository(db.prisma);
    users = new PrismaUserRepository(db.prisma);
  });

  afterAll(async () => {
    await db?.stop();
  });

  beforeEach(async () => {
    await db.prisma.user.deleteMany();
    await db.prisma.role.deleteMany({ where: { isSystem: false } });
    ana = newUser("ana@example.com");
    luis = newUser("luis@example.com");
    await users.add(ana);
    await users.add(luis);
  });

  it("la migración deja creado el rol de sistema SUPER_ADMIN, sin permisos guardados", async () => {
    const role = await superAdmin();

    expect(role.isSuperAdmin()).toBe(true);
    expect(role.isSystem).toBe(true);
    expect(role.permissions).toEqual([]);
    expect(role.publicId).toMatch(/^[0-9a-f-]{36}$/);
    expect((await roles.findByName(" super-admin "))?.publicId).toBe(role.publicId);
  });

  it("guarda un rol y lo recupera por id y por nombre con los mismos datos", async () => {
    const role = Role.create(
      { name: "Jefe de ventas", description: "Equipo", permissions: ["users:read", "roles:read"] },
      { now: () => T0 },
    );
    await roles.add(role);

    expect((await roles.findByPublicId(role.publicId))?.toProps()).toEqual(role.toProps());
    expect((await roles.findByName("JEFE-DE-VENTAS"))?.publicId).toBe(role.publicId);
  });

  it("devuelve null para un id inexistente o con formato inválido", async () => {
    expect(await roles.findByPublicId(MISSING)).toBeNull();
    expect(await roles.findByPublicId("no-es-uuid")).toBeNull();
    expect(await roles.findByName("No existe")).toBeNull();
  });

  it("rechaza un nombre repetido, aunque cambie la forma de escribirlo", async () => {
    await roles.add(newRole("Jefe de ventas"));

    await expect(roles.add(newRole("jefe_de_ventas"))).rejects.toMatchObject({
      kind: "conflict",
      code: "ROLE_NAME_TAKEN",
    });
  });

  it("update sustituye nombre, descripción y permisos", async () => {
    const role = newRole("Soporte", ["users:read", "roles:read"]);
    await roles.add(role);

    const updated = role.update({ name: "Soporte N2", permissions: ["users:update"] }, () => T1);
    await roles.update(updated);

    expect((await roles.findByPublicId(role.publicId))?.toProps()).toEqual(updated.toProps());
    expect(await db.prisma.rolePermission.count()).toBe(1);
  });

  it("update falla si el nombre ya es de otro rol o si el rol no existe", async () => {
    const soporte = newRole("Soporte");
    await roles.add(soporte);
    await roles.add(newRole("Ventas"));

    await expect(roles.update(soporte.update({ name: "ventas" }))).rejects.toMatchObject({
      code: "ROLE_NAME_TAKEN",
    });
    await expect(roles.update(newRole("Fantasma"))).rejects.toMatchObject({
      kind: "not_found",
      code: "ROLE_NOT_FOUND",
    });
  });

  it("list devuelve primero los roles de sistema y después el resto por nombre", async () => {
    await roles.add(newRole("Ventas"));
    await roles.add(newRole("Compras"));

    expect((await roles.list()).map((role) => role.name)).toEqual([
      "SUPER_ADMIN",
      "Compras",
      "Ventas",
    ]);
  });

  it("setUserRoles sustituye los roles del usuario y findByUser los devuelve", async () => {
    const soporte = newRole("Soporte", ["users:read"]);
    const ventas = newRole("Ventas");
    await roles.add(soporte);
    await roles.add(ventas);
    const system = await superAdmin();

    await roles.setUserRoles(ana.publicId, [soporte.publicId, system.publicId]);
    expect((await roles.findByUser(ana.publicId)).map((role) => role.name)).toEqual([
      "SUPER_ADMIN",
      "Soporte",
    ]);

    await roles.setUserRoles(ana.publicId, [ventas.publicId, MISSING, "no-es-uuid"]);
    expect((await roles.findByUser(ana.publicId)).map((role) => role.name)).toEqual(["Ventas"]);
    expect(await roles.findByUser(luis.publicId)).toEqual([]);

    await roles.setUserRoles(ana.publicId, []);
    expect(await roles.findByUser(ana.publicId)).toEqual([]);
  });

  it("setUserRoles falla con USER_NOT_FOUND si el usuario no existe", async () => {
    await expect(roles.setUserRoles(MISSING, [])).rejects.toMatchObject({
      code: "USER_NOT_FOUND",
    });
  });

  it("remove borra el rol, sus permisos y sus asignaciones, pero no a los usuarios", async () => {
    const soporte = newRole("Soporte", ["users:read"]);
    await roles.add(soporte);
    await roles.setUserRoles(ana.publicId, [soporte.publicId]);

    await roles.remove(soporte.publicId);

    expect(await roles.findByPublicId(soporte.publicId)).toBeNull();
    expect(await roles.findByUser(ana.publicId)).toEqual([]);
    expect(await db.prisma.rolePermission.count()).toBe(0);
    expect(await users.findByPublicId(ana.publicId)).not.toBeNull();
  });

  it("countActiveUsersWithRole cuenta solo a los usuarios activos", async () => {
    const system = await superAdmin();
    await roles.setUserRoles(ana.publicId, [system.publicId]);
    await roles.setUserRoles(luis.publicId, [system.publicId]);
    expect(await roles.countActiveUsersWithRole(system.publicId)).toBe(2);

    await users.update(luis.deactivate());

    expect(await roles.countActiveUsersWithRole(system.publicId)).toBe(1);
  });

  it("al borrar un usuario se borran sus asignaciones de roles", async () => {
    const system = await superAdmin();
    await roles.setUserRoles(ana.publicId, [system.publicId]);

    await db.prisma.user.delete({ where: { publicId: ana.publicId } });

    expect(await db.prisma.userRole.count()).toBe(0);
    expect(await roles.findByName("SUPER_ADMIN")).not.toBeNull();
  });
});
