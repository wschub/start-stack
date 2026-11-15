import { AppError } from "../../entities/errors/app-error.ts";
import type { PermissionRegistry } from "../permissions/permission.ts";

/** Lanza UNKNOWN_PERMISSION si alguna clave no está en el catálogo de permisos. */
export function assertKnownPermissions(
  registry: PermissionRegistry,
  permissions: readonly string[] | undefined,
): void {
  const unknown = (permissions ?? []).filter((key) => !registry.has(key));
  if (unknown.length > 0) {
    throw new AppError("validation", {
      code: "UNKNOWN_PERMISSION",
      details: { issues: unknown.map((key) => ({ field: "permissions", code: key })) },
    });
  }
}
