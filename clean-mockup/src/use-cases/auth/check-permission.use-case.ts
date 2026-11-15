import { AppError } from "../../entities/errors/app-error.ts";
import type { PermissionRegistry } from "../permissions/permission.ts";
import type { UseCase } from "../use-case.ts";
import type { UserAccess } from "./get-user-access.use-case.ts";

export interface CheckPermissionInput {
  userPublicId: string;
  permission: string;
}

/** Lo que necesita quien protege una ruta: comprobar el permiso y validar que existe. */
export interface PermissionChecker extends UseCase<CheckPermissionInput, void> {
  assertRegistered(permission: string): void;
}

/**
 * Comprueba que un usuario tiene un permiso; si no, lanza PERMISSION_DENIED. Los permisos se
 * consultan en cada petición (no viajan en el token): un cambio de rol se aplica al instante.
 */
export class CheckPermission implements PermissionChecker {
  private readonly registry: PermissionRegistry;
  private readonly getUserAccess: UseCase<string, UserAccess>;

  constructor(deps: { registry: PermissionRegistry; getUserAccess: UseCase<string, UserAccess> }) {
    this.registry = deps.registry;
    this.getUserAccess = deps.getUserAccess;
  }

  /**
   * Pedir un permiso que nadie ha registrado es un error de programación. Quien protege una
   * ruta llama a este método al montarla, para que falle al arrancar y no con la primera petición.
   */
  assertRegistered(permission: string): void {
    if (!this.registry.has(permission)) {
      throw new Error(`Permission "${permission}" is not registered in the PermissionRegistry`);
    }
  }

  async execute(input: CheckPermissionInput): Promise<void> {
    const access = await this.getUserAccess.execute(input.userPublicId);
    if (!access.permissions.includes(input.permission)) {
      throw new AppError("forbidden", { code: "PERMISSION_DENIED" });
    }
  }
}
