import type { RequestHandler } from "express";
import { parseBody } from "../../../../shared/http/validate.ts";
import { toPublicUser } from "../../application/dtos/public-user.ts";
import type { GetUserAccess } from "../../application/queries/get-user-access.query.ts";
import type { AuthenticateUser } from "../../application/commands/authenticate-user.command.ts";
import type { IssueSession } from "../../application/commands/issue-session.command.ts";
import type { RegisterUser } from "../../application/commands/register-user.command.ts";
import { type RefreshCookieConfig, setRefreshCookie } from "../cookies/refresh-cookie.ts";
import { authenticatedUser } from "../middlewares/require-auth.ts";
import { loginSchema, registerSchema } from "../schemas/auth.schemas.ts";

export interface AuthControllerDeps {
  registerUser: RegisterUser;
  authenticateUser: AuthenticateUser;
  issueSession: IssueSession;
  getUserAccess: GetUserAccess;
  refreshCookie: RefreshCookieConfig;
}

export function createAuthController(deps: AuthControllerDeps) {
  const register: RequestHandler = async (req, res) => {
    const user = await deps.registerUser.execute(parseBody(registerSchema, req.body));
    res.status(201).json({ user });
  };

  const login: RequestHandler = async (req, res) => {
    const { email, password } = parseBody(loginSchema, req.body);
    const user = await deps.authenticateUser.execute({ email, password });
    const session = await deps.issueSession.execute(user.publicId);

    setRefreshCookie(res, deps.refreshCookie, session.refreshToken, session.refreshTokenExpiresAt);
    res.json({
      accessToken: session.accessToken,
      tokenType: "Bearer",
      expiresIn: session.accessTokenExpiresIn,
      user: toPublicUser(user),
    });
  };

  /** Perfil más lo que el front necesita para mostrar u ocultar secciones: roles y permisos. */
  const me: RequestHandler = async (_req, res) => {
    const user = authenticatedUser(res);
    const access = await deps.getUserAccess.execute(user.publicId);
    res.json({
      user: toPublicUser(user),
      roles: access.roles.map((role) => role.name),
      permissions: access.permissions,
    });
  };

  return { register, login, me };
}
