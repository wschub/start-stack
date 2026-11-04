import type { RequestHandler } from "express";
import { AppError } from "../../../../shared/errors/app-error.ts";
import type { RefreshSession } from "../../application/use-cases/refresh-session.use-case.ts";
import type { RevokeSession } from "../../application/use-cases/revoke-session.use-case.ts";
import {
  clearRefreshCookie,
  readRefreshCookie,
  type RefreshCookieConfig,
  setRefreshCookie,
} from "../cookies/refresh-cookie.ts";

export interface SessionControllerDeps {
  refreshSession: RefreshSession;
  revokeSession: RevokeSession;
  refreshCookie: RefreshCookieConfig;
}

export function createSessionController(deps: SessionControllerDeps) {
  const refresh: RequestHandler = async (req, res) => {
    const token = readRefreshCookie(req);
    if (!token) throw new AppError("unauthenticated", { code: "INVALID_REFRESH_TOKEN" });

    try {
      const session = await deps.refreshSession.execute(token);
      setRefreshCookie(
        res,
        deps.refreshCookie,
        session.refreshToken,
        session.refreshTokenExpiresAt,
      );
      res.json({
        accessToken: session.accessToken,
        tokenType: "Bearer",
        expiresIn: session.accessTokenExpiresIn,
      });
    } catch (error) {
      // Una sesión rechazada ya no sirve: se pide al navegador que descarte la cookie.
      if (
        error instanceof AppError &&
        (error.kind === "unauthenticated" || error.kind === "forbidden")
      ) {
        clearRefreshCookie(res, deps.refreshCookie);
      }
      throw error;
    }
  };

  const logout: RequestHandler = async (req, res) => {
    const token = readRefreshCookie(req);
    if (token) await deps.revokeSession.execute(token);
    clearRefreshCookie(res, deps.refreshCookie);
    res.status(204).end();
  };

  return { refresh, logout };
}
