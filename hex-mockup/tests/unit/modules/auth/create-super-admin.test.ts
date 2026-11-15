import { beforeEach, describe, expect, it } from "vitest";
import { CreateSuperAdmin } from "../../../../src/modules/auth/application/use-cases/create-super-admin.use-case.ts";
import { Role } from "../../../../src/modules/auth/domain/entities/role.ts";
import { User } from "../../../../src/modules/users/domain/entities/user.entity.ts";
import { AppError } from "../../../../src/shared/errors/app-error.ts";
import { FakePasswordHasher, InMemoryUserRepository } from "../../../helpers/fakes.ts";
import { InMemoryRoleRepository, SUPER_ADMIN_ID } from "../../../helpers/role-fakes.ts";

const input = {
  email: "Root@Example.com",
  password: "una-clave-bastante-larga",
  firstName: "Root",
  lastName: "Admin",
};

describe("CreateSuperAdmin", () => {
  let users: InMemoryUserRepository;
  let roles: InMemoryRoleRepository;
  let createSuperAdmin: CreateSuperAdmin;

  beforeEach(() => {
    users = new InMemoryUserRepository();
    roles = new InMemoryRoleRepository(users);
    createSuperAdmin = new CreateSuperAdmin({ users, roles, hasher: new FakePasswordHasher() });
  });

  it("crea la cuenta con la contraseña hasheada y le concede SUPER_ADMIN", async () => {
    const result = await createSuperAdmin.execute(input);

    expect(result.created).toBe(true);
    expect(result.user).toMatchObject({ email: "root@example.com", status: "ACTIVE" });
    expect(JSON.stringify(result)).not.toContain("una-clave");
    const stored = await users.findByEmail("root@example.com");
    expect(stored?.passwordHash).toBe("hashed:una-clave-bastante-larga");
    const granted = await roles.findByUser(result.user.publicId);
    expect(granted.map((role) => role.publicId)).toEqual([SUPER_ADMIN_ID]);
  });

  it("si la cuenta ya existe le concede el rol sin tocar su contraseña ni sus otros roles", async () => {
    const existing = User.create({
      email: "root@example.com",
      passwordHash: "hash-original",
      firstName: "Root",
      lastName: "Admin",
    });
    await users.add(existing);
    const soporte = Role.create({ name: "Soporte" });
    await roles.add(soporte);
    await roles.setUserRoles(existing.publicId, [soporte.publicId]);

    const result = await createSuperAdmin.execute({ ...input, password: "" });

    expect(result.created).toBe(false);
    expect((await users.findByEmail("root@example.com"))?.passwordHash).toBe("hash-original");
    const names = (await roles.findByUser(existing.publicId)).map((role) => role.name);
    expect(names).toEqual(["SUPER_ADMIN", "Soporte"]);
  });

  it("ejecutarlo dos veces no duplica nada", async () => {
    await createSuperAdmin.execute(input);
    const again = await createSuperAdmin.execute(input);

    expect(again.created).toBe(false);
    expect(users.byEmail.size).toBe(1);
    expect(await roles.findByUser(again.user.publicId)).toHaveLength(1);
  });

  it("rechaza una contraseña débil o un correo inválido sin crear nada", async () => {
    await expect(createSuperAdmin.execute({ ...input, password: "corta" })).rejects.toMatchObject({
      code: "WEAK_PASSWORD",
    });
    await expect(
      createSuperAdmin.execute({ ...input, email: "no-es-correo" }),
    ).rejects.toMatchObject({ code: "INVALID_EMAIL" });
    expect(users.byEmail.size).toBe(0);
  });

  it("no concede el rol a una cuenta inactiva", async () => {
    const inactive = User.create({
      email: "root@example.com",
      passwordHash: "hash",
      firstName: "Root",
      lastName: "Admin",
    }).deactivate();
    await users.add(inactive);

    const error = await createSuperAdmin.execute(input).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).code).toBe("ACCOUNT_INACTIVE");
    expect(await roles.findByUser(inactive.publicId)).toEqual([]);
  });

  it("falla con un mensaje claro si falta el rol de sistema (migraciones sin aplicar)", async () => {
    await roles.remove(SUPER_ADMIN_ID);

    await expect(createSuperAdmin.execute(input)).rejects.toThrow(/run the migrations/);
  });
});
