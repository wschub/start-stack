import type { RequestPasswordResetInput } from "../../use-cases/auth/request-password-reset.use-case.ts";
import type { ResetPasswordInput } from "../../use-cases/auth/reset-password.use-case.ts";
import type { UseCase } from "../../use-cases/use-case.ts";
import { accepted, type Controller, noContent } from "../http/http.ts";
import { parseBody } from "../http/parse-body.ts";
import { forgotPasswordSchema, resetPasswordSchema } from "../schemas/password.schemas.ts";

export interface PasswordControllerDeps {
  requestPasswordReset: UseCase<RequestPasswordResetInput, void>;
  resetPassword: UseCase<ResetPasswordInput, void>;
}

export function createPasswordController(deps: PasswordControllerDeps) {
  /** Siempre 202 y sin cuerpo: la respuesta no revela si el correo está registrado. */
  const forgot: Controller = async (request) => {
    await deps.requestPasswordReset.execute(parseBody(forgotPasswordSchema, request.body));
    return accepted();
  };

  const reset: Controller = async (request) => {
    const body = parseBody(resetPasswordSchema, request.body);
    await deps.resetPassword.execute(
      "token" in body
        ? { method: "link", token: body.token, password: body.password }
        : { method: "code", email: body.email, code: body.code, password: body.password },
    );
    return noContent();
  };

  return { forgot, reset };
}
