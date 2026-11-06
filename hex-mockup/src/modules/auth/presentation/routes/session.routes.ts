import cookieParser from "cookie-parser";
import { Router } from "express";
import { csrfProtection } from "../../../../shared/http/csrf-protection.ts";
import { createRateLimiter, type RateLimitRule } from "../../../../shared/http/rate-limit.ts";
import {
  createSessionController,
  type SessionControllerDeps,
} from "../controllers/session.controller.ts";
import { DEFAULT_AUTH_RATE_LIMITS } from "../rate-limits.ts";

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

  router.post("/auth/refresh", refreshLimit, csrf, controller.refresh);
  router.post("/auth/logout", csrf, controller.logout);

  return router;
}
