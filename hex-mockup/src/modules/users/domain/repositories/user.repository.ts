import type { User } from "../entities/user.entity.ts";

export interface UserListQuery {
  /** Página, empezando en 1. */
  page: number;
  pageSize: number;
  /** Texto a buscar en el correo, el nombre o el apellido, sin distinguir mayúsculas. */
  search?: string | undefined;
}

export interface UserPage {
  items: User[];
  /** Total de usuarios que cumplen la búsqueda, en todas las páginas. */
  total: number;
}

export interface UserRepository {
  /** Guarda un usuario nuevo. Lanza AppError conflict EMAIL_ALREADY_EXISTS si el email ya existe. */
  add(user: User): Promise<void>;
  findByEmail(email: string): Promise<User | null>;
  findByPublicId(publicId: string): Promise<User | null>;
  /** Guarda los cambios de un usuario existente. Lanza AppError not_found USER_NOT_FOUND si no existe. */
  update(user: User): Promise<void>;
  /** Página de usuarios ordenada por correo. */
  list(query: UserListQuery): Promise<UserPage>;
}
