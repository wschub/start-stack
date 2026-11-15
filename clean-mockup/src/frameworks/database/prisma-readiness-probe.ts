import type { PrismaClient } from "../../generated/prisma/client.ts";
import type { ReadinessProbe } from "../../use-cases/health/ports/readiness-probe.ts";

export class PrismaReadinessProbe implements ReadinessProbe {
  readonly name = "database";
  private readonly prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  async check(): Promise<void> {
    await this.prisma.$queryRaw`SELECT 1`;
  }
}
