import { type RequestHandler, Router } from "express";
import { USERS_PERMISSION } from "../../../use-cases/users/permissions.ts";
import {
  createUsersController,
  type UsersControllerDeps,
} from "../../../interface-adapters/controllers/users.controller.ts";

import { adapt } from "../adapt.ts";

export interface UsersRouterDeps extends UsersControllerDeps {
  /** Middlewares de autenticación y de permisos, ya construidos en la composición. */
  authenticate: RequestHandler;
  authorize: (permission: string) => RequestHandler;
}

export function createUsersRouter(deps: UsersRouterDeps): Router {
  const router = Router();
  const controller = createUsersController(deps);
  const read = [deps.authenticate, deps.authorize(USERS_PERMISSION.read)];
  const update = [deps.authenticate, deps.authorize(USERS_PERMISSION.update)];

  router.get("/users", read, adapt(controller.list));
  router.get("/users/:id", read, adapt(controller.get));
  router.patch("/users/:id/status", update, adapt(controller.changeStatus));

  return router;
}
