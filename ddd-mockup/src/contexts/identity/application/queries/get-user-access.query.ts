import type { PermissionRegistry } from "../../../../shared/permissions/permission.ts";
import type { RoleRepository } from "../../domain/repositories/role.repository.ts";
import { effectivePermissions } from "../dtos/role-view.ts";

export interface UserAccess {
  roles: { publicId: string; name: string }[];
  /** Unión de los permisos de todos sus roles. */
  permissions: string[];
  isSuperAdmin: boolean;
}

export class GetUserAccess {
  private readonly roles: RoleRepository;
  private readonly registry: PermissionRegistry;

  constructor(deps: { roles: RoleRepository; registry: PermissionRegistry }) {
    this.roles = deps.roles;
    this.registry = deps.registry;
  }

  async execute(userPublicId: string): Promise<UserAccess> {
    const roles = await this.roles.findByUser(userPublicId);
    const granted = new Set(roles.flatMap((role) => effectivePermissions(role, this.registry)));
    return {
      roles: roles.map((role) => ({ publicId: role.publicId, name: role.name })),
      // En el orden del catálogo, para que la respuesta sea estable.
      permissions: this.registry.keys().filter((key) => granted.has(key)),
      isSuperAdmin: roles.some((role) => role.isSuperAdmin()),
    };
  }
}
