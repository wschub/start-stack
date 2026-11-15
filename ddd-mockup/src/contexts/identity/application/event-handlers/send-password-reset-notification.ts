import type { EventHandler } from "../../../../shared/events/event-bus.ts";
import type { PasswordResetRequested } from "../../domain/events/password-reset-requested.ts";
import type { PasswordResetNotifier } from "../ports/password-reset-notifier.ts";

/** Cuando se solicita recuperar la contraseña, hace llegar al usuario el enlace o el código. */
export function sendPasswordResetNotification(deps: {
  notifier: PasswordResetNotifier;
}): EventHandler<PasswordResetRequested> {
  return async (event) => {
    await deps.notifier.notify({
      email: event.email,
      firstName: event.firstName,
      locale: event.locale,
      method: event.method,
      secret: event.secret,
      expiresAt: event.expiresAt,
    });
  };
}
