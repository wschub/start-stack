import { toPublicUser, type PublicUser } from "../../../users/application/public-user.ts";
import { User } from "../../../users/domain/entities/user.entity.ts";
import type { UserRepository } from "../../../users/domain/repositories/user.repository.ts";
import { assertPasswordPolicy } from "../../domain/services/password-policy.ts";
import type { PasswordHasher } from "../ports/password-hasher.ts";

export interface RegisterUserInput {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  countryDefault?: string | null;
  mobilePhone?: string | null;
  locale?: string;
}

export class RegisterUser {
  private readonly users: UserRepository;
  private readonly hasher: PasswordHasher;

  constructor(deps: { users: UserRepository; hasher: PasswordHasher }) {
    this.users = deps.users;
    this.hasher = deps.hasher;
  }

  async execute(input: RegisterUserInput): Promise<PublicUser> {
    assertPasswordPolicy(input.password);
    const passwordHash = await this.hasher.hash(input.password);
    const user = User.create({
      email: input.email,
      passwordHash,
      firstName: input.firstName,
      lastName: input.lastName,
      countryDefault: input.countryDefault,
      mobilePhone: input.mobilePhone,
      locale: input.locale,
    });
    await this.users.add(user);
    return toPublicUser(user);
  }
}
