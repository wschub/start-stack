import { type RequestHandler, Router } from "express";
import { AUTH_PERMISSION } from "../../application/permissions.ts";
import {
  createRolesController,
  type RolesControllerDeps,
} from "../controllers/roles.controller.ts";
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

  router.get("/permissions", read, controller.listPermissions);

  router.get("/roles", read, controller.list);
  router.post("/roles", manage, controller.create);
  router.get("/roles/:id", read, controller.get);
  router.patch("/roles/:id", manage, controller.update);
  router.delete("/roles/:id", manage, controller.remove);

  router.get("/users/:id/roles", read, controller.getUserRoles);
  router.put("/users/:id/roles", assign, controller.setUserRoles);

  return router;
}
