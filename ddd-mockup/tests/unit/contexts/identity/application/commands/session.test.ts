import { describe, expect, it } from "vitest";
import { IssueSession } from "../../../../../../src/contexts/identity/application/commands/issue-session.command.ts";
import { RefreshSession } from "../../../../../../src/contexts/identity/application/commands/refresh-session.command.ts";
import { RevokeSession } from "../../../../../../src/contexts/identity/application/commands/revoke-session.command.ts";
import { hashRefreshToken } from "../../../../../../src/contexts/identity/domain/services/refresh-token-hash.ts";
import { User } from "../../../../../../src/contexts/identity/domain/aggregates/user.ts";
import { InMemoryUserRepository } from "../../../../../helpers/fakes.ts";
import {
  FakeAccessTokenService,
  InMemoryRefreshTokenRepository,
} from "../../../../../helpers/session-fakes.ts";

const REFRESH_TTL = 7 * 24 * 3600;
const T0 = new Date("2026-01-01T00:00:00Z");
const after = (base: Date, seconds: number) => new Date(base.getTime() + seconds * 1000);

async function build() {
  let current = T0;
  let counter = 0;
  const now = () => current;
  const users = new InMemoryUserRepository();
  const tokens = new InMemoryRefreshTokenRepository();
  const issueSession = new IssueSession({
    tokens,
    accessTokens: new FakeAccessTokenService(),
    refreshTtlSeconds: REFRESH_TTL,
    now,
    generateToken: () => `refresh-${++counter}`,
  });
  const refresh = new RefreshSession({ tokens, users, issueSession, now });
  const revoke = new RevokeSession({ tokens, now });
  const user = User.create({
    email: "ana@example.com",
    passwordHash: "hash",
    firstName: "Ana",
    lastName: "Gómez",
  });
  await users.add(user);
  const advance = (seconds: number) => {
    current = after(current, seconds);
  };
  return { users, tokens, issueSession, refresh, revoke, user, advance };
}

describe("IssueSession", () => {
  it("devuelve un access token y un refresh token opaco", async () => {
    const { issueSession, user } = await build();
    const session = await issueSession.execute(user.publicId);
    expect(session.accessToken).toBe(`access:${user.publicId}`);
    expect(session.accessTokenExpiresIn).toBe(3600);
    expect(session.refreshToken).toBe("refresh-1");
    expect(session.refreshTokenExpiresAt).toEqual(after(T0, REFRESH_TTL));
  });

  it("guarda solo el hash del refresh token", async () => {
    const { issueSession, tokens, user } = await build();
    const session = await issueSession.execute(user.publicId);
    const [stored] = tokens.all();
    expect(tokens.all()).toHaveLength(1);
    expect(stored?.tokenHash).toBe(hashRefreshToken(session.refreshToken));
    expect(stored?.tokenHash).not.toBe(session.refreshToken);
    expect(JSON.stringify(tokens.all())).not.toContain(session.refreshToken);
  });

  it("cada sesión nueva tiene su propia familia", async () => {
    const { issueSession, tokens, user } = await build();
    await issueSession.execute(user.publicId);
    await issueSession.execute(user.publicId);
    const [first, second] = tokens.all();
    expect(first?.familyId).not.toBe(second?.familyId);
  });
});

describe("RefreshSession", () => {
  it("rota: emite tokens nuevos en la misma familia y consume el anterior", async () => {
    const { issueSession, refresh, tokens, user, advance } = await build();
    const first = await issueSession.execute(user.publicId);
    advance(60);
    const second = await refresh.execute(first.refreshToken);

    expect(second.refreshToken).toBe("refresh-2");
    expect(second.accessToken).toBe(`access:${user.publicId}`);
    expect(second.refreshTokenExpiresAt).toEqual(after(T0, 60 + REFRESH_TTL));

    const old = tokens.all().find((t) => t.tokenHash === hashRefreshToken("refresh-1"));
    const next = tokens.all().find((t) => t.tokenHash === hashRefreshToken("refresh-2"));
    expect(old?.usedAt).toEqual(after(T0, 60));
    expect(next?.usedAt).toBeNull();
    expect(next?.familyId).toBe(old?.familyId);
  });

  it("rechaza un token desconocido", async () => {
    const { refresh } = await build();
    await expect(refresh.execute("no-existe")).rejects.toMatchObject({
      kind: "unauthenticated",
      code: "INVALID_REFRESH_TOKEN",
    });
  });

  it("rechaza un token expirado", async () => {
    const { issueSession, refresh, user, advance } = await build();
    const session = await issueSession.execute(user.publicId);
    advance(REFRESH_TTL + 1);
    await expect(refresh.execute(session.refreshToken)).rejects.toMatchObject({
      code: "INVALID_REFRESH_TOKEN",
    });
  });

  it("rechaza un token revocado", async () => {
    const { issueSession, refresh, revoke, user } = await build();
    const session = await issueSession.execute(user.publicId);
    await revoke.execute(session.refreshToken);
    await expect(refresh.execute(session.refreshToken)).rejects.toMatchObject({
      code: "INVALID_REFRESH_TOKEN",
    });
  });

  it("detecta la reutilización y revoca toda la familia", async () => {
    const { issueSession, refresh, tokens, user } = await build();
    const first = await issueSession.execute(user.publicId);
    const second = await refresh.execute(first.refreshToken);

    await expect(refresh.execute(first.refreshToken)).rejects.toMatchObject({
      kind: "unauthenticated",
      code: "REFRESH_TOKEN_REUSED",
    });
    expect(tokens.all().every((t) => t.revokedAt !== null)).toBe(true);
    await expect(refresh.execute(second.refreshToken)).rejects.toMatchObject({
      code: "INVALID_REFRESH_TOKEN",
    });
  });

  it("con dos usos simultáneos del mismo token solo uno tiene éxito", async () => {
    const { issueSession, refresh, user } = await build();
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

  it("si el usuario está inactivo, revoca la familia y responde ACCOUNT_INACTIVE", async () => {
    const { issueSession, refresh, tokens, users, user } = await build();
    const session = await issueSession.execute(user.publicId);
    users.byEmail.set(user.email, user.deactivate());
    await expect(refresh.execute(session.refreshToken)).rejects.toMatchObject({
      kind: "forbidden",
      code: "ACCOUNT_INACTIVE",
    });
    expect(tokens.all().every((t) => t.revokedAt !== null)).toBe(true);
  });

  it("si el usuario ya no existe, rechaza el token", async () => {
    const { issueSession, refresh, users, user } = await build();
    const session = await issueSession.execute(user.publicId);
    users.byEmail.clear();
    await expect(refresh.execute(session.refreshToken)).rejects.toMatchObject({
      code: "INVALID_REFRESH_TOKEN",
    });
  });
});

describe("RevokeSession", () => {
  it("revoca toda la familia al cerrar sesión", async () => {
    const { issueSession, refresh, revoke, tokens, user } = await build();
    const first = await issueSession.execute(user.publicId);
    const second = await refresh.execute(first.refreshToken);

    await revoke.execute(second.refreshToken);

    expect(tokens.all().every((t) => t.revokedAt !== null)).toBe(true);
    await expect(refresh.execute(second.refreshToken)).rejects.toMatchObject({
      code: "INVALID_REFRESH_TOKEN",
    });
  });

  it("es idempotente con tokens desconocidos", async () => {
    const { revoke } = await build();
    await expect(revoke.execute("no-existe")).resolves.toBeUndefined();
  });
});
