import type { PrismaClient } from "../../../../generated/prisma/client.ts";
import type { PasswordReset, PasswordResetMethod } from "../../domain/entities/password-reset.ts";
import type { PasswordResetRepository } from "../../domain/repositories/password-reset.repository.ts";

interface PasswordResetRow {
  publicId: string;
  method: "LINK" | "CODE";
  secretHash: string;
  attempts: number;
  expiresAt: Date;
  usedAt: Date | null;
  createdAt: Date;
  user: { publicId: string };
}

const USER_PUBLIC_ID = { user: { select: { publicId: true } } } as const;

function toMethod(value: "LINK" | "CODE"): PasswordResetMethod {
  return value === "LINK" ? "link" : "code";
}

function toDomain(row: PasswordResetRow): PasswordReset {
  return {
    id: row.publicId,
    userPublicId: row.user.publicId,
    method: toMethod(row.method),
    secretHash: row.secretHash,
    expiresAt: row.expiresAt,
    usedAt: row.usedAt,
    attempts: row.attempts,
    createdAt: row.createdAt,
  };
}

export class PrismaPasswordResetRepository implements PasswordResetRepository {
  private readonly prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  /** Borrado e inserción en una sola transacción: nunca quedan dos solicitudes vigentes. */
  async replaceForUser(reset: PasswordReset): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.passwordReset.deleteMany({ where: { user: { publicId: reset.userPublicId } } }),
      this.prisma.passwordReset.create({
        data: {
          publicId: reset.id,
          method: reset.method === "link" ? "LINK" : "CODE",
          secretHash: reset.secretHash,
          attempts: reset.attempts,
          expiresAt: reset.expiresAt,
          usedAt: reset.usedAt,
          createdAt: reset.createdAt,
          user: { connect: { publicId: reset.userPublicId } },
        },
      }),
    ]);
  }

  async findBySecretHash(secretHash: string): Promise<PasswordReset | null> {
    const row = await this.prisma.passwordReset.findFirst({
      where: { secretHash },
      include: USER_PUBLIC_ID,
    });
    return row ? toDomain(row) : null;
  }

  async findForUser(userPublicId: string): Promise<PasswordReset | null> {
    const row = await this.prisma.passwordReset.findFirst({
      where: { user: { publicId: userPublicId } },
      orderBy: { createdAt: "desc" },
      include: USER_PUBLIC_ID,
    });
    return row ? toDomain(row) : null;
  }

  /** Un único UPDATE condicionado: Postgres serializa los intentos simultáneos sobre la fila. */
  async registerAttempt(id: string, maxAttempts: number, now: Date): Promise<boolean> {
    const result = await this.prisma.passwordReset.updateMany({
      where: { publicId: id, usedAt: null, attempts: { lt: maxAttempts }, expiresAt: { gt: now } },
      data: { attempts: { increment: 1 } },
    });
    return result.count === 1;
  }

  async markUsed(id: string, at: Date): Promise<boolean> {
    const result = await this.prisma.passwordReset.updateMany({
      where: { publicId: id, usedAt: null },
      data: { usedAt: at },
    });
    return result.count === 1;
  }

  async deleteExpired(before: Date): Promise<number> {
    const result = await this.prisma.passwordReset.deleteMany({
      where: { expiresAt: { lt: before } },
    });
    return result.count;
  }
}
