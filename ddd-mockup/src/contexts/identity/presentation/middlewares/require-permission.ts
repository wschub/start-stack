import type { RequestHandler } from "express";
import { AppError } from "../../../../shared/errors/app-error.ts";
import type { PermissionRegistry } from "../../../../shared/permissions/permission.ts";
import type { GetUserAccess } from "../../application/queries/get-user-access.query.ts";
import { authenticatedUser } from "./require-auth.ts";

/** Crea el middleware que exige un permiso. Debe ir después de `requireAuth`. */
export type PermissionGuard = (permission: string) => RequestHandler;

/**
 * Los permisos se consultan en cada petición (no viajan en el token): un cambio de rol se aplica
 * al instante. Pedir un permiso que nadie ha registrado es un error de programación y
 * falla al montar las rutas, no en producción con la primera petición.
 */
export function createPermissionGuard(deps: {
  registry: PermissionRegistry;
  getUserAccess: GetUserAccess;
}): PermissionGuard {
  return (permission) => {
    if (!deps.registry.has(permission)) {
      throw new Error(`Permission "${permission}" is not registered in the PermissionRegistry`);
    }
    return async (_req, res, next) => {
      const user = authenticatedUser(res);
      const access = await deps.getUserAccess.execute(user.publicId);
      if (!access.permissions.includes(permission)) {
        throw new AppError("forbidden", { code: "PERMISSION_DENIED" });
      }
      next();
    };
  };
}
