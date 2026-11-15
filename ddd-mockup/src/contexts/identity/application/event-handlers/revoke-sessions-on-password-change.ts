import type { EventHandler } from "../../../../shared/events/event-bus.ts";
import type { UserPasswordChanged } from "../../domain/events/user-events.ts";
import type { RefreshTokenRepository } from "../../domain/repositories/refresh-token.repository.ts";

/**
 * Cuando cambia la contraseña se cierran todas las sesiones del usuario: quien la recupera
 * puede haber perdido la cuenta, y un token robado no debe sobrevivir al cambio.
 */
export function revokeSessionsOnPasswordChange(deps: {
  refreshTokens: RefreshTokenRepository;
}): EventHandler<UserPasswordChanged> {
  return async (event) => {
    await deps.refreshTokens.revokeAllForUser(event.userId, event.occurredAt);
  };
}
