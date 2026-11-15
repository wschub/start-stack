import { AppError } from "../../../../shared/errors/app-error.ts";
import type { Role } from "../aggregates/role.ts";

/**
 * Política que protege a los superadministradores. Son reglas del negocio que afectan a más de
 * un agregado (usuarios y roles), así que viven en un servicio de dominio: funciones puras que
 * reciben los roles ya cargados. Los comandos solo cargan los datos y preguntan aquí.
 */

/** ¿Estos roles convierten a quien los tiene en superadministrador? */
export function isSuperAdmin(roles: readonly Role[]): boolean {
  return roles.some((role) => role.isSuperAdmin());
}

/** ¿El cambio de roles concede o retira el rol de superadministrador? */
export function changesSuperAdminMembership(
  current: readonly Role[],
  requested: readonly Role[],
): boolean {
  return isSuperAdmin(current) !== isSuperAdmin(requested);
}

/**
 * Solo un superadministrador puede conceder o retirar ese rol, y activar o desactivar a otro
 * superadministrador: así nadie escala privilegios con un permiso menor.
 */
export function assertActorIsSuperAdmin(actorRoles: readonly Role[]): void {
  if (!isSuperAdmin(actorRoles)) {
    throw new AppError("forbidden", { code: "SUPER_ADMIN_REQUIRED" });
  }
}

/** Siempre debe quedar al menos un superadministrador activo. */
export function assertNotLastSuperAdmin(activeSuperAdmins: number): void {
  if (activeSuperAdmins <= 1) throw new AppError("conflict", { code: "LAST_SUPER_ADMIN" });
}
