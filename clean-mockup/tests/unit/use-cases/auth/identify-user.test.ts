import { beforeEach, describe, expect, it } from "vitest";
import { AppError } from "../../../../src/entities/errors/app-error.ts";
import { User } from "../../../../src/entities/user.ts";
import { IdentifyUser } from "../../../../src/use-cases/auth/identify-user.use-case.ts";
import { InMemoryUserRepository } from "../../../helpers/fakes.ts";
import { FakeAccessTokenService } from "../../../helpers/session-fakes.ts";

describe("IdentifyUser", () => {
  let users: InMemoryUserRepository;
  let identify: IdentifyUser;
  let ana: User;

  beforeEach(async () => {
    users = new InMemoryUserRepository();
    identify = new IdentifyUser({ accessTokens: new FakeAccessTokenService(), users });
    ana = User.create({
      email: "ana@example.com",
      passwordHash: "hash-secreto",
      firstName: "Ana",
      lastName: "Gómez",
    });
    await users.add(ana);
  });

  it("devuelve los datos públicos del dueño del token, sin el hash de su contraseña", async () => {
    const user = await identify.execute(`access:${ana.publicId}`);

    expect(user).toMatchObject({ publicId: ana.publicId, email: "ana@example.com" });
    expect(JSON.stringify(user)).not.toMatch(/hash-secreto|passwordHash/);
  });

  it("rechaza el token de una cuenta que ya no existe", async () => {
    await expect(identify.execute("access:no-existe")).rejects.toMatchObject({
      kind: "unauthenticated",
      code: "INVALID_TOKEN",
    });
  });

  it("rechaza el token vigente de una cuenta desactivada", async () => {
    await users.update(ana.deactivate());

    await expect(identify.execute(`access:${ana.publicId}`)).rejects.toMatchObject({
      kind: "forbidden",
      code: "ACCOUNT_INACTIVE",
    });
  });

  it("deja pasar el error del servicio de tokens sin buscar al usuario", async () => {
    const expired = new AppError("unauthenticated", { code: "TOKEN_EXPIRED" });
    const failing = new IdentifyUser({
      accessTokens: {
        issue: async () => ({ token: "", expiresInSeconds: 0 }),
        verify: async () => {
          throw expired;
        },
      },
      users,
    });

    await expect(failing.execute("caducado")).rejects.toBe(expired);
  });
});
