import type { User } from "../entities/user.entity.ts";

export interface UserRepository {
  /** Guarda un usuario nuevo. Lanza AppError conflict EMAIL_ALREADY_EXISTS si el email ya existe. */
  add(user: User): Promise<void>;
  findByEmail(email: string): Promise<User | null>;
  findByPublicId(publicId: string): Promise<User | null>;
}
