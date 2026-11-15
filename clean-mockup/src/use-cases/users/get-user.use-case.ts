import type { UseCase } from "../use-case.ts";
import { AppError } from "../../entities/errors/app-error.ts";
import type { UserRepository } from "./ports/user.repository.ts";
import { type PublicUser, toPublicUser } from "./public-user.ts";

export class GetUser implements UseCase<string, PublicUser> {
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
