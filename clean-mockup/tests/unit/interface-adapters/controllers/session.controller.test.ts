import { beforeEach, describe, expect, it } from "vitest";
import { AppError } from "../../../../src/entities/errors/app-error.ts";
import {
  createSessionController,
  type SessionControllerDeps,
} from "../../../../src/interface-adapters/controllers/session.controller.ts";
import type { SessionTokens } from "../../../../src/use-cases/auth/issue-session.use-case.ts";
import { httpRequest } from "../../../helpers/http-request.ts";
import { StubUseCase } from "../../../helpers/use-case-fakes.ts";

const EXPIRES = new Date("2026-11-22T10:00:00Z");
const SESSION: SessionTokens = {
  accessToken: "access-2",
  accessTokenExpiresIn: 3600,
  refreshToken: "refresh-2",
  refreshTokenExpiresAt: EXPIRES,
};
const REMOVAL = {
  name: "refresh_token",
  httpOnly: true,
  secure: false,
  sameSite: "lax",
  path: "/auth",
};
const withCookie = httpRequest({ cookies: { refresh_token: "refresh-1" } });

describe("controlador de sesión", () => {
  let refreshSession: StubUseCase<string, SessionTokens>;
  let revokeSession: StubUseCase<string, void>;
  let deps: SessionControllerDeps;

  beforeEach(() => {
    refreshSession = StubUseCase.returning(SESSION);
    revokeSession = StubUseCase.returning(undefined);
    deps = { refreshSession, revokeSession, refreshCookie: { secure: false, sameSite: "lax" } };
  });

  describe("refresh", () => {
    it("rota el token de la cookie y deja el nuevo en otra cookie", async () => {
      const response = await createSessionController(deps).refresh(withCookie);

      expect(refreshSession.calls).toEqual(["refresh-1"]);
      expect(response).toEqual({
        status: 200,
        body: { accessToken: "access-2", tokenType: "Bearer", expiresIn: 3600 },
        cookies: [{ ...REMOVAL, value: "refresh-2", expires: EXPIRES }],
      });
    });

    it.each([
      ["sin cookie", {}],
      ["con la cookie vacía", { refresh_token: "" }],
    ])("%s responde INVALID_REFRESH_TOKEN sin llamar al caso de uso", async (_case, cookies) => {
      await expect(
        createSessionController(deps).refresh(httpRequest({ cookies })),
      ).rejects.toMatchObject({ kind: "unauthenticated", code: "INVALID_REFRESH_TOKEN" });
      expect(refreshSession.calls).toEqual([]);
    });

    it.each([
      new AppError("unauthenticated", { code: "INVALID_REFRESH_TOKEN" }),
      new AppError("forbidden", { code: "ACCOUNT_INACTIVE" }),
    ])(
      "si la sesión se rechaza (%s) pide descartar la cookie y conserva el error",
      async (error) => {
        deps.refreshSession = StubUseCase.failing(error);

        const response = await createSessionController(deps).refresh(withCookie);

        expect(response).toEqual({ error, clearCookies: [REMOVAL] });
      },
    );

    it("un fallo que no es de la sesión no toca la cookie", async () => {
      const error = new AppError("service_unavailable");
      deps.refreshSession = StubUseCase.failing(error);

      await expect(createSessionController(deps).refresh(withCookie)).rejects.toBe(error);
    });
  });

  describe("logout", () => {
    it("revoca la sesión de la cookie, la descarta y responde 204", async () => {
      const response = await createSessionController(deps).logout(withCookie);

      expect(revokeSession.calls).toEqual(["refresh-1"]);
      expect(response).toEqual({ status: 204, clearCookies: [REMOVAL] });
    });

    it("sin cookie también responde 204, sin revocar nada", async () => {
      const response = await createSessionController(deps).logout(httpRequest());

      expect(revokeSession.calls).toEqual([]);
      expect(response).toEqual({ status: 204, clearCookies: [REMOVAL] });
    });
  });
});
