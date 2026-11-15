import type { UseCase } from "../use-case.ts";
import type { RefreshTokenRepository } from "./ports/refresh-token.repository.ts";

const DEFAULT_RETENTION_SECONDS = 24 * 3600;

export class PurgeExpiredRefreshTokens implements UseCase<void, number> {
  private readonly tokens: RefreshTokenRepository;
  private readonly retentionSeconds: number;
  private readonly now: () => Date;

  constructor(deps: {
    tokens: RefreshTokenRepository;
    retentionSeconds?: number;
    now?: () => Date;
  }) {
    this.tokens = deps.tokens;
    this.retentionSeconds = deps.retentionSeconds ?? DEFAULT_RETENTION_SECONDS;
    this.now = deps.now ?? (() => new Date());
  }

  /**
   * Borra los tokens que expiraron hace más que el periodo de retención. Los usados o revocados
   * que aún no expiraron se conservan: permiten detectar la reutilización de un token robado.
   */
  async execute(): Promise<number> {
    const before = new Date(this.now().getTime() - this.retentionSeconds * 1000);
    return this.tokens.deleteExpired(before);
  }
}
