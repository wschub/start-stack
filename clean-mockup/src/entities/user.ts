import { randomUUID } from "node:crypto";
import { AppError } from "./errors/app-error.ts";
import { DEFAULT_LOCALE, type Locale, SUPPORTED_LOCALES } from "./locale.ts";

export type UserStatus = "ACTIVE" | "INACTIVE";

export interface UserProps {
  publicId: string;
  email: string;
  passwordHash: string;
  firstName: string;
  lastName: string;
  countryDefault: string | null;
  mobilePhone: string | null;
  locale: Locale;
  status: UserStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface NewUserInput {
  email: string;
  passwordHash: string;
  firstName: string;
  lastName: string;
  countryDefault?: string | null;
  mobilePhone?: string | null;
  locale?: string;
}

export interface UserFactoryOptions {
  generateId?: () => string;
  now?: () => Date;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const COUNTRY = /^[A-Z]{2}$/;
const E164 = /^\+[1-9]\d{6,14}$/;
const MAX_EMAIL = 254;
const MAX_NAME = 100;

function invalid(code: string, field: string): AppError {
  return new AppError("validation", { code, details: { field } });
}

function normalizeEmail(value: string): string {
  const email = value.trim().toLowerCase();
  if (email.length > MAX_EMAIL || !EMAIL.test(email)) throw invalid("INVALID_EMAIL", "email");
  return email;
}

function normalizeName(value: string, field: string): string {
  const name = value.trim();
  if (name.length === 0 || name.length > MAX_NAME) throw invalid("INVALID_NAME", field);
  return name;
}

function normalizeCountry(value: string | null | undefined): string | null {
  if (value === undefined || value === null) return null;
  const country = value.trim().toUpperCase();
  if (!COUNTRY.test(country)) throw invalid("INVALID_COUNTRY", "countryDefault");
  return country;
}

function normalizePhone(value: string | null | undefined): string | null {
  if (value === undefined || value === null) return null;
  const phone = value.trim();
  if (!E164.test(phone)) throw invalid("INVALID_PHONE", "mobilePhone");
  return phone;
}

function normalizeLocale(value: string | undefined): Locale {
  if (value === undefined) return DEFAULT_LOCALE;
  const locale = SUPPORTED_LOCALES.find((supported) => supported === value);
  if (!locale) throw invalid("INVALID_LOCALE", "locale");
  return locale;
}

export class User {
  readonly publicId: string;
  readonly email: string;
  readonly passwordHash: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly countryDefault: string | null;
  readonly mobilePhone: string | null;
  readonly locale: Locale;
  readonly status: UserStatus;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  private constructor(props: UserProps) {
    this.publicId = props.publicId;
    this.email = props.email;
    this.passwordHash = props.passwordHash;
    this.firstName = props.firstName;
    this.lastName = props.lastName;
    this.countryDefault = props.countryDefault;
    this.mobilePhone = props.mobilePhone;
    this.locale = props.locale;
    this.status = props.status;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
    Object.freeze(this);
  }

  static create(input: NewUserInput, options: UserFactoryOptions = {}): User {
    const generateId = options.generateId ?? randomUUID;
    const now = (options.now ?? (() => new Date()))();
    return new User({
      publicId: generateId(),
      email: normalizeEmail(input.email),
      passwordHash: input.passwordHash,
      firstName: normalizeName(input.firstName, "firstName"),
      lastName: normalizeName(input.lastName, "lastName"),
      countryDefault: normalizeCountry(input.countryDefault),
      mobilePhone: normalizePhone(input.mobilePhone),
      locale: normalizeLocale(input.locale),
      status: "ACTIVE",
      createdAt: now,
      updatedAt: now,
    });
  }

  static restore(props: UserProps): User {
    return new User(props);
  }

  isActive(): boolean {
    return this.status === "ACTIVE";
  }

  deactivate(now: () => Date = () => new Date()): User {
    return new User({ ...this.toProps(), status: "INACTIVE", updatedAt: now() });
  }

  activate(now: () => Date = () => new Date()): User {
    return new User({ ...this.toProps(), status: "ACTIVE", updatedAt: now() });
  }

  changePassword(passwordHash: string, now: () => Date = () => new Date()): User {
    return new User({ ...this.toProps(), passwordHash, updatedAt: now() });
  }

  toProps(): UserProps {
    return {
      publicId: this.publicId,
      email: this.email,
      passwordHash: this.passwordHash,
      firstName: this.firstName,
      lastName: this.lastName,
      countryDefault: this.countryDefault,
      mobilePhone: this.mobilePhone,
      locale: this.locale,
      status: this.status,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}
