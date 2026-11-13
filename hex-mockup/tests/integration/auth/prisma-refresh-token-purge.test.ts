import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { RefreshToken } from "../../../src/modules/auth/domain/entities/refresh-token.ts";
import { hashRefreshToken } from "../../../src/modules/auth/domain/services/refresh-token-hash.ts";
import { PrismaRefreshTokenRepository } from "../../../src/modules/auth/infrastructure/database/prisma-refresh-token.repository.ts";
import { User } from "../../../src/modules/users/domain/entities/user.entity.ts";
import { PrismaUserRepository } from "../../../src/modules/users/infrastructure/database/prisma-user.repository.ts";
import { startTestDatabase, type TestDatabase } from "../../helpers/postgres.ts";

const NOW = new Date("2026-03-10T12:00:00Z");
const daysFromNow = (days: number) => new Date(NOW.getTime() + days * 86_400_000);

describe("PrismaRefreshTokenRepository.deleteExpired (Postgres real)", () => {
  let db: TestDatabase;
  let tokens: PrismaRefreshTokenRepository;
  let user: User;

  beforeAll(async () => {
    db = await startTestDatabase();
    tokens = new PrismaRefreshTokenRepository(db.prisma);
  });

  afterAll(async () => {
    await db?.stop();
  });

  beforeEach(async () => {
    await db.prisma.refreshToken.deleteMany();
    await db.prisma.user.deleteMany();
    user = User.create({
      email: "ana@example.com",
      passwordHash: "hash",
      firstName: "Ana",
      lastName: "Gómez",
    });
    await new PrismaUserRepository(db.prisma).add(user);
  });

  const newToken = (expiresAt: Date, overrides: Partial<RefreshToken> = {}): RefreshToken => ({
    tokenHash: hashRefreshToken(randomUUID()),
    familyId: randomUUID(),
    userPublicId: user.publicId,
    expiresAt,
    usedAt: null,
    revokedAt: null,
    createdAt: daysFromNow(-10),
    ...overrides,
  });

  const remaining = async () => (await db.prisma.refreshToken.findMany()).length;

  it("borra solo los tokens que expiraron antes de la fecha dada y devuelve cuántos", async () => {
    const old = newToken(daysFromNow(-2));
    const boundary = newToken(NOW);
    const valid = newToken(daysFromNow(1));
    for (const token of [old, boundary, valid]) await tokens.add(token);

    expect(await tokens.deleteExpired(NOW)).toBe(1);
    expect(await tokens.findByHash(old.tokenHash)).toBeNull();
    expect(await tokens.findByHash(boundary.tokenHash)).not.toBeNull();
    expect(await tokens.findByHash(valid.tokenHash)).not.toBeNull();
  });

  it("no borra los usados o revocados que aún no expiraron", async () => {
    await tokens.add(newToken(daysFromNow(1), { usedAt: daysFromNow(-1) }));
    await tokens.add(newToken(daysFromNow(1), { revokedAt: daysFromNow(-1) }));
    expect(await tokens.deleteExpired(NOW)).toBe(0);
    expect(await remaining()).toBe(2);
  });

  it("borra los expirados aunque estén usados o revocados", async () => {
    await tokens.add(newToken(daysFromNow(-3), { usedAt: daysFromNow(-4) }));
    await tokens.add(newToken(daysFromNow(-3), { revokedAt: daysFromNow(-4) }));
    expect(await tokens.deleteExpired(NOW)).toBe(2);
    expect(await remaining()).toBe(0);
  });

  it("devuelve 0 si no hay nada que borrar", async () => {
    await tokens.add(newToken(daysFromNow(1)));
    expect(await tokens.deleteExpired(NOW)).toBe(0);
    expect(await remaining()).toBe(1);
  });
});
