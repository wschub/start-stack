import type { UseCase } from "../use-case.ts";
import type { PermissionRegistry } from "../permissions/permission.ts";
import type { RoleRepository } from "./ports/role.repository.ts";
import { type RoleView, toRoleView } from "./role-view.ts";

/** Todos los roles: primero los de sistema y después el resto por nombre. */
export class ListRoles implements UseCase<void, RoleView[]> {
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
