import { AppError } from "../../../../shared/errors/app-error.ts";
import type { PermissionRegistry } from "../../../../shared/permissions/permission.ts";
import type { RoleRepository } from "../../domain/repositories/role.repository.ts";
import { type RoleView, toRoleView } from "../dtos/role-view.ts";

export class GetRole {
  private readonly roles: RoleRepository;
  private readonly registry: PermissionRegistry;

  constructor(deps: { roles: RoleRepository; registry: PermissionRegistry }) {
    this.roles = deps.roles;
    this.registry = deps.registry;
  }

  async execute(publicId: string): Promise<RoleView> {
    const role = await this.roles.findByPublicId(publicId);
    if (!role) throw new AppError("not_found", { code: "ROLE_NOT_FOUND" });
    return toRoleView(role, this.registry);
  }
}
