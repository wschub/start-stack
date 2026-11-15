import { randomUUID } from "node:crypto";
import { AppError } from "../../../../shared/errors/app-error.ts";
import type { User } from "../../domain/aggregates/user.ts";
import type { UserRepository } from "../../domain/repositories/user.repository.ts";
import type { PasswordHasher } from "../ports/password-hasher.ts";

export interface AuthenticateUserInput {
  email: string;
  password: string;
}

export class AuthenticateUser {
  private readonly users: UserRepository;
  private readonly hasher: PasswordHasher;
  private dummyHash: Promise<string> | undefined;

  constructor(deps: { users: UserRepository; hasher: PasswordHasher }) {
    this.users = deps.users;
    this.hasher = deps.hasher;
  }

  async execute(input: AuthenticateUserInput): Promise<User> {
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
    return user;
  }

  private getDummyHash(): Promise<string> {
    this.dummyHash ??= this.hasher.hash(randomUUID());
    return this.dummyHash;
  }
}
