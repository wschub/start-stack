import { type RequestHandler, Router } from "express";
import {
  type AuthControllerDeps,
  createAuthController,
} from "../../../interface-adapters/controllers/auth.controller.ts";
import { adapt } from "../adapt.ts";
import { accountKey, type AuthRateLimits, DEFAULT_AUTH_RATE_LIMITS } from "../auth-rate-limits.ts";
import { createRateLimiter } from "../rate-limit.ts";

export interface AuthRouterDeps extends AuthControllerDeps {
  /** Middleware que identifica al usuario (requireAuth ya configurado). */
  authenticate: RequestHandler;
  publicRegistration: boolean;
  rateLimits?: AuthRateLimits;
}

export function createAuthRouter(deps: AuthRouterDeps): Router {
  const router = Router();
  const controller = createAuthController(deps);
  const limits = deps.rateLimits ?? DEFAULT_AUTH_RATE_LIMITS;

  router.use("/auth", (_req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });

  if (deps.publicRegistration) {
    router.post("/auth/register", createRateLimiter(limits.register), adapt(controller.register));
  }
  router.post(
    "/auth/login",
    createRateLimiter(limits.login, { onlyFailures: true }),
    createRateLimiter(limits.loginPerAccount, { onlyFailures: true, key: accountKey }),
    adapt(controller.login),
  );
  router.get("/auth/me", deps.authenticate, adapt(controller.me));

  return router;
}
