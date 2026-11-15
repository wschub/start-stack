import { AppError } from "../../../../shared/errors/app-error.ts";

const PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_LENGTH = 254;

/** Correo electrónico válido, siempre en minúsculas y sin espacios alrededor. */
export class Email {
  readonly value: string;

  private constructor(value: string) {
    this.value = value;
    Object.freeze(this);
  }

  static create(raw: string): Email {
    const value = raw.trim().toLowerCase();
    if (value.length > MAX_LENGTH || !PATTERN.test(value)) {
      throw new AppError("validation", { code: "INVALID_EMAIL", details: { field: "email" } });
    }
    return new Email(value);
  }

  /** Normaliza un correo para buscarlo; no valida, porque uno inválido simplemente no existe. */
  static normalize(raw: string): string {
    return raw.trim().toLowerCase();
  }

  /** Para valores que ya pasaron la validación (leídos de la base de datos). */
  static restore(value: string): Email {
    return new Email(value);
  }

  equals(other: Email): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
