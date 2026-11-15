import type { UseCase } from "../use-case.ts";
import { AppError } from "../../entities/errors/app-error.ts";
import type { PermissionRegistry } from "../permissions/permission.ts";
import type { RoleRepository } from "./ports/role.repository.ts";
import { type RoleView, toRoleView } from "./role-view.ts";
import { assertKnownPermissions } from "./known-permissions.ts";

export interface UpdateRoleInput {
  publicId: string;
  /** Solo cambian los campos presentes. */
  changes: {
    name?: string | undefined;
    description?: string | null | undefined;
    permissions?: readonly string[] | undefined;
  };
}

export class UpdateRole implements UseCase<UpdateRoleInput, RoleView> {
  private readonly roles: RoleRepository;
  private readonly registry: PermissionRegistry;

  constructor(deps: { roles: RoleRepository; registry: PermissionRegistry }) {
    this.roles = deps.roles;
    this.registry = deps.registry;
  }

  async execute(input: UpdateRoleInput): Promise<RoleView> {
    const role = await this.roles.findByPublicId(input.publicId);
    if (!role) throw new AppError("not_found", { code: "ROLE_NOT_FOUND" });
    // Antes que cualquier otra validación: un rol de sistema no se toca, mande lo que mande.
    role.assertEditable();
    assertKnownPermissions(this.registry, input.changes.permissions);

    const updated = role.update(input.changes);
    await this.roles.update(updated);
    return toRoleView(updated, this.registry);
  }
}
