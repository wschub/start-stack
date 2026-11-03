import { AppError } from "../../../../shared/errors/app-error.ts";
import type { UserRepository } from "../../../users/domain/repositories/user.repository.ts";
import type { RefreshTokenRepository } from "../../domain/repositories/refresh-token.repository.ts";
import { hashRefreshToken } from "../../domain/services/refresh-token-hash.ts";
import type { IssueSession, SessionTokens } from "./issue-session.use-case.ts";

const invalidToken = () => new AppError("unauthenticated", { code: "INVALID_REFRESH_TOKEN" });
const reusedToken = () => new AppError("unauthenticated", { code: "REFRESH_TOKEN_REUSED" });

export class RefreshSession {
  private readonly tokens: RefreshTokenRepository;
  private readonly users: UserRepository;
  private readonly issueSession: IssueSession;
  private readonly now: () => Date;

  constructor(deps: {
    tokens: RefreshTokenRepository;
    users: UserRepository;
    issueSession: IssueSession;
    now?: () => Date;
  }) {
    this.tokens = deps.tokens;
    this.users = deps.users;
    this.issueSession = deps.issueSession;
    this.now = deps.now ?? (() => new Date());
  }

  async execute(refreshToken: string): Promise<SessionTokens> {
    const now = this.now();
    const stored = await this.tokens.findByHash(hashRefreshToken(refreshToken));

    if (!stored || stored.revokedAt) throw invalidToken();

    if (stored.usedAt) {
      await this.tokens.revokeFamily(stored.familyId, now);
      throw reusedToken();
    }
    if (stored.expiresAt.getTime() <= now.getTime()) throw invalidToken();

    const user = await this.users.findByPublicId(stored.userPublicId);
    if (!user) {
      await this.tokens.revokeFamily(stored.familyId, now);
      throw invalidToken();
    }
    if (!user.isActive()) {
      await this.tokens.revokeFamily(stored.familyId, now);
      throw new AppError("forbidden", { code: "ACCOUNT_INACTIVE" });
    }

    const consumed = await this.tokens.markUsed(stored.tokenHash, now);
    if (!consumed) {
      await this.tokens.revokeFamily(stored.familyId, now);
      throw reusedToken();
    }

    return this.issueSession.execute(user.publicId, stored.familyId);
  }
}
