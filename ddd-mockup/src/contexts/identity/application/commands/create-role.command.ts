import type { PermissionRegistry } from "../../../../shared/permissions/permission.ts";
import { Role } from "../../domain/aggregates/role.ts";
import type { RoleRepository } from "../../domain/repositories/role.repository.ts";
import { type RoleView, toRoleView } from "../dtos/role-view.ts";
import { assertKnownPermissions } from "../services/known-permissions.ts";

export interface CreateRoleInput {
  name: string;
  description?: string | null | undefined;
  permissions?: readonly string[] | undefined;
}

export class CreateRole {
  private readonly roles: RoleRepository;
  private readonly registry: PermissionRegistry;

  constructor(deps: { roles: RoleRepository; registry: PermissionRegistry }) {
    this.roles = deps.roles;
    this.registry = deps.registry;
  }

  async execute(input: CreateRoleInput): Promise<RoleView> {
    assertKnownPermissions(this.registry, input.permissions);
    const role = Role.create(input);
    await this.roles.add(role);
    return toRoleView(role, this.registry);
  }
}
