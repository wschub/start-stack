import { AppError } from "../../../../shared/errors/app-error.ts";
import type { UserRepository } from "../../domain/repositories/user.repository.ts";
import { type PublicUser, toPublicUser } from "../dtos/public-user.ts";

export class GetUser {
  private readonly users: UserRepository;

  constructor(deps: { users: UserRepository }) {
    this.users = deps.users;
  }

  async execute(publicId: string): Promise<PublicUser> {
    const user = await this.users.findByPublicId(publicId);
    if (!user) throw new AppError("not_found", { code: "USER_NOT_FOUND" });
    return toPublicUser(user);
  }
}
