import type { Role } from "../../../entities/role.ts";

export interface RoleRepository {
  /** Guarda un rol nuevo. Lanza AppError conflict ROLE_NAME_TAKEN si el nombre ya existe. */
  add(role: Role): Promise<void>;
  /** Guarda los cambios de un rol. Lanza ROLE_NAME_TAKEN o not_found ROLE_NOT_FOUND. */
  update(role: Role): Promise<void>;
  /** Borra el rol y lo retira de todos los usuarios que lo tenían. */
  remove(publicId: string): Promise<void>;
  findByPublicId(publicId: string): Promise<Role | null>;
  findByName(name: string): Promise<Role | null>;
  /** Todos los roles: primero los de sistema y después el resto por nombre. */
  list(): Promise<Role[]>;
  findByUser(userPublicId: string): Promise<Role[]>;
  /** Sustituye los roles del usuario por los indicados. */
  setUserRoles(userPublicId: string, rolePublicIds: readonly string[]): Promise<void>;
  /** Cuántos usuarios activos tienen el rol. */
  countActiveUsersWithRole(rolePublicId: string): Promise<number>;
}
