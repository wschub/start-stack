import cookieParser from "cookie-parser";
import { Router } from "express";
import { csrfProtection } from "../../../../shared/http/csrf-protection.ts";
import {
  createSessionController,
  type SessionControllerDeps,
} from "../controllers/session.controller.ts";

export interface SessionRouterDeps extends SessionControllerDeps {
  allowedOrigins: readonly string[];
}

export function createSessionRouter(deps: SessionRouterDeps): Router {
  const router = Router();
  const controller = createSessionController(deps);
  const csrf = csrfProtection({ allowedOrigins: deps.allowedOrigins });

  router.use("/auth", (_req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });
  router.use("/auth", cookieParser());

  router.post("/auth/refresh", csrf, controller.refresh);
  router.post("/auth/logout", csrf, controller.logout);

  return router;
}
