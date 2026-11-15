import type { UseCase } from "../use-case.ts";
import { randomUUID } from "node:crypto";
import { AppError } from "../../entities/errors/app-error.ts";
import type { UserRepository } from "../users/ports/user.repository.ts";
import { type PublicUser, toPublicUser } from "../users/public-user.ts";
import type { PasswordHasher } from "./ports/password-hasher.ts";

export interface AuthenticateUserInput {
  email: string;
  password: string;
}

export class AuthenticateUser implements UseCase<AuthenticateUserInput, PublicUser> {
  private readonly users: UserRepository;
  private readonly hasher: PasswordHasher;
  private dummyHash: Promise<string> | undefined;

  constructor(deps: { users: UserRepository; hasher: PasswordHasher }) {
    this.users = deps.users;
    this.hasher = deps.hasher;
  }

  async execute(input: AuthenticateUserInput): Promise<PublicUser> {
    const user = await this.users.findByEmail(input.email);
    // Si el usuario no existe se verifica igualmente un hash falso, para que el tiempo de
    // respuesta no revele qué emails están registrados.
    const hash = user ? user.passwordHash : await this.getDummyHash();
    const matches = await this.hasher.verify(hash, input.password);

    if (!user || !matches) {
      throw new AppError("unauthenticated", { code: "INVALID_CREDENTIALS" });
    }
    if (!user.isActive()) {
      throw new AppError("forbidden", { code: "ACCOUNT_INACTIVE" });
    }
    return toPublicUser(user);
  }

  private getDummyHash(): Promise<string> {
    this.dummyHash ??= this.hasher.hash(randomUUID());
    return this.dummyHash;
  }
}
