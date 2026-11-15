import type {
  PasswordResetMessage,
  PasswordResetNotifier,
} from "../../src/modules/auth/application/ports/password-reset-notifier.ts";
import type { PasswordReset } from "../../src/modules/auth/domain/entities/password-reset.ts";
import type { PasswordResetRepository } from "../../src/modules/auth/domain/repositories/password-reset.repository.ts";

export class InMemoryPasswordResetRepository implements PasswordResetRepository {
  private readonly items = new Map<string, PasswordReset>();

  all(): PasswordReset[] {
    return [...this.items.values()];
  }

  async replaceForUser(reset: PasswordReset): Promise<void> {
    for (const [id, item] of this.items) {
      if (item.userPublicId === reset.userPublicId) this.items.delete(id);
    }
    this.items.set(reset.id, reset);
  }

  async findBySecretHash(secretHash: string): Promise<PasswordReset | null> {
    return this.all().find((item) => item.secretHash === secretHash) ?? null;
  }

  async findForUser(userPublicId: string): Promise<PasswordReset | null> {
    return this.all().find((item) => item.userPublicId === userPublicId) ?? null;
  }

  async registerAttempt(id: string, maxAttempts: number, now: Date): Promise<boolean> {
    const item = this.items.get(id);
    if (!item || item.usedAt || item.attempts >= maxAttempts) return false;
    if (item.expiresAt.getTime() <= now.getTime()) return false;
    this.items.set(id, { ...item, attempts: item.attempts + 1 });
    return true;
  }

  async markUsed(id: string, at: Date): Promise<boolean> {
    const item = this.items.get(id);
    if (!item || item.usedAt) return false;
    this.items.set(id, { ...item, usedAt: at });
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
