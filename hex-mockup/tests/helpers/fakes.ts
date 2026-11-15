import { AppError } from "../../src/shared/errors/app-error.ts";
import type { PasswordHasher } from "../../src/modules/auth/application/ports/password-hasher.ts";
import type { User } from "../../src/modules/users/domain/entities/user.entity.ts";
import type { UserRepository } from "../../src/modules/users/domain/repositories/user.repository.ts";

export class InMemoryUserRepository implements UserRepository {
  readonly byEmail = new Map<string, User>();

  async add(user: User): Promise<void> {
    if (this.byEmail.has(user.email)) {
      throw new AppError("conflict", { code: "EMAIL_ALREADY_EXISTS" });
    }
    this.byEmail.set(user.email, user);
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.byEmail.get(email.trim().toLowerCase()) ?? null;
  }

  async findByPublicId(publicId: string): Promise<User | null> {
    return [...this.byEmail.values()].find((user) => user.publicId === publicId) ?? null;
  }

  async update(user: User): Promise<void> {
    const current = await this.findByPublicId(user.publicId);
    if (!current) throw new AppError("not_found", { code: "USER_NOT_FOUND" });
    this.byEmail.delete(current.email);
    this.byEmail.set(user.email, user);
  }
}

export class FakePasswordHasher implements PasswordHasher {
  hashCalls = 0;
  verifyCalls = 0;

  async hash(plain: string): Promise<string> {
    this.hashCalls += 1;
    return `hashed:${plain}`;
  }

  async verify(hash: string, plain: string): Promise<boolean> {
    this.verifyCalls += 1;
    return hash === `hashed:${plain}`;
  }
}
