import { type RequestHandler, Router } from "express";
import { AUTH_PERMISSION } from "../../../use-cases/auth/permissions.ts";
import {
  createRolesController,
  type RolesControllerDeps,
} from "../../../interface-adapters/controllers/roles.controller.ts";
import { adapt } from "../adapt.ts";
import type { PermissionGuard } from "../middlewares/require-permission.ts";

export interface RolesRouterDeps extends RolesControllerDeps {
  /** Middleware que identifica al usuario (requireAuth ya configurado). */
  authenticate: RequestHandler;
  authorize: PermissionGuard;
}

export function createRolesRouter(deps: RolesRouterDeps): Router {
  const router = Router();
  const controller = createRolesController(deps);
  const { authenticate, authorize } = deps;
  const read = [authenticate, authorize(AUTH_PERMISSION.rolesRead)];
  const manage = [authenticate, authorize(AUTH_PERMISSION.rolesManage)];
  const assign = [authenticate, authorize(AUTH_PERMISSION.rolesAssign)];

  router.get("/permissions", read, adapt(controller.listPermissions));

  router.get("/roles", read, adapt(controller.list));
  router.post("/roles", manage, adapt(controller.create));
  router.get("/roles/:id", read, adapt(controller.get));
  router.patch("/roles/:id", manage, adapt(controller.update));
  router.delete("/roles/:id", manage, adapt(controller.remove));

  router.get("/users/:id/roles", read, adapt(controller.getUserRoles));
  router.put("/users/:id/roles", assign, adapt(controller.setUserRoles));

  return router;
}
