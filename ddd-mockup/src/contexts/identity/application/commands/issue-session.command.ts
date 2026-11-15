import { randomBytes, randomUUID } from "node:crypto";
import { hashRefreshToken } from "../../domain/services/refresh-token-hash.ts";
import type { RefreshTokenRepository } from "../../domain/repositories/refresh-token.repository.ts";
import type { AccessTokenService } from "../ports/access-token-service.ts";

export interface SessionTokens {
  accessToken: string;
  accessTokenExpiresIn: number;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
}

export interface IssueSessionDeps {
  tokens: RefreshTokenRepository;
  accessTokens: AccessTokenService;
  refreshTtlSeconds: number;
  now?: () => Date;
  generateToken?: () => string;
}

export class IssueSession {
  private readonly tokens: RefreshTokenRepository;
  private readonly accessTokens: AccessTokenService;
  private readonly refreshTtlSeconds: number;
  private readonly now: () => Date;
  private readonly generateToken: () => string;

  constructor(deps: IssueSessionDeps) {
    this.tokens = deps.tokens;
    this.accessTokens = deps.accessTokens;
    this.refreshTtlSeconds = deps.refreshTtlSeconds;
    this.now = deps.now ?? (() => new Date());
    this.generateToken = deps.generateToken ?? (() => randomBytes(32).toString("base64url"));
  }

  async execute(userPublicId: string, familyId: string = randomUUID()): Promise<SessionTokens> {
    const now = this.now();
    const refreshToken = this.generateToken();
    const expiresAt = new Date(now.getTime() + this.refreshTtlSeconds * 1000);

    await this.tokens.add({
      tokenHash: hashRefreshToken(refreshToken),
      familyId,
      userPublicId,
      expiresAt,
      usedAt: null,
      revokedAt: null,
      createdAt: now,
    });
    const access = await this.accessTokens.issue(userPublicId);

    return {
      accessToken: access.token,
      accessTokenExpiresIn: access.expiresInSeconds,
      refreshToken,
      refreshTokenExpiresAt: expiresAt,
    };
  }
}
