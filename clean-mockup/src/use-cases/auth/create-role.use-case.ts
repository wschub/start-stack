import type { UseCase } from "../use-case.ts";
import type { PermissionRegistry } from "../permissions/permission.ts";
import { Role } from "../../entities/role.ts";
import type { RoleRepository } from "./ports/role.repository.ts";
import { type RoleView, toRoleView } from "./role-view.ts";
import { assertKnownPermissions } from "./known-permissions.ts";

export interface CreateRoleInput {
  name: string;
  description?: string | null | undefined;
  permissions?: readonly string[] | undefined;
}

export class CreateRole implements UseCase<CreateRoleInput, RoleView> {
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
