import type { UseCase } from "../use-case.ts";
import type { RefreshTokenRepository } from "./ports/refresh-token.repository.ts";
import { hashRefreshToken } from "../../entities/rules/refresh-token-hash.ts";

export class RevokeSession implements UseCase<string, void> {
  private readonly tokens: RefreshTokenRepository;
  private readonly now: () => Date;

  constructor(deps: { tokens: RefreshTokenRepository; now?: () => Date }) {
    this.tokens = deps.tokens;
    this.now = deps.now ?? (() => new Date());
  }

  /** Idempotente: cerrar una sesión que no existe no es un error ni revela nada. */
  async execute(refreshToken: string): Promise<void> {
    const stored = await this.tokens.findByHash(hashRefreshToken(refreshToken));
    if (stored) await this.tokens.revokeFamily(stored.familyId, this.now());
  }
}
