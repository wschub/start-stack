import { Router } from "express";
import type { UserRepository } from "../../../users/domain/repositories/user.repository.ts";
import type { AccessTokenService } from "../../application/ports/access-token-service.ts";
import { type AuthControllerDeps, createAuthController } from "../controllers/auth.controller.ts";
import { requireAuth } from "../middlewares/require-auth.ts";

export interface AuthRouterDeps extends AuthControllerDeps {
  accessTokens: AccessTokenService;
  users: UserRepository;
  publicRegistration: boolean;
}

export function createAuthRouter(deps: AuthRouterDeps): Router {
  const router = Router();
  const controller = createAuthController(deps);

  router.use("/auth", (_req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });

  if (deps.publicRegistration) router.post("/auth/register", controller.register);
  router.post("/auth/login", controller.login);
  router.get("/auth/me", requireAuth(deps), controller.me);

  return router;
}
