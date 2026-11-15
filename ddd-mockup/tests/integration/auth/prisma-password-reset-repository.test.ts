import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  PasswordResetRequest,
  type PasswordResetRequestProps,
} from "../../../src/contexts/identity/domain/aggregates/password-reset-request.ts";
import { PrismaPasswordResetRepository } from "../../../src/contexts/identity/infrastructure/database/prisma-password-reset.repository.ts";
import { User } from "../../../src/contexts/identity/domain/aggregates/user.ts";
import { PrismaUserRepository } from "../../../src/contexts/identity/infrastructure/database/prisma-user.repository.ts";
import { startTestDatabase, type TestDatabase } from "../../helpers/postgres.ts";

const NOW = new Date("2026-11-15T10:00:00Z");
const LATER = new Date("2026-11-15T10:30:00Z");

describe("PrismaPasswordResetRepository (Postgres real)", () => {
  let db: TestDatabase;
  let repository: PrismaPasswordResetRepository;
  let users: PrismaUserRepository;
  let ana: User;
  let luis: User;

  const newUser = (email: string) =>
    User.create({ email, passwordHash: "hash", firstName: "Ana", lastName: "Gómez" });

  const newReset = (overrides: Partial<PasswordResetRequestProps> = {}): PasswordResetRequest =>
    PasswordResetRequest.restore({
      id: randomUUID(),
      userPublicId: ana.publicId,
      method: "link",
      secretHash: randomUUID(),
      expiresAt: LATER,
      usedAt: null,
      attempts: 0,
      createdAt: NOW,
      ...overrides,
    });

  beforeAll(async () => {
    db = await startTestDatabase();
    repository = new PrismaPasswordResetRepository(db.prisma);
    users = new PrismaUserRepository(db.prisma);
  });

  afterAll(async () => {
    await db?.stop();
  });

  beforeEach(async () => {
    await db.prisma.user.deleteMany();
    ana = newUser("ana@example.com");
    luis = newUser("luis@example.com");
    await users.add(ana);
    await users.add(luis);
  });

  it("guarda una solicitud y la recupera por el hash con los mismos datos", async () => {
    const reset = newReset({ method: "code" });
    await repository.replaceForUser(reset);

    expect(await repository.findBySecretHash(reset.secretHash)).toEqual(reset);
    expect(await repository.findForUser(ana.publicId)).toEqual(reset);
    expect(await repository.findBySecretHash("otro-hash")).toBeNull();
    expect(await repository.findForUser(luis.publicId)).toBeNull();
  });

  it("una solicitud nueva sustituye a la anterior del mismo usuario y no toca las de otros", async () => {
    const first = newReset();
    const other = newReset({ userPublicId: luis.publicId });
    await repository.replaceForUser(first);
    await repository.replaceForUser(other);

    const second = newReset({ method: "code" });
    await repository.replaceForUser(second);

    expect(await repository.findBySecretHash(first.secretHash)).toBeNull();
    expect((await repository.findForUser(ana.publicId))?.id).toBe(second.id);
    expect((await repository.findForUser(luis.publicId))?.id).toBe(other.id);
    expect(await db.prisma.passwordReset.count()).toBe(2);
  });

  it("registerAttempt suma intentos hasta el máximo y luego se niega", async () => {
    const reset = newReset({ method: "code" });
    await repository.replaceForUser(reset);

    expect(await repository.registerAttempt(reset.id, 2, NOW)).toBe(true);
    expect(await repository.registerAttempt(reset.id, 2, NOW)).toBe(true);
    expect(await repository.registerAttempt(reset.id, 2, NOW)).toBe(false);
    expect((await repository.findForUser(ana.publicId))?.attempts).toBe(2);
  });

  it("con 20 intentos simultáneos solo pasan los permitidos", async () => {
    const reset = newReset({ method: "code" });
    await repository.replaceForUser(reset);

    const results = await Promise.all(
      Array.from({ length: 20 }, () => repository.registerAttempt(reset.id, 5, NOW)),
    );

    expect(results.filter(Boolean)).toHaveLength(5);
    expect((await repository.findForUser(ana.publicId))?.attempts).toBe(5);
  });

  it("registerAttempt se niega si la solicitud expiró o ya se usó", async () => {
    const expired = newReset();
    await repository.replaceForUser(expired);
    expect(await repository.registerAttempt(expired.id, 5, LATER)).toBe(false);

    const used = newReset({ userPublicId: luis.publicId });
    await repository.replaceForUser(used);
    await repository.markUsed(used.id, NOW);
    expect(await repository.registerAttempt(used.id, 5, NOW)).toBe(false);
  });

  it("markUsed solo deja ganar a uno entre 10 usos simultáneos", async () => {
    const reset = newReset();
    await repository.replaceForUser(reset);

    const results = await Promise.all(
      Array.from({ length: 10 }, () => repository.markUsed(reset.id, NOW)),
    );

    expect(results.filter(Boolean)).toHaveLength(1);
    expect((await repository.findForUser(ana.publicId))?.usedAt).toEqual(NOW);
  });

  it("deleteExpired borra solo las que expiraron antes de la fecha", async () => {
    await repository.replaceForUser(newReset({ expiresAt: NOW }));
    await repository.replaceForUser(newReset({ userPublicId: luis.publicId, expiresAt: LATER }));

    expect(await repository.deleteExpired(LATER)).toBe(1);
    expect(await repository.findForUser(ana.publicId)).toBeNull();
    expect(await repository.findForUser(luis.publicId)).not.toBeNull();
  });

  it("al borrar el usuario se borran sus solicitudes", async () => {
    await repository.replaceForUser(newReset());

    await db.prisma.user.delete({ where: { publicId: ana.publicId } });

    expect(await db.prisma.passwordReset.count()).toBe(0);
  });
});
