import type { UseCase } from "../use-case.ts";
import { AppError } from "../../entities/errors/app-error.ts";
import type { UserRepository } from "../users/ports/user.repository.ts";
import type { RoleRepository } from "./ports/role.repository.ts";
import type { GetUserAccess, UserAccess } from "./get-user-access.use-case.ts";

export interface AssignUserRolesInput {
  /** Quién hace el cambio. */
  actorPublicId: string;
  userPublicId: string;
  /** Lista completa de roles que debe tener el usuario al terminar. */
  roleIds: readonly string[];
}

export class AssignUserRoles implements UseCase<AssignUserRolesInput, UserAccess> {
  private readonly users: UserRepository;
  private readonly roles: RoleRepository;
  private readonly getUserAccess: GetUserAccess;

  constructor(deps: {
    users: UserRepository;
    roles: RoleRepository;
    getUserAccess: GetUserAccess;
  }) {
    this.users = deps.users;
    this.roles = deps.roles;
    this.getUserAccess = deps.getUserAccess;
  }

  async execute(input: AssignUserRolesInput): Promise<UserAccess> {
    const user = await this.users.findByPublicId(input.userPublicId);
    if (!user) throw new AppError("not_found", { code: "USER_NOT_FOUND" });

    const roleIds = [...new Set(input.roleIds)];
    const requested = await Promise.all(roleIds.map((id) => this.roles.findByPublicId(id)));
    if (requested.some((role) => role === null)) {
      throw new AppError("validation", { code: "UNKNOWN_ROLE", details: { field: "roleIds" } });
    }

    const current = await this.roles.findByUser(user.publicId);
    const superAdmin = current.find((role) => role.isSuperAdmin());
    const willBeSuperAdmin = requested.some((role) => role?.isSuperAdmin());

    if ((superAdmin !== undefined) !== willBeSuperAdmin) {
      // Solo un superadministrador concede o retira el rol: así nadie escala privilegios con
      // el permiso de asignar roles.
      const actor = await this.getUserAccess.execute(input.actorPublicId);
      if (!actor.isSuperAdmin) throw new AppError("forbidden", { code: "SUPER_ADMIN_REQUIRED" });
    }
    if (superAdmin && !willBeSuperAdmin && user.isActive()) {
      const remaining = await this.roles.countActiveUsersWithRole(superAdmin.publicId);
      if (remaining <= 1) throw new AppError("conflict", { code: "LAST_SUPER_ADMIN" });
    }

    await this.roles.setUserRoles(user.publicId, roleIds);
    return this.getUserAccess.execute(user.publicId);
  }
}
