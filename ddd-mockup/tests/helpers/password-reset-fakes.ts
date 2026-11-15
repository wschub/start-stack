import type {
  PasswordResetMessage,
  PasswordResetNotifier,
} from "../../src/contexts/identity/application/ports/password-reset-notifier.ts";
import { subscribeIdentityEventHandlers } from "../../src/contexts/identity/application/event-handlers/subscribe.ts";
import { PasswordResetRequest } from "../../src/contexts/identity/domain/aggregates/password-reset-request.ts";
import type { RefreshTokenRepository } from "../../src/contexts/identity/domain/repositories/refresh-token.repository.ts";
import {
  type EventBus,
  InProcessEventBus,
  NULL_EVENT_BUS,
} from "../../src/shared/events/event-bus.ts";
import type { PasswordResetRepository } from "../../src/contexts/identity/domain/repositories/password-reset.repository.ts";

export class InMemoryPasswordResetRepository implements PasswordResetRepository {
  private readonly items = new Map<string, PasswordResetRequest>();
  private readonly events: EventBus;

  constructor(events: EventBus = NULL_EVENT_BUS) {
    this.events = events;
  }

  all(): PasswordResetRequest[] {
    return [...this.items.values()];
  }

  async replaceForUser(reset: PasswordResetRequest): Promise<void> {
    for (const [id, item] of this.items) {
      if (item.userPublicId === reset.userPublicId) this.items.delete(id);
    }
    this.items.set(reset.id, reset);
    await this.events.publish(reset.pullEvents());
  }

  async findBySecretHash(secretHash: string): Promise<PasswordResetRequest | null> {
    return this.all().find((item) => item.secretHash === secretHash) ?? null;
  }

  async findForUser(userPublicId: string): Promise<PasswordResetRequest | null> {
    return this.all().find((item) => item.userPublicId === userPublicId) ?? null;
  }

  async registerAttempt(id: string, maxAttempts: number, now: Date): Promise<boolean> {
    const item = this.items.get(id);
    if (!item || item.usedAt || item.attempts >= maxAttempts) return false;
    if (item.expiresAt.getTime() <= now.getTime()) return false;
    this.items.set(
      id,
      PasswordResetRequest.restore({ ...item.toProps(), attempts: item.attempts + 1 }),
    );
    return true;
  }

  async markUsed(id: string, at: Date): Promise<boolean> {
    const item = this.items.get(id);
    if (!item || item.usedAt) return false;
    this.items.set(id, PasswordResetRequest.restore({ ...item.toProps(), usedAt: at }));
    return true;
  }

  async deleteExpired(before: Date): Promise<number> {
    let count = 0;
    for (const [id, item] of this.items) {
      if (item.expiresAt.getTime() < before.getTime()) {
        this.items.delete(id);
        count += 1;
      }
    }
    return count;
  }
}

export class RecordingPasswordResetNotifier implements PasswordResetNotifier {
  readonly sent: PasswordResetMessage[] = [];

  async notify(message: PasswordResetMessage): Promise<void> {
    this.sent.push(message);
  }

  last(): PasswordResetMessage {
    const message = this.sent.at(-1);
    if (!message) throw new Error("no se envió ninguna notificación");
    return message;
  }
}

/** Bus en memoria con los manejadores reales del contexto identity, para probar el flujo completo. */
export function identityEventBus(deps: {
  notifier: PasswordResetNotifier;
  refreshTokens: RefreshTokenRepository;
}): InProcessEventBus {
  const bus = new InProcessEventBus();
  subscribeIdentityEventHandlers(bus, deps);
  return bus;
}
