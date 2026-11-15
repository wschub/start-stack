import type { PermissionRegistry } from "../../../../shared/permissions/permission.ts";
import type { RoleRepository } from "../../domain/repositories/role.repository.ts";
import { type RoleView, toRoleView } from "../dtos/role-view.ts";

/** Todos los roles: primero los de sistema y después el resto por nombre. */
export class ListRoles {
  private readonly roles: RoleRepository;
  private readonly registry: PermissionRegistry;

  constructor(deps: { roles: RoleRepository; registry: PermissionRegistry }) {
    this.roles = deps.roles;
    this.registry = deps.registry;
  }

  async execute(): Promise<RoleView[]> {
    const roles = await this.roles.list();
    return roles.map((role) => toRoleView(role, this.registry));
  }
}
