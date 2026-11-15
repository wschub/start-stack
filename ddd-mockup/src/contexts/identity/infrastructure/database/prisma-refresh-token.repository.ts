import type { PrismaClient } from "../../../../generated/prisma/client.ts";
import type { RefreshToken } from "../../domain/aggregates/refresh-token.ts";
import type { RefreshTokenRepository } from "../../domain/repositories/refresh-token.repository.ts";

export class PrismaRefreshTokenRepository implements RefreshTokenRepository {
  private readonly prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  async add(token: RefreshToken): Promise<void> {
    await this.prisma.refreshToken.create({
      data: {
        tokenHash: token.tokenHash,
        familyId: token.familyId,
        expiresAt: token.expiresAt,
        usedAt: token.usedAt,
        revokedAt: token.revokedAt,
        createdAt: token.createdAt,
        user: { connect: { publicId: token.userPublicId } },
      },
    });
  }

  async findByHash(tokenHash: string): Promise<RefreshToken | null> {
    const row = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: { select: { publicId: true } } },
    });
    if (!row) return null;
    return {
      tokenHash: row.tokenHash,
      familyId: row.familyId,
      userPublicId: row.user.publicId,
      expiresAt: row.expiresAt,
      usedAt: row.usedAt,
      revokedAt: row.revokedAt,
      createdAt: row.createdAt,
    };
  }

  /** Un único UPDATE condicionado: Postgres serializa los usos simultáneos sobre la fila. */
  async markUsed(tokenHash: string, at: Date): Promise<boolean> {
    const result = await this.prisma.refreshToken.updateMany({
      where: { tokenHash, usedAt: null, revokedAt: null },
      data: { usedAt: at },
    });
    return result.count === 1;
  }

  async revokeFamily(familyId: string, at: Date): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: at },
    });
  }

  async revokeAllForUser(userPublicId: string, at: Date): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { user: { publicId: userPublicId }, revokedAt: null },
      data: { revokedAt: at },
    });
  }

  async deleteExpired(before: Date): Promise<number> {
    const result = await this.prisma.refreshToken.deleteMany({
      where: { expiresAt: { lt: before } },
    });
    return result.count;
  }
}
