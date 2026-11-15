import { randomUUID } from "node:crypto";
import { AggregateRoot } from "../../../../shared/domain/aggregate-root.ts";
import { AppError } from "../../../../shared/errors/app-error.ts";
import { RoleName } from "../value-objects/role-name.ts";

/** Rol de sistema: tiene todos los permisos, presentes y futuros, y no se puede editar ni borrar. */
export const SUPER_ADMIN_ROLE = "SUPER_ADMIN";

export interface RoleProps {
  publicId: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  permissions: readonly string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface NewRoleInput {
  name: string;
  description?: string | null | undefined;
  permissions?: readonly string[] | undefined;
}

export interface RoleChanges {
  name?: string | undefined;
  description?: string | null | undefined;
  permissions?: readonly string[] | undefined;
}

export interface RoleFactoryOptions {
  generateId?: () => string;
  now?: () => Date;
}

const MAX_DESCRIPTION = 200;

function invalid(code: string, field: string): AppError {
  return new AppError("validation", { code, details: { field } });
}

function normalizeName(value: string): string {
  const name = RoleName.create(value);
  // El nombre del rol de sistema está reservado, se escriba como se escriba.
  if (name.equals(RoleName.restore(SUPER_ADMIN_ROLE))) {
    throw new AppError("conflict", { code: "ROLE_NAME_TAKEN" });
  }
  return name.value;
}

function normalizeDescription(value: string | null | undefined): string | null {
  if (value === undefined || value === null) return null;
  const description = value.trim();
  if (description.length > MAX_DESCRIPTION) {
    throw invalid("INVALID_ROLE_DESCRIPTION", "description");
  }
  return description === "" ? null : description;
}

function normalizePermissions(values: readonly string[] | undefined): string[] {
  return [...new Set(values ?? [])].sort();
}

/** Clave con la que se compara la unicidad del nombre (ver RoleName). */
export function roleNameKey(name: string): string {
  return RoleName.keyOf(name);
}

/**
 * Agregado Role: un nombre y el conjunto de permisos que concede. Protege dos invariantes: el
 * nombre es válido y no usurpa el del rol de sistema, y los roles de sistema no se modifican.
 */
export class Role extends AggregateRoot {
  readonly publicId: string;
  readonly name: string;
  readonly description: string | null;
  readonly isSystem: boolean;
  readonly permissions: readonly string[];
  readonly createdAt: Date;
  readonly updatedAt: Date;

  private constructor(props: RoleProps) {
    super();
    this.publicId = props.publicId;
    this.name = props.name;
    this.description = props.description;
    this.isSystem = props.isSystem;
    this.permissions = Object.freeze([...props.permissions]);
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
    Object.freeze(this);
  }

  /** Crea un rol normal. Los roles de sistema solo nacen en una migración. */
  static create(input: NewRoleInput, options: RoleFactoryOptions = {}): Role {
    const now = (options.now ?? (() => new Date()))();
    return new Role({
      publicId: (options.generateId ?? randomUUID)(),
      name: normalizeName(input.name),
      description: normalizeDescription(input.description),
      isSystem: false,
      permissions: normalizePermissions(input.permissions),
      createdAt: now,
      updatedAt: now,
    });
  }

  static restore(props: RoleProps): Role {
    return new Role(props);
  }

  isSuperAdmin(): boolean {
    return this.isSystem && this.name === SUPER_ADMIN_ROLE;
  }

  /** Lanza SYSTEM_ROLE_IMMUTABLE si el rol es de sistema: ni se edita ni se borra. */
  assertEditable(): void {
    if (this.isSystem) throw new AppError("forbidden", { code: "SYSTEM_ROLE_IMMUTABLE" });
  }

  update(changes: RoleChanges, now: () => Date = () => new Date()): Role {
    this.assertEditable();
    return new Role({
      ...this.toProps(),
      name: changes.name === undefined ? this.name : normalizeName(changes.name),
      description:
        changes.description === undefined
          ? this.description
          : normalizeDescription(changes.description),
      permissions:
        changes.permissions === undefined
          ? this.permissions
          : normalizePermissions(changes.permissions),
      updatedAt: now(),
    });
  }

  toProps(): RoleProps {
    return {
      publicId: this.publicId,
      name: this.name,
      description: this.description,
      isSystem: this.isSystem,
      permissions: [...this.permissions],
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}
