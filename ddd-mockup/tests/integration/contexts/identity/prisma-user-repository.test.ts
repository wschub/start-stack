import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  type NewUserInput,
  User,
} from "../../../../src/contexts/identity/domain/aggregates/user.ts";
import { PrismaUserRepository } from "../../../../src/contexts/identity/infrastructure/database/prisma-user.repository.ts";
import { startTestDatabase, type TestDatabase } from "../../../helpers/postgres.ts";

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

  it("update guarda los cambios y conserva la fecha de creación", async () => {
    const user = newUser();
    await repository.add(user);
    const later = new Date(user.createdAt.getTime() + 60_000);

    await repository.update(user.changePassword("otro-hash", () => later).deactivate(() => later));

    const found = await repository.findByPublicId(user.publicId);
    expect(found?.passwordHash).toBe("otro-hash");
    expect(found?.status).toBe("INACTIVE");
    expect(found?.updatedAt).toEqual(later);
    expect(found?.createdAt).toEqual(user.createdAt);
  });

  it("update falla con USER_NOT_FOUND si el usuario no existe", async () => {
    await expect(repository.update(newUser())).rejects.toMatchObject({
      kind: "not_found",
      code: "USER_NOT_FOUND",
    });
  });

  it("list pagina por correo, busca sin distinguir mayúsculas y devuelve el total", async () => {
    await repository.add(newUser({ email: "carla@example.com", firstName: "Carla" }));
    await repository.add(newUser({ email: "ana@example.com", firstName: "Ana" }));
    await repository.add(newUser({ email: "beto@example.com", lastName: "ANAYA" }));

    const first = await repository.list({ page: 1, pageSize: 2 });
    const second = await repository.list({ page: 2, pageSize: 2 });
    const search = await repository.list({ page: 1, pageSize: 10, search: "ana" });

    expect(first.items.map((user) => user.email)).toEqual(["ana@example.com", "beto@example.com"]);
    expect(first.total).toBe(3);
    expect(second.items.map((user) => user.email)).toEqual(["carla@example.com"]);
    expect(search.items.map((user) => user.email)).toEqual(["ana@example.com", "beto@example.com"]);
    expect(search.total).toBe(2);
  });
});
