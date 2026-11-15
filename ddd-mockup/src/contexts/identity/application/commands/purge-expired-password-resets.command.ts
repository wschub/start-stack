import type { PasswordResetRepository } from "../../domain/repositories/password-reset.repository.ts";

export class PurgeExpiredPasswordResets {
  private readonly resets: PasswordResetRepository;
  private readonly now: () => Date;

  constructor(deps: { resets: PasswordResetRepository; now?: () => Date }) {
    this.resets = deps.resets;
    this.now = deps.now ?? (() => new Date());
  }

  /** Borra las solicitudes de recuperación ya expiradas y devuelve cuántas eran. */
  async execute(): Promise<number> {
    return this.resets.deleteExpired(this.now());
  }
}
