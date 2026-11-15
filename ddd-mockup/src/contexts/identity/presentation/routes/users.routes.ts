import { type RequestHandler, Router } from "express";
import { USERS_PERMISSION } from "../../application/users-permissions.ts";
import {
  createUsersController,
  type UsersControllerDeps,
} from "../controllers/users.controller.ts";

export interface UsersRouterDeps extends UsersControllerDeps {
  /**
   * Middlewares de autenticación y de permisos, ya construidos en composition.ts. Todos los
   * routers los reciben así, sean de este contexto o de otro.
   */
  authenticate: RequestHandler;
  authorize: (permission: string) => RequestHandler;
}

export function createUsersRouter(deps: UsersRouterDeps): Router {
  const router = Router();
  const controller = createUsersController(deps);
  const read = [deps.authenticate, deps.authorize(USERS_PERMISSION.read)];
  const update = [deps.authenticate, deps.authorize(USERS_PERMISSION.update)];

  router.get("/users", read, controller.list);
  router.get("/users/:id", read, controller.get);
  router.patch("/users/:id/status", update, controller.changeStatus);

  return router;
}
