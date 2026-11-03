import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { IssueSession } from "../../../src/modules/auth/application/use-cases/issue-session.use-case.ts";
import { RefreshSession } from "../../../src/modules/auth/application/use-cases/refresh-session.use-case.ts";
import type { RefreshToken } from "../../../src/modules/auth/domain/entities/refresh-token.ts";
import { hashRefreshToken } from "../../../src/modules/auth/domain/services/refresh-token-hash.ts";
import { PrismaRefreshTokenRepository } from "../../../src/modules/auth/infrastructure/database/prisma-refresh-token.repository.ts";
import { User } from "../../../src/modules/users/domain/entities/user.entity.ts";
import { PrismaUserRepository } from "../../../src/modules/users/infrastructure/database/prisma-user.repository.ts";
import { startTestDatabase, type TestDatabase } from "../../helpers/postgres.ts";
import { FakeAccessTokenService } from "../../helpers/session-fakes.ts";

const T0 = new Date("2026-01-01T00:00:00Z");
const T1 = new Date("2026-01-01T00:01:00Z");
const T2 = new Date("2026-01-01T00:02:00Z");

describe("PrismaRefreshTokenRepository (Postgres real)", () => {
  let db: TestDatabase;
  let users: PrismaUserRepository;
  let tokens: PrismaRefreshTokenRepository;
  let user: User;

  beforeAll(async () => {
    db = await startTestDatabase();
    users = new PrismaUserRepository(db.prisma);
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
    await users.add(user);
  });

  const newToken = (overrides: Partial<RefreshToken> = {}): RefreshToken => ({
    tokenHash: hashRefreshToken(randomUUID()),
    familyId: randomUUID(),
    userPublicId: user.publicId,
    expiresAt: new Date(T0.getTime() + 7 * 86_400_000),
    usedAt: null,
    revokedAt: null,
    createdAt: T0,
    ...overrides,
  });

  it("guarda un token y lo recupera con los mismos datos", async () => {
    const token = newToken();
    await tokens.add(token);
    expect(await tokens.findByHash(token.tokenHash)).toEqual(token);
  });

  it("devuelve null para un hash desconocido", async () => {
    expect(await tokens.findByHash(hashRefreshToken("no-existe"))).toBeNull();
  });

  it("no permite un token para un usuario inexistente", async () => {
    await expect(tokens.add(newToken({ userPublicId: randomUUID() }))).rejects.toThrow();
  });

  it("markUsed devuelve true la primera vez y false las siguientes", async () => {
    const token = newToken();
    await tokens.add(token);
    expect(await tokens.markUsed(token.tokenHash, T1)).toBe(true);
    expect(await tokens.markUsed(token.tokenHash, T2)).toBe(false);
    expect((await tokens.findByHash(token.tokenHash))?.usedAt).toEqual(T1);
  });

  it("markUsed devuelve false si el token está revocado", async () => {
    const token = newToken({ revokedAt: T1 });
    await tokens.add(token);
    expect(await tokens.markUsed(token.tokenHash, T2)).toBe(false);
  });

  it("con diez usos simultáneos del mismo token solo uno gana", async () => {
    const token = newToken();
    await tokens.add(token);
    const results = await Promise.all(
      Array.from({ length: 10 }, () => tokens.markUsed(token.tokenHash, T1)),
    );
    expect(results.filter(Boolean)).toHaveLength(1);
  });

  it("revokeFamily revoca solo la familia indicada", async () => {
    const familyId = randomUUID();
    const a = newToken({ familyId });
    const b = newToken({ familyId });
    const other = newToken();
    await Promise.all([tokens.add(a), tokens.add(b), tokens.add(other)]);

    await tokens.revokeFamily(familyId, T1);

    expect((await tokens.findByHash(a.tokenHash))?.revokedAt).toEqual(T1);
    expect((await tokens.findByHash(b.tokenHash))?.revokedAt).toEqual(T1);
    expect((await tokens.findByHash(other.tokenHash))?.revokedAt).toBeNull();
  });

  it("revokeFamily no cambia la fecha de los tokens ya revocados", async () => {
    const token = newToken();
    await tokens.add(token);
    await tokens.revokeFamily(token.familyId, T1);
    await tokens.revokeFamily(token.familyId, T2);
    expect((await tokens.findByHash(token.tokenHash))?.revokedAt).toEqual(T1);
  });

  it("al borrar al usuario se borran sus tokens", async () => {
    const token = newToken();
    await tokens.add(token);
    await db.prisma.user.delete({ where: { publicId: user.publicId } });
    expect(await tokens.findByHash(token.tokenHash)).toBeNull();
  });
});

describe("sesión completa con repositorios reales", () => {
  let db: TestDatabase;
  let users: PrismaUserRepository;
  let tokens: PrismaRefreshTokenRepository;
  let issueSession: IssueSession;
  let refresh: RefreshSession;
  let user: User;

  beforeAll(async () => {
    db = await startTestDatabase();
    users = new PrismaUserRepository(db.prisma);
    tokens = new PrismaRefreshTokenRepository(db.prisma);
    issueSession = new IssueSession({
      tokens,
      accessTokens: new FakeAccessTokenService(),
      refreshTtlSeconds: 3600,
    });
    refresh = new RefreshSession({ tokens, users, issueSession });
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
    await users.add(user);
  });

  it("rota y detecta la reutilización contra la base de datos", async () => {
    const first = await issueSession.execute(user.publicId);
    const second = await refresh.execute(first.refreshToken);
    expect(second.refreshToken).not.toBe(first.refreshToken);

    await expect(refresh.execute(first.refreshToken)).rejects.toMatchObject({
      code: "REFRESH_TOKEN_REUSED",
    });
    await expect(refresh.execute(second.refreshToken)).rejects.toMatchObject({
      code: "INVALID_REFRESH_TOKEN",
    });

    const rows = await db.prisma.refreshToken.findMany();
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.revokedAt !== null)).toBe(true);
  });

  it("con dos renovaciones simultáneas solo una tiene éxito", async () => {
    const session = await issueSession.execute(user.publicId);
    const results = await Promise.allSettled([
      refresh.execute(session.refreshToken),
      refresh.execute(session.refreshToken),
    ]);
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]?.reason).toMatchObject({ code: "REFRESH_TOKEN_REUSED" });
  });
});
