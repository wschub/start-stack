import { PrismaPg } from "@prisma/adapter-pg";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "../../../src/generated/prisma/client.ts";
import { PrismaReadinessProbe } from "../../../src/platform/health/infrastructure/database/prisma-readiness-probe.ts";

describe("PrismaReadinessProbe (Postgres real)", () => {
  let container: StartedPostgreSqlContainer;
  let prisma: PrismaClient;

  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:17-alpine").start();
    prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: container.getConnectionUri() }),
    });
  });

  afterAll(async () => {
    await prisma?.$disconnect();
    await container?.stop();
  });

  it("se llama database y no lanza cuando la base de datos responde", async () => {
    const probe = new PrismaReadinessProbe(prisma);
    expect(probe.name).toBe("database");
    await expect(probe.check()).resolves.toBeUndefined();
  });

  it("lanza cuando no se puede conectar", async () => {
    const unreachable = new PrismaClient({
      adapter: new PrismaPg({
        connectionString: "postgresql://x:x@127.0.0.1:1/x",
        connectionTimeoutMillis: 1000,
      }),
    });
    try {
      await expect(new PrismaReadinessProbe(unreachable).check()).rejects.toThrow();
    } finally {
      await unreachable.$disconnect();
    }
  });
});
