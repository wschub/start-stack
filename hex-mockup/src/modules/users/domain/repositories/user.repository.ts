import type { User } from "../entities/user.entity.ts";

export interface UserRepository {
  /** Guarda un usuario nuevo. Lanza AppError conflict EMAIL_ALREADY_EXISTS si el email ya existe. */
  add(user: User): Promise<void>;
  findByEmail(email: string): Promise<User | null>;
  findByPublicId(publicId: string): Promise<User | null>;
  /** Guarda los cambios de un usuario existente. Lanza AppError not_found USER_NOT_FOUND si no existe. */
  update(user: User): Promise<void>;
}
