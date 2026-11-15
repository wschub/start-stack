import { Role, roleNameKey } from "../../src/contexts/identity/domain/aggregates/role.ts";
import type { RoleRepository } from "../../src/contexts/identity/domain/repositories/role.repository.ts";
import { AUTH_PERMISSIONS } from "../../src/contexts/identity/application/auth-permissions.ts";
import { USERS_PERMISSIONS } from "../../src/contexts/identity/application/users-permissions.ts";
import { AppError } from "../../src/shared/errors/app-error.ts";
import { PermissionRegistry } from "../../src/shared/permissions/permission.ts";
import type { InMemoryUserRepository } from "./fakes.ts";

export const SUPER_ADMIN_ID = "00000000-0000-4000-8000-000000000001";

export function testRegistry(): PermissionRegistry {
  return new PermissionRegistry([...AUTH_PERMISSIONS, ...USERS_PERMISSIONS]);
}

/** Igual que la base real tras las migraciones: nace con el rol de sistema SUPER_ADMIN. */
export class InMemoryRoleRepository implements RoleRepository {
  private readonly items = new Map<string, Role>();
  private readonly userRoles = new Map<string, string[]>();
  private readonly users: InMemoryUserRepository | undefined;

  constructor(users?: InMemoryUserRepository) {
    this.users = users;
    const epoch = new Date("2026-01-01T00:00:00Z");
    this.items.set(
      SUPER_ADMIN_ID,
      Role.restore({
        publicId: SUPER_ADMIN_ID,
        name: "SUPER_ADMIN",
        description: null,
        isSystem: true,
        permissions: [],
        createdAt: epoch,
        updatedAt: epoch,
      }),
    );
  }

  private assertNameFree(role: Role): void {
    const taken = [...this.items.values()].some(
      (item) =>
        item.publicId !== role.publicId && roleNameKey(item.name) === roleNameKey(role.name),
    );
    if (taken) throw new AppError("conflict", { code: "ROLE_NAME_TAKEN" });
  }

  async add(role: Role): Promise<void> {
    this.assertNameFree(role);
    this.items.set(role.publicId, role);
  }

  async update(role: Role): Promise<void> {
    if (!this.items.has(role.publicId)) throw new AppError("not_found", { code: "ROLE_NOT_FOUND" });
    this.assertNameFree(role);
    this.items.set(role.publicId, role);
  }

  async remove(publicId: string): Promise<void> {
    this.items.delete(publicId);
    for (const [user, roles] of this.userRoles) {
      this.userRoles.set(
        user,
        roles.filter((id) => id !== publicId),
      );
    }
  }

  async findByPublicId(publicId: string): Promise<Role | null> {
    return this.items.get(publicId) ?? null;
  }

  async findByName(name: string): Promise<Role | null> {
    const key = roleNameKey(name);
    return [...this.items.values()].find((item) => roleNameKey(item.name) === key) ?? null;
  }

  async list(): Promise<Role[]> {
    return [...this.items.values()].sort(
      (a, b) => Number(b.isSystem) - Number(a.isSystem) || a.name.localeCompare(b.name),
    );
  }

  async findByUser(userPublicId: string): Promise<Role[]> {
    const ids = this.userRoles.get(userPublicId) ?? [];
    return (await this.list()).filter((role) => ids.includes(role.publicId));
  }

  async setUserRoles(userPublicId: string, rolePublicIds: readonly string[]): Promise<void> {
    this.userRoles.set(userPublicId, [...rolePublicIds]);
  }

  async countActiveUsersWithRole(rolePublicId: string): Promise<number> {
    let count = 0;
    for (const [userPublicId, roles] of this.userRoles) {
      if (!roles.includes(rolePublicId)) continue;
      const user = this.users ? await this.users.findByPublicId(userPublicId) : null;
      if (!this.users || user?.isActive()) count += 1;
    }
    return count;
  }
}
