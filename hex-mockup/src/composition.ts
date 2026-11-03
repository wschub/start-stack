import { PrismaPg } from "@prisma/adapter-pg";
import pino from "pino";
import { createApp } from "./app.ts";
import type { Env } from "./config/env.ts";
import { PrismaClient } from "./generated/prisma/client.ts";
import { PrismaReadinessProbe } from "./modules/health/infrastructure/database/prisma-readiness-probe.ts";

export function composeApp(env: Env) {
  const logger = pino({ level: env.LOG_LEVEL });
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: env.DATABASE_URL }),
  });
  const app = createApp({ readinessProbes: [new PrismaReadinessProbe(prisma)], logger });
  return { app, logger, shutdown: () => prisma.$disconnect() };
}
