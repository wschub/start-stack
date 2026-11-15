import { AppError } from "../../../../shared/errors/app-error.ts";
import type { UserRepository } from "../../domain/repositories/user.repository.ts";
import type { Role } from "../../domain/aggregates/role.ts";
import type { RoleRepository } from "../../domain/repositories/role.repository.ts";
import {
  assertActorIsSuperAdmin,
  assertNotLastSuperAdmin,
  changesSuperAdminMembership,
} from "../../domain/services/super-admin-policy.ts";
import type { GetUserAccess, UserAccess } from "../queries/get-user-access.query.ts";

export interface AssignUserRolesInput {
  /** Quién hace el cambio. */
  actorPublicId: string;
  userPublicId: string;
  /** Lista completa de roles que debe tener el usuario al terminar. */
  roleIds: readonly string[];
}

export class AssignUserRoles {
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
    const found = await Promise.all(roleIds.map((id) => this.roles.findByPublicId(id)));
    const requested = found.filter((role): role is Role => role !== null);
    if (requested.length !== roleIds.length) {
      throw new AppError("validation", { code: "UNKNOWN_ROLE", details: { field: "roleIds" } });
    }

    const current = await this.roles.findByUser(user.publicId);
    if (changesSuperAdminMembership(current, requested)) {
      assertActorIsSuperAdmin(await this.roles.findByUser(input.actorPublicId));

      const superAdmin = current.find((role) => role.isSuperAdmin());
      if (superAdmin && user.isActive()) {
        assertNotLastSuperAdmin(await this.roles.countActiveUsersWithRole(superAdmin.publicId));
      }
    }

    await this.roles.setUserRoles(user.publicId, roleIds);
    return this.getUserAccess.execute(user.publicId);
  }
}
