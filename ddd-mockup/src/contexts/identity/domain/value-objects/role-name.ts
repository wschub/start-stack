import { AppError } from "../../../../shared/errors/app-error.ts";

const PATTERN = /^[\p{L}\p{N}][\p{L}\p{N} _-]*$/u;
const MIN_LENGTH = 2;
const MAX_LENGTH = 50;

/**
 * Nombre de un rol. Dos nombres son el mismo si coinciden sin distinguir mayúsculas, espacios ni
 * guiones ("Jefe de ventas" = "jefe-de-ventas"); esa forma normalizada es `key`.
 */
export class RoleName {
  readonly value: string;
  readonly key: string;

  private constructor(value: string) {
    this.value = value;
    this.key = RoleName.keyOf(value);
    Object.freeze(this);
  }

  static create(raw: string): RoleName {
    const value = raw.trim().replace(/\s+/g, " ");
    if (value.length < MIN_LENGTH || value.length > MAX_LENGTH || !PATTERN.test(value)) {
      throw new AppError("validation", { code: "INVALID_ROLE_NAME", details: { field: "name" } });
    }
    return new RoleName(value);
  }

  /** Para valores que ya pasaron la validación (leídos de la base de datos). */
  static restore(value: string): RoleName {
    return new RoleName(value);
  }

  static keyOf(raw: string): string {
    return raw
      .trim()
      .toLowerCase()
      .replace(/[\s_-]+/g, "_");
  }

  equals(other: RoleName): boolean {
    return this.key === other.key;
  }

  toString(): string {
    return this.value;
  }
}
