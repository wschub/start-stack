import { randomUUID } from "node:crypto";
import { AggregateRoot } from "../../../../shared/domain/aggregate-root.ts";
import type { DomainEvent } from "../../../../shared/domain/domain-event.ts";
import { AppError } from "../../../../shared/errors/app-error.ts";
import { DEFAULT_LOCALE, type Locale, SUPPORTED_LOCALES } from "../../../../shared/i18n/locale.ts";
import type {
  UserPasswordChanged,
  UserRegistered,
  UserStatusChanged,
} from "../events/user-events.ts";
import { CountryCode } from "../value-objects/country-code.ts";
import { Email } from "../value-objects/email.ts";
import { PersonName } from "../value-objects/person-name.ts";
import { PhoneNumber } from "../value-objects/phone-number.ts";

export type UserStatus = "ACTIVE" | "INACTIVE";

/** Estado del usuario en tipos primitivos: es la forma en que se guarda y se reconstruye. */
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
  countryDefault?: string | null | undefined;
  mobilePhone?: string | null | undefined;
  locale?: string | undefined;
}

export interface UserFactoryOptions {
  generateId?: () => string;
  now?: () => Date;
}

interface UserState {
  publicId: string;
  email: Email;
  passwordHash: string;
  firstName: PersonName;
  lastName: PersonName;
  countryDefault: CountryCode | null;
  mobilePhone: PhoneNumber | null;
  locale: Locale;
  status: UserStatus;
  createdAt: Date;
  updatedAt: Date;
}

function parseLocale(value: string | undefined): Locale {
  if (value === undefined) return DEFAULT_LOCALE;
  const locale = SUPPORTED_LOCALES.find((supported) => supported === value);
  if (!locale) {
    throw new AppError("validation", { code: "INVALID_LOCALE", details: { field: "locale" } });
  }
  return locale;
}

/**
 * Agregado User: la cuenta de una persona. Sus datos son objetos de valor (no puede existir un
 * User con un correo o un teléfono inválidos) y cada cambio relevante anota un evento de dominio.
 * Es inmutable: los métodos que cambian algo devuelven otro User.
 */
export class User extends AggregateRoot {
  private readonly state: Readonly<UserState>;

  private constructor(state: UserState, events: readonly DomainEvent[] = []) {
    super(events);
    this.state = Object.freeze({ ...state });
    Object.freeze(this);
  }

  /** Alta de una cuenta nueva. Anota el evento `user.registered`. */
  static create(input: NewUserInput, options: UserFactoryOptions = {}): User {
    const now = (options.now ?? (() => new Date()))();
    const state: UserState = {
      publicId: (options.generateId ?? randomUUID)(),
      email: Email.create(input.email),
      passwordHash: input.passwordHash,
      firstName: PersonName.create(input.firstName, "firstName"),
      lastName: PersonName.create(input.lastName, "lastName"),
      countryDefault:
        input.countryDefault === undefined || input.countryDefault === null
          ? null
          : CountryCode.create(input.countryDefault),
      mobilePhone:
        input.mobilePhone === undefined || input.mobilePhone === null
          ? null
          : PhoneNumber.create(input.mobilePhone),
      locale: parseLocale(input.locale),
      status: "ACTIVE",
      createdAt: now,
      updatedAt: now,
    };
    const registered: UserRegistered = {
      name: "user.registered",
      occurredAt: now,
      userId: state.publicId,
      email: state.email.value,
      firstName: state.firstName.value,
      locale: state.locale,
    };
    return new User(state, [registered]);
  }

  /** Reconstruye un usuario ya guardado. No valida de nuevo ni anota eventos. */
  static restore(props: UserProps): User {
    return new User({
      publicId: props.publicId,
      email: Email.restore(props.email),
      passwordHash: props.passwordHash,
      firstName: PersonName.restore(props.firstName),
      lastName: PersonName.restore(props.lastName),
      countryDefault:
        props.countryDefault === null ? null : CountryCode.restore(props.countryDefault),
      mobilePhone: props.mobilePhone === null ? null : PhoneNumber.restore(props.mobilePhone),
      locale: props.locale,
      status: props.status,
      createdAt: props.createdAt,
      updatedAt: props.updatedAt,
    });
  }

  get publicId(): string {
    return this.state.publicId;
  }

  get email(): string {
    return this.state.email.value;
  }

  get passwordHash(): string {
    return this.state.passwordHash;
  }

  get firstName(): string {
    return this.state.firstName.value;
  }

  get lastName(): string {
    return this.state.lastName.value;
  }

  get countryDefault(): string | null {
    return this.state.countryDefault?.value ?? null;
  }

  get mobilePhone(): string | null {
    return this.state.mobilePhone?.value ?? null;
  }

  get locale(): Locale {
    return this.state.locale;
  }

  get status(): UserStatus {
    return this.state.status;
  }

  get createdAt(): Date {
    return this.state.createdAt;
  }

  get updatedAt(): Date {
    return this.state.updatedAt;
  }

  isActive(): boolean {
    return this.state.status === "ACTIVE";
  }

  deactivate(now: () => Date = () => new Date()): User {
    return this.withStatus("INACTIVE", now());
  }

  activate(now: () => Date = () => new Date()): User {
    return this.withStatus("ACTIVE", now());
  }

  /** Anota el evento `user.password_changed`, con el que se cierran sus sesiones abiertas. */
  changePassword(passwordHash: string, now: () => Date = () => new Date()): User {
    const at = now();
    const changed: UserPasswordChanged = {
      name: "user.password_changed",
      occurredAt: at,
      userId: this.publicId,
    };
    return new User({ ...this.state, passwordHash, updatedAt: at }, [...this.events, changed]);
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

  private withStatus(status: UserStatus, at: Date): User {
    const changed: UserStatusChanged = {
      name: "user.status_changed",
      occurredAt: at,
      userId: this.publicId,
      status,
    };
    return new User({ ...this.state, status, updatedAt: at }, [...this.events, changed]);
  }
}
