import type { RequestHandler } from "express";
import type { PermissionChecker } from "../../../use-cases/auth/check-permission.use-case.ts";
import { authenticatedUser } from "./require-auth.ts";

/** Crea el middleware que exige un permiso. Debe ir después de `requireAuth`. */
export type PermissionGuard = (permission: string) => RequestHandler;

/** Pedir un permiso que no está en el catálogo falla al montar las rutas, no con la primera petición. */
export function createPermissionGuard(deps: {
  checkPermission: PermissionChecker;
}): PermissionGuard {
  return (permission) => {
    deps.checkPermission.assertRegistered(permission);
    return async (_req, res, next) => {
      await deps.checkPermission.execute({
        userPublicId: authenticatedUser(res).publicId,
        permission,
      });
      next();
    };
  };
}
