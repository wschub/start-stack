import { beforeEach, describe, expect, it } from "vitest";
import { AuthenticateUser } from "../../../../src/modules/auth/application/use-cases/authenticate-user.use-case.ts";
import { User } from "../../../../src/modules/users/domain/entities/user.entity.ts";
import { FakePasswordHasher, InMemoryUserRepository } from "../../../helpers/fakes.ts";

const PASSWORD = "una-clave-bastante-larga";

describe("AuthenticateUser", () => {
  let users: InMemoryUserRepository;
  let hasher: FakePasswordHasher;
  let authenticate: AuthenticateUser;

  const seed = async (inactive = false) => {
    const created = User.create({
      email: "ana@example.com",
      passwordHash: `hashed:${PASSWORD}`,
      firstName: "Ana",
      lastName: "Gómez",
    });
    const user = inactive ? created.deactivate() : created;
    await users.add(user);
    return user;
  };

  beforeEach(() => {
    users = new InMemoryUserRepository();
    hasher = new FakePasswordHasher();
    authenticate = new AuthenticateUser({ users, hasher });
  });

  it("devuelve al usuario cuando las credenciales son correctas", async () => {
    const seeded = await seed();
    const user = await authenticate.execute({ email: "ana@example.com", password: PASSWORD });
    expect(user.publicId).toBe(seeded.publicId);
  });

  it("normaliza el email al buscar", async () => {
    await seed();
    const user = await authenticate.execute({ email: "  ANA@Example.com ", password: PASSWORD });
    expect(user.email).toBe("ana@example.com");
  });

  it("rechaza un email inexistente con INVALID_CREDENTIALS", async () => {
    await expect(
      authenticate.execute({ email: "nadie@example.com", password: PASSWORD }),
    ).rejects.toMatchObject({ kind: "unauthenticated", code: "INVALID_CREDENTIALS" });
  });

  it("rechaza una clave incorrecta con el mismo error que un email inexistente", async () => {
    await seed();
    await expect(
      authenticate.execute({ email: "ana@example.com", password: "otra-clave-distinta" }),
    ).rejects.toMatchObject({ kind: "unauthenticated", code: "INVALID_CREDENTIALS" });
  });

  it("verifica un hash aunque el usuario no exista, para igualar los tiempos", async () => {
    await expect(
      authenticate.execute({ email: "nadie@example.com", password: PASSWORD }),
    ).rejects.toBeDefined();
    expect(hasher.verifyCalls).toBe(1);
  });

  it("rechaza a un usuario inactivo con la clave correcta con ACCOUNT_INACTIVE", async () => {
    await seed(true);
    await expect(
      authenticate.execute({ email: "ana@example.com", password: PASSWORD }),
    ).rejects.toMatchObject({ kind: "forbidden", code: "ACCOUNT_INACTIVE" });
  });

  it("no revela que la cuenta está inactiva si la clave es incorrecta", async () => {
    await seed(true);
    await expect(
      authenticate.execute({ email: "ana@example.com", password: "otra-clave-distinta" }),
    ).rejects.toMatchObject({ code: "INVALID_CREDENTIALS" });
  });
});
