import { AppError } from "../../../../shared/errors/app-error.ts";

const PATTERN = /^[A-Z]{2}$/;

/** Código de país ISO 3166-1 alfa-2, en mayúsculas ("CO", "ES"). */
export class CountryCode {
  readonly value: string;

  private constructor(value: string) {
    this.value = value;
    Object.freeze(this);
  }

  static create(raw: string): CountryCode {
    const value = raw.trim().toUpperCase();
    if (!PATTERN.test(value)) {
      throw new AppError("validation", {
        code: "INVALID_COUNTRY",
        details: { field: "countryDefault" },
      });
    }
    return new CountryCode(value);
  }

  /** Para valores que ya pasaron la validación (leídos de la base de datos). */
  static restore(value: string): CountryCode {
    return new CountryCode(value);
  }

  equals(other: CountryCode): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
