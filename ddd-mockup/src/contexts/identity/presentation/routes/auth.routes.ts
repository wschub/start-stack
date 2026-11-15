import { Router } from "express";
import { createRateLimiter } from "../../../../shared/http/rate-limit.ts";
import type { UserRepository } from "../../domain/repositories/user.repository.ts";
import type { AccessTokenService } from "../../application/ports/access-token-service.ts";
import { type AuthControllerDeps, createAuthController } from "../controllers/auth.controller.ts";
import { requireAuth } from "../middlewares/require-auth.ts";
import { accountKey, type AuthRateLimits, DEFAULT_AUTH_RATE_LIMITS } from "../rate-limits.ts";

export interface AuthRouterDeps extends AuthControllerDeps {
  accessTokens: AccessTokenService;
  users: UserRepository;
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
    router.post("/auth/register", createRateLimiter(limits.register), controller.register);
  }
  router.post(
    "/auth/login",
    createRateLimiter(limits.login, { onlyFailures: true }),
    createRateLimiter(limits.loginPerAccount, { onlyFailures: true, key: accountKey }),
    controller.login,
  );
  router.get("/auth/me", requireAuth(deps), controller.me);

  return router;
}
