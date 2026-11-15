import type { HttpCookie, HttpCookieOptions, HttpCookieRemoval, HttpRequest } from "./http.ts";

export const REFRESH_COOKIE_NAME = "refresh_token";
export const REFRESH_COOKIE_PATH = "/auth";

export interface RefreshCookieConfig {
  secure: boolean;
  sameSite: "strict" | "lax" | "none";
}

function baseOptions(config: RefreshCookieConfig): HttpCookieOptions {
  return {
    httpOnly: true,
    secure: config.secure,
    sameSite: config.sameSite,
    path: REFRESH_COOKIE_PATH,
  };
}

export function refreshCookie(
  config: RefreshCookieConfig,
  value: string,
  expires: Date,
): HttpCookie {
  return { name: REFRESH_COOKIE_NAME, value, expires, ...baseOptions(config) };
}

export function expiredRefreshCookie(config: RefreshCookieConfig): HttpCookieRemoval {
  return { name: REFRESH_COOKIE_NAME, ...baseOptions(config) };
}

export function readRefreshCookie(request: HttpRequest): string | undefined {
  const value = request.cookies[REFRESH_COOKIE_NAME];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}
