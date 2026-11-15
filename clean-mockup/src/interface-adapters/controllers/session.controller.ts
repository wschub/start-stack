import { AppError } from "../../entities/errors/app-error.ts";
import type { SessionTokens } from "../../use-cases/auth/issue-session.use-case.ts";
import type { UseCase } from "../../use-cases/use-case.ts";
import { type Controller, noContent } from "../http/http.ts";
import {
  expiredRefreshCookie,
  readRefreshCookie,
  refreshCookie,
  type RefreshCookieConfig,
} from "../http/refresh-cookie.ts";
import { presentSession } from "../presenters/session.presenter.ts";

export interface SessionControllerDeps {
  refreshSession: UseCase<string, SessionTokens>;
  revokeSession: UseCase<string, void>;
  refreshCookie: RefreshCookieConfig;
}

export function createSessionController(deps: SessionControllerDeps) {
  const refresh: Controller = async (request) => {
    const token = readRefreshCookie(request);
    if (!token) throw new AppError("unauthenticated", { code: "INVALID_REFRESH_TOKEN" });

    try {
      const session = await deps.refreshSession.execute(token);
      return {
        status: 200,
        body: presentSession(session),
        cookies: [
          refreshCookie(deps.refreshCookie, session.refreshToken, session.refreshTokenExpiresAt),
        ],
      };
    } catch (error) {
      // Una sesión rechazada ya no sirve: se pide al navegador que descarte la cookie.
      if (
        error instanceof AppError &&
        (error.kind === "unauthenticated" || error.kind === "forbidden")
      ) {
        return { error, clearCookies: [expiredRefreshCookie(deps.refreshCookie)] };
      }
      throw error;
    }
  };

  const logout: Controller = async (request) => {
    const token = readRefreshCookie(request);
    if (token) await deps.revokeSession.execute(token);
    return { ...noContent(), clearCookies: [expiredRefreshCookie(deps.refreshCookie)] };
  };

  return { refresh, logout };
}
