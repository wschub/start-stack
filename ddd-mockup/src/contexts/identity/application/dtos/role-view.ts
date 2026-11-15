import type { PermissionRegistry } from "../../../../shared/permissions/permission.ts";
import type { Role } from "../../domain/aggregates/role.ts";

export interface RoleView {
  publicId: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  permissions: string[];
  createdAt: string;
  updatedAt: string;
}

/** Permisos efectivos de un rol: SUPER_ADMIN los tiene todos; del resto se descartan los que ya no existen. */
export function effectivePermissions(role: Role, registry: PermissionRegistry): string[] {
  if (role.isSuperAdmin()) return registry.keys();
  return role.permissions.filter((key) => registry.has(key));
}

export function toRoleView(role: Role, registry: PermissionRegistry): RoleView {
  return {
    publicId: role.publicId,
    name: role.name,
    description: role.description,
    isSystem: role.isSystem,
    permissions: effectivePermissions(role, registry),
    createdAt: role.createdAt.toISOString(),
    updatedAt: role.updatedAt.toISOString(),
  };
}
