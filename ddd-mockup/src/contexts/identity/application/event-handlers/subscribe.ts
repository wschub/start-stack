import type { InProcessEventBus } from "../../../../shared/events/event-bus.ts";
import type { PasswordResetRequested } from "../../domain/events/password-reset-requested.ts";
import type { UserPasswordChanged } from "../../domain/events/user-events.ts";
import type { RefreshTokenRepository } from "../../domain/repositories/refresh-token.repository.ts";
import type { PasswordResetNotifier } from "../ports/password-reset-notifier.ts";
import { revokeSessionsOnPasswordChange } from "./revoke-sessions-on-password-change.ts";
import { sendPasswordResetNotification } from "./send-password-reset-notification.ts";

export interface IdentityEventHandlerDeps {
  notifier: PasswordResetNotifier;
  refreshTokens: RefreshTokenRepository;
}

/**
 * Único lugar donde se ve qué reacciona a cada evento del contexto identity. Para reaccionar a
 * un evento nuevo (por ejemplo, un correo de bienvenida con `user.registered`), añade aquí una
 * línea: el agregado y los comandos no cambian.
 */
export function subscribeIdentityEventHandlers(
  bus: InProcessEventBus,
  deps: IdentityEventHandlerDeps,
): void {
  bus.subscribe<PasswordResetRequested>(
    "password_reset.requested",
    sendPasswordResetNotification(deps),
  );
  bus.subscribe<UserPasswordChanged>("user.password_changed", revokeSessionsOnPasswordChange(deps));
}
