import type { Request } from "express";
import type { RateLimitRule } from "./rate-limit.ts";

export interface AuthRateLimits {
  login: RateLimitRule;
  loginPerAccount: RateLimitRule;
  register: RateLimitRule;
  refresh: RateLimitRule;
}

const minutes = (count: number) => count * 60_000;

export const DEFAULT_AUTH_RATE_LIMITS: AuthRateLimits = {
  login: { windowMs: minutes(15), max: 20 },
  loginPerAccount: { windowMs: minutes(15), max: 5 },
  register: { windowMs: minutes(60), max: 10 },
  refresh: { windowMs: minutes(15), max: 60 },
};

/** Email normalizado del cuerpo, o undefined si la petición no trae uno utilizable. */
export function accountKey(req: Request): string | undefined {
  const email: unknown = req.body?.email;
  if (typeof email !== "string" || email.trim() === "") return undefined;
  return email.trim().toLowerCase().slice(0, 320);
}
