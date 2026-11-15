import { AppError } from "../../../../shared/errors/app-error.ts";

const MAX_LENGTH = 100;

/** Nombre o apellido de una persona: no vacío y de longitud razonable. */
export class PersonName {
  readonly value: string;

  private constructor(value: string) {
    this.value = value;
    Object.freeze(this);
  }

  /** `field` indica en el error qué campo falló ("firstName" o "lastName"). */
  static create(raw: string, field: string): PersonName {
    const value = raw.trim();
    if (value.length === 0 || value.length > MAX_LENGTH) {
      throw new AppError("validation", { code: "INVALID_NAME", details: { field } });
    }
    return new PersonName(value);
  }

  /** Para valores que ya pasaron la validación (leídos de la base de datos). */
  static restore(value: string): PersonName {
    return new PersonName(value);
  }

  equals(other: PersonName): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
