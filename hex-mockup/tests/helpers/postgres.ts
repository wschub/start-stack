import { PrismaPg } from "@prisma/adapter-pg";
import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { execSync } from "node:child_process";
import { PrismaClient } from "../../src/generated/prisma/client.ts";

export interface TestDatabase {
  prisma: PrismaClient;
  stop(): Promise<void>;
}

export async function startTestDatabase(): Promise<TestDatabase> {
  const container = await new PostgreSqlContainer("postgres:17-alpine").start();
  const url = container.getConnectionUri();
  execSync("npx prisma migrate deploy", {
    env: { ...process.env, DATABASE_URL: url },
    stdio: "pipe",
  });
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  return {
    prisma,
    stop: async () => {
      await prisma.$disconnect();
      await container.stop();
    },
  };
}
