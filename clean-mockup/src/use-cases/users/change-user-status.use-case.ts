import type { UseCase } from "../use-case.ts";
import { AppError } from "../../entities/errors/app-error.ts";
import type { UserStatus } from "../../entities/user.ts";
import type { UserRepository } from "./ports/user.repository.ts";
import type { UserStatusGuard } from "./ports/user-status-guard.ts";
import { type PublicUser, toPublicUser } from "./public-user.ts";

export interface ChangeUserStatusInput {
  /** Quién hace el cambio. */
  actorPublicId: string;
  userPublicId: string;
  status: UserStatus;
}

export class ChangeUserStatus implements UseCase<ChangeUserStatusInput, PublicUser> {
  private readonly users: UserRepository;
  private readonly guard: UserStatusGuard | undefined;
  private readonly now: () => Date;

  constructor(deps: { users: UserRepository; guard?: UserStatusGuard; now?: () => Date }) {
    this.users = deps.users;
    this.guard = deps.guard;
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
    await this.guard?.assertCanChangeStatus(input.actorPublicId, user.publicId);

    const updated = input.status === "ACTIVE" ? user.activate(this.now) : user.deactivate(this.now);
    await this.users.update(updated);
    return toPublicUser(updated);
  }
}
