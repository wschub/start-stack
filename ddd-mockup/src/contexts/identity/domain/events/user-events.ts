import type { DomainEvent } from "../../../../shared/domain/domain-event.ts";
import type { Locale } from "../../../../shared/i18n/locale.ts";

export interface UserRegistered extends DomainEvent {
  readonly name: "user.registered";
  readonly userId: string;
  readonly email: string;
  readonly firstName: string;
  readonly locale: Locale;
}

export interface UserPasswordChanged extends DomainEvent {
  readonly name: "user.password_changed";
  readonly userId: string;
}

export interface UserStatusChanged extends DomainEvent {
  readonly name: "user.status_changed";
  readonly userId: string;
  readonly status: "ACTIVE" | "INACTIVE";
}
