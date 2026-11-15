import cookieParser from "cookie-parser";
import { Router } from "express";
import { csrfProtection } from "../csrf-protection.ts";
import { createRateLimiter, type RateLimitRule } from "../rate-limit.ts";
import {
  createSessionController,
  type SessionControllerDeps,
} from "../../../interface-adapters/controllers/session.controller.ts";
import { adapt } from "../adapt.ts";
import { DEFAULT_AUTH_RATE_LIMITS } from "../auth-rate-limits.ts";

export interface SessionRouterDeps extends SessionControllerDeps {
  allowedOrigins: readonly string[];
  refreshRateLimit?: RateLimitRule;
}

export function createSessionRouter(deps: SessionRouterDeps): Router {
  const router = Router();
  const controller = createSessionController(deps);
  const csrf = csrfProtection({ allowedOrigins: deps.allowedOrigins });
  const refreshLimit = createRateLimiter(deps.refreshRateLimit ?? DEFAULT_AUTH_RATE_LIMITS.refresh);

  router.use("/auth", (_req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });
  router.use("/auth", cookieParser());

  router.post("/auth/refresh", refreshLimit, csrf, adapt(controller.refresh));
  router.post("/auth/logout", csrf, adapt(controller.logout));

  return router;
}
