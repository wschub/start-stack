import type { AuthenticateUserInput } from "../../use-cases/auth/authenticate-user.use-case.ts";
import type { UserAccess } from "../../use-cases/auth/get-user-access.use-case.ts";
import type { SessionTokens } from "../../use-cases/auth/issue-session.use-case.ts";
import type { RegisterUserInput } from "../../use-cases/auth/register-user.use-case.ts";
import type { UseCase } from "../../use-cases/use-case.ts";
import type { PublicUser } from "../../use-cases/users/public-user.ts";
import { currentUser } from "../http/current-user.ts";
import { type Controller, created, ok } from "../http/http.ts";
import { parseBody } from "../http/parse-body.ts";
import { refreshCookie, type RefreshCookieConfig } from "../http/refresh-cookie.ts";
import { presentProfile } from "../presenters/access.presenter.ts";
import { presentSession } from "../presenters/session.presenter.ts";
import { loginSchema, registerSchema } from "../schemas/auth.schemas.ts";

export interface AuthControllerDeps {
  registerUser: UseCase<RegisterUserInput, PublicUser>;
  authenticateUser: UseCase<AuthenticateUserInput, PublicUser>;
  issueSession: UseCase<string, SessionTokens>;
  getUserAccess: UseCase<string, UserAccess>;
  refreshCookie: RefreshCookieConfig;
}

export function createAuthController(deps: AuthControllerDeps) {
  const register: Controller = async (request) => {
    const user = await deps.registerUser.execute(parseBody(registerSchema, request.body));
    return created({ user });
  };

  const login: Controller = async (request) => {
    const credentials = parseBody(loginSchema, request.body);
    const user = await deps.authenticateUser.execute(credentials);
    const session = await deps.issueSession.execute(user.publicId);

    return {
      status: 200,
      body: { ...presentSession(session), user },
      cookies: [
        refreshCookie(deps.refreshCookie, session.refreshToken, session.refreshTokenExpiresAt),
      ],
    };
  };

  const me: Controller = async (request) => {
    const user = currentUser(request);
    return ok(presentProfile(user, await deps.getUserAccess.execute(user.publicId)));
  };

  return { register, login, me };
}
