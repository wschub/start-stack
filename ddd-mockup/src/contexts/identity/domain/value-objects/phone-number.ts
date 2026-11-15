import { AppError } from "../../../../shared/errors/app-error.ts";

const E164 = /^\+[1-9]\d{6,14}$/;

/** Teléfono en formato internacional E.164 ("+573001234567"). */
export class PhoneNumber {
  readonly value: string;

  private constructor(value: string) {
    this.value = value;
    Object.freeze(this);
  }

  static create(raw: string): PhoneNumber {
    const value = raw.trim();
    if (!E164.test(value)) {
      throw new AppError("validation", {
        code: "INVALID_PHONE",
        details: { field: "mobilePhone" },
      });
    }
    return new PhoneNumber(value);
  }

  /** Para valores que ya pasaron la validación (leídos de la base de datos). */
  static restore(value: string): PhoneNumber {
    return new PhoneNumber(value);
  }

  equals(other: PhoneNumber): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
