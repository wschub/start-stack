import type { UseCase } from "../use-case.ts";
import { AppError } from "../../entities/errors/app-error.ts";
import type { PermissionRegistry } from "../permissions/permission.ts";
import type { RoleRepository } from "./ports/role.repository.ts";
import { type RoleView, toRoleView } from "./role-view.ts";

export class GetRole implements UseCase<string, RoleView> {
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
