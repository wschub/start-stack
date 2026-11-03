import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { type NewUserInput, User } from "../../../src/modules/users/domain/entities/user.entity.ts";
import { PrismaUserRepository } from "../../../src/modules/users/infrastructure/database/prisma-user.repository.ts";
import { startTestDatabase, type TestDatabase } from "../../helpers/postgres.ts";

describe("PrismaUserRepository (Postgres real)", () => {
  let db: TestDatabase;
  let repository: PrismaUserRepository;

  beforeAll(async () => {
    db = await startTestDatabase();
    repository = new PrismaUserRepository(db.prisma);
  });

  afterAll(async () => {
    await db?.stop();
  });

  beforeEach(async () => {
    await db.prisma.user.deleteMany();
  });

  const newUser = (overrides: Partial<NewUserInput> = {}) =>
    User.create({
      email: "ana@example.com",
      passwordHash: "hash",
      firstName: "Ana",
      lastName: "Gómez",
      ...overrides,
    });

  it("guarda un usuario y lo recupera por email con los mismos datos", async () => {
    const user = newUser({ countryDefault: "CO", mobilePhone: "+573001234567", locale: "en" });
    await repository.add(user);
    const found = await repository.findByEmail("  ANA@example.com ");
    expect(found?.toProps()).toEqual(user.toProps());
  });

  it("lo recupera por publicId", async () => {
    const user = newUser();
    await repository.add(user);
    const found = await repository.findByPublicId(user.publicId);
    expect(found?.email).toBe("ana@example.com");
  });

  it("devuelve null cuando no existe", async () => {
    expect(await repository.findByEmail("nadie@example.com")).toBeNull();
    expect(await repository.findByPublicId(randomUUID())).toBeNull();
  });

  it("devuelve null para un publicId con formato inválido", async () => {
    expect(await repository.findByPublicId("no-es-uuid")).toBeNull();
  });

  it("rechaza un email duplicado con el código EMAIL_ALREADY_EXISTS", async () => {
    await repository.add(newUser());
    await expect(repository.add(newUser())).rejects.toMatchObject({
      kind: "conflict",
      code: "EMAIL_ALREADY_EXISTS",
    });
  });
});
