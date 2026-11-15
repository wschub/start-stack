import type { CookieOptions, Request, Response } from "express";

export const REFRESH_COOKIE_NAME = "refresh_token";
export const REFRESH_COOKIE_PATH = "/auth";

export interface RefreshCookieConfig {
  secure: boolean;
  sameSite: "strict" | "lax" | "none";
}

function baseOptions(config: RefreshCookieConfig): CookieOptions {
  return {
    httpOnly: true,
    secure: config.secure,
    sameSite: config.sameSite,
    path: REFRESH_COOKIE_PATH,
  };
}

export function setRefreshCookie(
  res: Response,
  config: RefreshCookieConfig,
  value: string,
  expires: Date,
): void {
  res.cookie(REFRESH_COOKIE_NAME, value, { ...baseOptions(config), expires });
}

export function clearRefreshCookie(res: Response, config: RefreshCookieConfig): void {
  res.clearCookie(REFRESH_COOKIE_NAME, baseOptions(config));
}

export function readRefreshCookie(req: Request): string | undefined {
  const value: unknown = req.cookies?.[REFRESH_COOKIE_NAME];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}
