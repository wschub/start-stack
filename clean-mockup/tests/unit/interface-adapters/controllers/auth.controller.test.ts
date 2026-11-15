import { beforeEach, describe, expect, it } from "vitest";
import { AppError } from "../../../../src/entities/errors/app-error.ts";
import {
  type AuthControllerDeps,
  createAuthController,
} from "../../../../src/interface-adapters/controllers/auth.controller.ts";
import type { AuthenticateUserInput } from "../../../../src/use-cases/auth/authenticate-user.use-case.ts";
import type { UserAccess } from "../../../../src/use-cases/auth/get-user-access.use-case.ts";
import type { SessionTokens } from "../../../../src/use-cases/auth/issue-session.use-case.ts";
import type { RegisterUserInput } from "../../../../src/use-cases/auth/register-user.use-case.ts";
import type { PublicUser } from "../../../../src/use-cases/users/public-user.ts";
import { ANA, httpRequest } from "../../../helpers/http-request.ts";
import { StubUseCase } from "../../../helpers/use-case-fakes.ts";

const EXPIRES = new Date("2026-11-22T10:00:00Z");
const SESSION: SessionTokens = {
  accessToken: "access-1",
  accessTokenExpiresIn: 3600,
  refreshToken: "refresh-1",
  refreshTokenExpiresAt: EXPIRES,
};
const ACCESS: UserAccess = {
  roles: [{ publicId: "role-1", name: "Soporte" }],
  permissions: ["users:read"],
  isSuperAdmin: false,
};
const registration = {
  email: "ana@example.com",
  password: "una-clave-bastante-larga",
  firstName: "Ana",
  lastName: "Gómez",
};

describe("controlador de autenticación", () => {
  let registerUser: StubUseCase<RegisterUserInput, PublicUser>;
  let authenticateUser: StubUseCase<AuthenticateUserInput, PublicUser>;
  let issueSession: StubUseCase<string, SessionTokens>;
  let getUserAccess: StubUseCase<string, UserAccess>;
  let deps: AuthControllerDeps;

  beforeEach(() => {
    registerUser = StubUseCase.returning(ANA);
    authenticateUser = StubUseCase.returning(ANA);
    issueSession = StubUseCase.returning(SESSION);
    getUserAccess = StubUseCase.returning(ACCESS);
    deps = {
      registerUser,
      authenticateUser,
      issueSession,
      getUserAccess,
      refreshCookie: { secure: true, sameSite: "strict" },
    };
  });

  describe("register", () => {
    it("pasa el cuerpo validado al caso de uso y responde 201 con el usuario", async () => {
      const response = await createAuthController(deps).register(
        httpRequest({ body: registration }),
      );

      expect(registerUser.calls).toEqual([registration]);
      expect(response).toEqual({ status: 201, body: { user: ANA } });
    });

    it("rechaza un cuerpo con campos desconocidos sin llamar al caso de uso", async () => {
      const result = createAuthController(deps).register(
        httpRequest({ body: { ...registration, role: "SUPER_ADMIN" } }),
      );

      await expect(result).rejects.toMatchObject({ kind: "validation", code: "VALIDATION_ERROR" });
      expect(registerUser.calls).toEqual([]);
    });

    it("deja pasar los errores del caso de uso", async () => {
      deps.registerUser = StubUseCase.failing(
        new AppError("conflict", { code: "EMAIL_ALREADY_EXISTS" }),
      );

      await expect(
        createAuthController(deps).register(httpRequest({ body: registration })),
      ).rejects.toMatchObject({ code: "EMAIL_ALREADY_EXISTS" });
    });
  });

  describe("login", () => {
    const credentials = { email: "ana@example.com", password: "una-clave-bastante-larga" };

    it("autentica, abre la sesión del usuario y responde con el access token", async () => {
      const response = await createAuthController(deps).login(httpRequest({ body: credentials }));

      expect(authenticateUser.calls).toEqual([credentials]);
      expect(issueSession.calls).toEqual([ANA.publicId]);
      expect(response).toMatchObject({
        status: 200,
        body: { accessToken: "access-1", tokenType: "Bearer", expiresIn: 3600, user: ANA },
      });
    });

    it("el refresh token viaja solo en una cookie HttpOnly limitada a /auth", async () => {
      const response = await createAuthController(deps).login(httpRequest({ body: credentials }));

      expect(response).toMatchObject({
        cookies: [
          {
            name: "refresh_token",
            value: "refresh-1",
            expires: EXPIRES,
            httpOnly: true,
            secure: true,
            sameSite: "strict",
            path: "/auth",
          },
        ],
      });
      expect(JSON.stringify("body" in response ? response.body : "")).not.toContain("refresh-1");
    });

    it("si las credenciales no valen no se abre ninguna sesión", async () => {
      deps.authenticateUser = StubUseCase.failing(
        new AppError("unauthenticated", { code: "INVALID_CREDENTIALS" }),
      );

      await expect(
        createAuthController(deps).login(httpRequest({ body: credentials })),
      ).rejects.toMatchObject({ code: "INVALID_CREDENTIALS" });
      expect(issueSession.calls).toEqual([]);
    });
  });

  describe("me", () => {
    it("devuelve el perfil con los nombres de sus roles y sus permisos", async () => {
      const response = await createAuthController(deps).me(httpRequest({ user: ANA }));

      expect(getUserAccess.calls).toEqual([ANA.publicId]);
      expect(response).toEqual({
        status: 200,
        body: { user: ANA, roles: ["Soporte"], permissions: ["users:read"] },
      });
    });

    it("sin usuario identificado responde que falta autenticación", async () => {
      await expect(createAuthController(deps).me(httpRequest())).rejects.toMatchObject({
        kind: "unauthenticated",
      });
    });
  });
});
