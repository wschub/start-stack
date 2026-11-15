import { Router } from "express";
import { createRateLimiter, type RateLimitRule } from "../rate-limit.ts";
import {
  createPasswordController,
  type PasswordControllerDeps,
} from "../../../interface-adapters/controllers/password.controller.ts";
import { adapt } from "../adapt.ts";
import { accountKey } from "../auth-rate-limits.ts";

export interface PasswordRateLimits {
  forgot: RateLimitRule;
  forgotPerAccount: RateLimitRule;
  reset: RateLimitRule;
}

const minutes = (count: number) => count * 60_000;

export const DEFAULT_PASSWORD_RATE_LIMITS: PasswordRateLimits = {
  forgot: { windowMs: minutes(60), max: 10 },
  forgotPerAccount: { windowMs: minutes(60), max: 3 },
  reset: { windowMs: minutes(15), max: 10 },
};

export interface PasswordRouterDeps extends PasswordControllerDeps {
  rateLimits?: Partial<PasswordRateLimits> | undefined;
}

export function createPasswordRouter(deps: PasswordRouterDeps): Router {
  const router = Router();
  const controller = createPasswordController(deps);
  const limits = { ...DEFAULT_PASSWORD_RATE_LIMITS, ...deps.rateLimits };

  router.post(
    "/auth/password/forgot",
    createRateLimiter(limits.forgot),
    createRateLimiter(limits.forgotPerAccount, { key: accountKey }),
    adapt(controller.forgot),
  );
  router.post("/auth/password/reset", createRateLimiter(limits.reset), adapt(controller.reset));

  return router;
}
