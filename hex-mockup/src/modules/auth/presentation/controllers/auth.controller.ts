import type { RequestHandler } from "express";
import { parseBody } from "../../../../shared/http/validate.ts";
import { toPublicUser } from "../../../users/application/public-user.ts";
import type { AuthenticateUser } from "../../application/use-cases/authenticate-user.use-case.ts";
import type { IssueSession } from "../../application/use-cases/issue-session.use-case.ts";
import type { RegisterUser } from "../../application/use-cases/register-user.use-case.ts";
import { authenticatedUser } from "../middlewares/require-auth.ts";
import { loginSchema, registerSchema } from "../schemas/auth.schemas.ts";

export const REFRESH_COOKIE_NAME = "refresh_token";
export const REFRESH_COOKIE_PATH = "/auth";

export interface RefreshCookieConfig {
  secure: boolean;
  sameSite: "strict" | "lax" | "none";
}

export interface AuthControllerDeps {
  registerUser: RegisterUser;
  authenticateUser: AuthenticateUser;
  issueSession: IssueSession;
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

    res.cookie(REFRESH_COOKIE_NAME, session.refreshToken, {
      httpOnly: true,
      secure: deps.refreshCookie.secure,
      sameSite: deps.refreshCookie.sameSite,
      path: REFRESH_COOKIE_PATH,
      expires: session.refreshTokenExpiresAt,
    });
    res.json({
      accessToken: session.accessToken,
      tokenType: "Bearer",
      expiresIn: session.accessTokenExpiresIn,
      user: toPublicUser(user),
    });
  };

  const me: RequestHandler = (_req, res) => {
    res.json({ user: toPublicUser(authenticatedUser(res)) });
  };

  return { register, login, me };
}
