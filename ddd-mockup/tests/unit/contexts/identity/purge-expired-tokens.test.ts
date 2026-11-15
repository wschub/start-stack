import { describe, expect, it } from "vitest";
import { PurgeExpiredRefreshTokens } from "../../../../src/contexts/identity/application/commands/purge-expired-refresh-tokens.command.ts";
import type { RefreshToken } from "../../../../src/contexts/identity/domain/entities/refresh-token.ts";
import { InMemoryRefreshTokenRepository } from "../../../helpers/session-fakes.ts";

const NOW = new Date("2026-03-10T12:00:00Z");
const hoursFromNow = (hours: number) => new Date(NOW.getTime() + hours * 3_600_000);

function token(
  tokenHash: string,
  expiresAt: Date,
  overrides: Partial<RefreshToken> = {},
): RefreshToken {
  return {
    tokenHash,
    familyId: "family",
    userPublicId: "user",
    expiresAt,
    usedAt: null,
    revokedAt: null,
    createdAt: hoursFromNow(-1000),
    ...overrides,
  };
}

async function seed(...items: RefreshToken[]): Promise<InMemoryRefreshTokenRepository> {
  const repository = new InMemoryRefreshTokenRepository();
  for (const item of items) await repository.add(item);
  return repository;
}

const hashes = (repository: InMemoryRefreshTokenRepository) =>
  repository
    .all()
    .map((item) => item.tokenHash)
    .sort();

describe("PurgeExpiredRefreshTokens", () => {
  it("borra los tokens expirados hace más que la retención y devuelve cuántos", async () => {
    const tokens = await seed(
      token("viejo", hoursFromNow(-48)),
      token("reciente", hoursFromNow(-2)),
      token("vigente", hoursFromNow(5)),
    );
    const purge = new PurgeExpiredRefreshTokens({
      tokens,
      retentionSeconds: 24 * 3600,
      now: () => NOW,
    });
    expect(await purge.execute()).toBe(1);
    expect(hashes(tokens)).toEqual(["reciente", "vigente"]);
  });

  it("usa 24 horas de retención por defecto", async () => {
    const tokens = await seed(
      token("hace-25h", hoursFromNow(-25)),
      token("hace-23h", hoursFromNow(-23)),
    );
    const purge = new PurgeExpiredRefreshTokens({ tokens, now: () => NOW });
    expect(await purge.execute()).toBe(1);
    expect(hashes(tokens)).toEqual(["hace-23h"]);
  });

  it("conserva los usados o revocados que aún no expiraron: sirven para detectar reutilización", async () => {
    const tokens = await seed(
      token("usado", hoursFromNow(5), { usedAt: hoursFromNow(-1) }),
      token("revocado", hoursFromNow(5), { revokedAt: hoursFromNow(-1) }),
    );
    const purge = new PurgeExpiredRefreshTokens({ tokens, now: () => NOW });
    expect(await purge.execute()).toBe(0);
    expect(hashes(tokens)).toEqual(["revocado", "usado"]);
  });

  it("borra también los expirados que estaban usados o revocados", async () => {
    const tokens = await seed(
      token("usado-viejo", hoursFromNow(-100), { usedAt: hoursFromNow(-101) }),
      token("revocado-viejo", hoursFromNow(-100), { revokedAt: hoursFromNow(-101) }),
    );
    const purge = new PurgeExpiredRefreshTokens({ tokens, now: () => NOW });
    expect(await purge.execute()).toBe(2);
    expect(hashes(tokens)).toEqual([]);
  });

  it("devuelve 0 cuando no hay nada que borrar", async () => {
    const tokens = await seed(token("vigente", hoursFromNow(5)));
    const purge = new PurgeExpiredRefreshTokens({ tokens, now: () => NOW });
    expect(await purge.execute()).toBe(0);
  });
});
