import type { DomainEvent } from "../../../../shared/domain/domain-event.ts";
import type { Locale } from "../../../../shared/i18n/locale.ts";

/**
 * Lleva el secreto en claro porque es el único momento en que existe: en la base solo se guarda
 * su hash. Por eso este evento no debe persistirse ni escribirse en logs tal cual; si se envía
 * por una cola, el transporte debe ir cifrado y el mensaje caducar con el secreto.
 */
export interface PasswordResetRequested extends DomainEvent {
  readonly name: "password_reset.requested";
  readonly userId: string;
  readonly email: string;
  readonly firstName: string;
  readonly locale: Locale;
  readonly method: "link" | "code";
  /** Token del enlace o código de 6 dígitos. */
  readonly secret: string;
  readonly expiresAt: Date;
}
