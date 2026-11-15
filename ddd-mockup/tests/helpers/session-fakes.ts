import type {
  AccessToken,
  AccessTokenService,
} from "../../src/contexts/identity/application/ports/access-token-service.ts";
import type { RefreshToken } from "../../src/contexts/identity/domain/aggregates/refresh-token.ts";
import type { RefreshTokenRepository } from "../../src/contexts/identity/domain/repositories/refresh-token.repository.ts";

export class InMemoryRefreshTokenRepository implements RefreshTokenRepository {
  private readonly items = new Map<string, RefreshToken>();

  all(): RefreshToken[] {
    return [...this.items.values()];
  }

  async add(token: RefreshToken): Promise<void> {
    this.items.set(token.tokenHash, token);
  }

  async findByHash(tokenHash: string): Promise<RefreshToken | null> {
    return this.items.get(tokenHash) ?? null;
  }

  async markUsed(tokenHash: string, at: Date): Promise<boolean> {
    const token = this.items.get(tokenHash);
    if (!token || token.usedAt || token.revokedAt) return false;
    this.items.set(tokenHash, { ...token, usedAt: at });
    return true;
  }

  async revokeFamily(familyId: string, at: Date): Promise<void> {
    for (const [hash, token] of this.items) {
      if (token.familyId === familyId && !token.revokedAt) {
        this.items.set(hash, { ...token, revokedAt: at });
      }
    }
  }

  async revokeAllForUser(userPublicId: string, at: Date): Promise<void> {
    for (const [hash, token] of this.items) {
      if (token.userPublicId === userPublicId && !token.revokedAt) {
        this.items.set(hash, { ...token, revokedAt: at });
      }
    }
  }

  async deleteExpired(before: Date): Promise<number> {
    let count = 0;
    for (const [hash, token] of this.items) {
      if (token.expiresAt.getTime() < before.getTime()) {
        this.items.delete(hash);
        count += 1;
      }
    }
    return count;
  }
}

export class FakeAccessTokenService implements AccessTokenService {
  async issue(subject: string): Promise<AccessToken> {
    return { token: `access:${subject}`, expiresInSeconds: 3600 };
  }

  async verify(token: string): Promise<{ subject: string }> {
    return { subject: token.replace("access:", "") };
  }
}
