import { beforeEach, describe, expect, it } from "vitest";
import { createPasswordController } from "../../../../src/interface-adapters/controllers/password.controller.ts";
import type { RequestPasswordResetInput } from "../../../../src/use-cases/auth/request-password-reset.use-case.ts";
import type { ResetPasswordInput } from "../../../../src/use-cases/auth/reset-password.use-case.ts";
import { httpRequest } from "../../../helpers/http-request.ts";
import { StubUseCase } from "../../../helpers/use-case-fakes.ts";

const PASSWORD = "otra-clave-bastante-larga";

describe("controlador de recuperación de contraseña", () => {
  let requestPasswordReset: StubUseCase<RequestPasswordResetInput, void>;
  let resetPassword: StubUseCase<ResetPasswordInput, void>;
  let controller: ReturnType<typeof createPasswordController>;

  beforeEach(() => {
    requestPasswordReset = StubUseCase.returning(undefined);
    resetPassword = StubUseCase.returning(undefined);
    controller = createPasswordController({ requestPasswordReset, resetPassword });
  });

  describe("forgot", () => {
    it("responde 202 sin cuerpo y usa el enlace si no se indica método", async () => {
      const response = await controller.forgot(httpRequest({ body: { email: "ana@example.com" } }));

      expect(response).toEqual({ status: 202 });
      expect(requestPasswordReset.calls).toEqual([{ email: "ana@example.com", method: "link" }]);
    });

    it("acepta pedir un código", async () => {
      await controller.forgot(httpRequest({ body: { email: "ana@example.com", method: "code" } }));

      expect(requestPasswordReset.calls).toEqual([{ email: "ana@example.com", method: "code" }]);
    });

    it("rechaza un método desconocido", async () => {
      const result = controller.forgot(
        httpRequest({ body: { email: "ana@example.com", method: "sms" } }),
      );

      await expect(result).rejects.toMatchObject({ kind: "validation" });
      expect(requestPasswordReset.calls).toEqual([]);
    });
  });

  describe("reset", () => {
    it("con token pide el cambio por enlace y responde 204", async () => {
      const response = await controller.reset(
        httpRequest({ body: { token: "un-token", password: PASSWORD } }),
      );

      expect(response).toEqual({ status: 204 });
      expect(resetPassword.calls).toEqual([
        { method: "link", token: "un-token", password: PASSWORD },
      ]);
    });

    it("con correo y código pide el cambio por código", async () => {
      await controller.reset(
        httpRequest({ body: { email: "ana@example.com", code: "123456", password: PASSWORD } }),
      );

      expect(resetPassword.calls).toEqual([
        { method: "code", email: "ana@example.com", code: "123456", password: PASSWORD },
      ]);
    });

    it("rechaza un cuerpo que mezcla token y código", async () => {
      const result = controller.reset(
        httpRequest({
          body: { token: "un-token", email: "ana@example.com", code: "123456", password: PASSWORD },
        }),
      );

      await expect(result).rejects.toMatchObject({ kind: "validation" });
      expect(resetPassword.calls).toEqual([]);
    });
  });
});
