import { beforeEach, describe, expect, it } from "vitest";
import { RegisterUser } from "../../../../src/modules/auth/application/use-cases/register-user.use-case.ts";
import { AppError } from "../../../../src/shared/errors/app-error.ts";
import { FakePasswordHasher, InMemoryUserRepository } from "../../../helpers/fakes.ts";

const input = {
  email: "Ana@Example.com",
  password: "una-clave-bastante-larga",
  firstName: "Ana",
  lastName: "Gómez",
};

describe("RegisterUser", () => {
  let users: InMemoryUserRepository;
  let hasher: FakePasswordHasher;
  let register: RegisterUser;

  beforeEach(() => {
    users = new InMemoryUserRepository();
    hasher = new FakePasswordHasher();
    register = new RegisterUser({ users, hasher });
  });

  it("registra al usuario y devuelve sus datos públicos, sin el hash", async () => {
    const result = await register.execute(input);
    expect(result).toMatchObject({
      email: "ana@example.com",
      firstName: "Ana",
      lastName: "Gómez",
      locale: "es",
      status: "ACTIVE",
    });
    expect(result.publicId).toMatch(/^[0-9a-f-]{36}$/);
    expect(JSON.stringify(result)).not.toContain("hashed:");
    expect(JSON.stringify(result)).not.toContain("passwordHash");
  });

  it("guarda el hash y nunca la contraseña en claro", async () => {
    await register.execute(input);
    const stored = await users.findByEmail("ana@example.com");
    expect(stored?.passwordHash).toBe(`hashed:${input.password}`);
    expect(stored?.passwordHash).not.toBe(input.password);
  });

  it("rechaza una contraseña débil sin hashear ni guardar nada", async () => {
    await expect(register.execute({ ...input, password: "corta" })).rejects.toMatchObject({
      code: "WEAK_PASSWORD",
    });
    expect(hasher.hashCalls).toBe(0);
    expect(users.byEmail.size).toBe(0);
  });

  it("rechaza un email ya registrado", async () => {
    await register.execute(input);
    await expect(register.execute(input)).rejects.toMatchObject({
      kind: "conflict",
      code: "EMAIL_ALREADY_EXISTS",
    });
  });

  it("propaga las validaciones del dominio y no guarda nada", async () => {
    const attempt = register.execute({ ...input, email: "no-es-email" });
    await expect(attempt).rejects.toBeInstanceOf(AppError);
    await expect(attempt).rejects.toMatchObject({ code: "INVALID_EMAIL" });
    expect(users.byEmail.size).toBe(0);
  });
});
