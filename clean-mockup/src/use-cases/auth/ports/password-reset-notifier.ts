import type { Locale } from "../../../entities/locale.ts";
import type { PasswordResetMethod } from "../../../entities/password-reset.ts";

export interface PasswordResetMessage {
  email: string;
  firstName: string;
  locale: Locale;
  method: PasswordResetMethod;
  /** Token del enlace o código, en claro. Solo debe llegar al dueño de la cuenta. */
  secret: string;
  expiresAt: Date;
}

/** Hace llegar al usuario el enlace o el código de recuperación (correo, SMS…). */
export interface PasswordResetNotifier {
  notify(message: PasswordResetMessage): Promise<void>;
}
