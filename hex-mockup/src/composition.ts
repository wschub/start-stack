import { PrismaPg } from "@prisma/adapter-pg";
import { createApp } from "./app.ts";
import { PrismaClient } from "./generated/prisma/client.ts";
import { PrismaReadinessProbe } from "./modules/health/infrastructure/database/prisma-readiness-probe.ts";

export function composeApp(databaseUrl: string) {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: databaseUrl }),
  });
  const app = createApp({ readinessProbes: [new PrismaReadinessProbe(prisma)] });
  return { app, shutdown: () => prisma.$disconnect() };
}
