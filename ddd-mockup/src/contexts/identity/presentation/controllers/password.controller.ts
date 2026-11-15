import type { RequestHandler } from "express";
import { parseBody } from "../../../../shared/http/validate.ts";
import type { RequestPasswordReset } from "../../application/commands/request-password-reset.command.ts";
import type { ResetPassword } from "../../application/commands/reset-password.command.ts";
import { forgotPasswordSchema, resetPasswordSchema } from "../schemas/password.schemas.ts";

export interface PasswordControllerDeps {
  requestPasswordReset: RequestPasswordReset;
  resetPassword: ResetPassword;
}

export function createPasswordController(deps: PasswordControllerDeps) {
  /** Siempre 202 y sin cuerpo: la respuesta no revela si el correo está registrado. */
  const forgot: RequestHandler = async (req, res) => {
    await deps.requestPasswordReset.execute(parseBody(forgotPasswordSchema, req.body));
    res.status(202).end();
  };

  const reset: RequestHandler = async (req, res) => {
    const body = parseBody(resetPasswordSchema, req.body);
    await deps.resetPassword.execute(
      "token" in body
        ? { method: "link", token: body.token, password: body.password }
        : { method: "code", email: body.email, code: body.code, password: body.password },
    );
    res.status(204).end();
  };

  return { forgot, reset };
}
