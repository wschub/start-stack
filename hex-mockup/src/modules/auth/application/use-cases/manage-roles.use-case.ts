import { AppError } from "../../../../shared/errors/app-error.ts";
import type { PermissionRegistry } from "../../../../shared/permissions/permission.ts";
import { Role } from "../../domain/entities/role.ts";
import type { RoleRepository } from "../../domain/repositories/role.repository.ts";
import { type RoleView, toRoleView } from "../role-view.ts";

export interface RoleInput {
  name: string;
  description?: string | null | undefined;
  permissions?: readonly string[] | undefined;
}

export interface RoleChangesInput {
  name?: string | undefined;
  description?: string | null | undefined;
  permissions?: readonly string[] | undefined;
}

const notFound = () => new AppError("not_found", { code: "ROLE_NOT_FOUND" });

/** Casos de uso de la gestión de roles: listar, ver, crear, editar y borrar. */
export class ManageRoles {
  private readonly roles: RoleRepository;
  private readonly registry: PermissionRegistry;

  constructor(deps: { roles: RoleRepository; registry: PermissionRegistry }) {
    this.roles = deps.roles;
    this.registry = deps.registry;
  }

  async list(): Promise<RoleView[]> {
    const roles = await this.roles.list();
    return roles.map((role) => toRoleView(role, this.registry));
  }

  async get(publicId: string): Promise<RoleView> {
    return toRoleView(await this.find(publicId), this.registry);
  }

  async create(input: RoleInput): Promise<RoleView> {
    this.assertKnownPermissions(input.permissions);
    const role = Role.create(input);
    await this.roles.add(role);
    return toRoleView(role, this.registry);
  }

  async update(publicId: string, changes: RoleChangesInput): Promise<RoleView> {
    const role = await this.find(publicId);
    role.assertEditable();
    this.assertKnownPermissions(changes.permissions);
    const updated = role.update(changes);
    await this.roles.update(updated);
    return toRoleView(updated, this.registry);
  }

  async remove(publicId: string): Promise<void> {
    const role = await this.find(publicId);
    role.assertEditable();
    await this.roles.remove(role.publicId);
  }

  private async find(publicId: string): Promise<Role> {
    const role = await this.roles.findByPublicId(publicId);
    if (!role) throw notFound();
    return role;
  }

  private assertKnownPermissions(permissions: readonly string[] | undefined): void {
    const unknown = (permissions ?? []).filter((key) => !this.registry.has(key));
    if (unknown.length > 0) {
      throw new AppError("validation", {
        code: "UNKNOWN_PERMISSION",
        details: { issues: unknown.map((key) => ({ field: "permissions", code: key })) },
      });
    }
  }
}
