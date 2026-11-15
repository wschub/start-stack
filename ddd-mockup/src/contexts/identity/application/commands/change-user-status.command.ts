import { AppError } from "../../../../shared/errors/app-error.ts";
import type { UserStatus } from "../../domain/aggregates/user.ts";
import type { RoleRepository } from "../../domain/repositories/role.repository.ts";
import type { UserRepository } from "../../domain/repositories/user.repository.ts";
import { assertActorIsSuperAdmin, isSuperAdmin } from "../../domain/services/super-admin-policy.ts";
import { type PublicUser, toPublicUser } from "../dtos/public-user.ts";

export interface ChangeUserStatusInput {
  /** Quién hace el cambio. */
  actorPublicId: string;
  userPublicId: string;
  status: UserStatus;
}

export class ChangeUserStatus {
  private readonly users: UserRepository;
  private readonly roles: RoleRepository;
  private readonly now: () => Date;

  constructor(deps: { users: UserRepository; roles: RoleRepository; now?: () => Date }) {
    this.users = deps.users;
    this.roles = deps.roles;
    this.now = deps.now ?? (() => new Date());
  }

  async execute(input: ChangeUserStatusInput): Promise<PublicUser> {
    const user = await this.users.findByPublicId(input.userPublicId);
    if (!user) throw new AppError("not_found", { code: "USER_NOT_FOUND" });
    if (user.status === input.status) return toPublicUser(user);

    // Nadie se desactiva a sí mismo: así quien administra nunca se queda fuera por error.
    if (input.status === "INACTIVE" && input.actorPublicId === user.publicId) {
      throw new AppError("conflict", { code: "CANNOT_DEACTIVATE_SELF" });
    }
    // Solo un superadministrador activa o desactiva a otro. Junto con la regla anterior,
    // garantiza que siempre queda al menos un superadministrador activo.
    if (isSuperAdmin(await this.roles.findByUser(user.publicId))) {
      assertActorIsSuperAdmin(await this.roles.findByUser(input.actorPublicId));
    }

    const updated = input.status === "ACTIVE" ? user.activate(this.now) : user.deactivate(this.now);
    await this.users.update(updated);
    return toPublicUser(updated);
  }
}
