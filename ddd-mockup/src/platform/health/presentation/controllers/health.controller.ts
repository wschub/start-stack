import type { Request, Response } from "express";
import type { ReadinessProbe } from "../../application/ports/readiness-probe.ts";
import { checkLiveness } from "../../application/use-cases/check-liveness.use-case.ts";
import { checkReadiness } from "../../application/use-cases/check-readiness.use-case.ts";

export function liveness(_req: Request, res: Response): void {
  res.set("Cache-Control", "no-store").json(checkLiveness());
}

export function readiness(probes: readonly ReadinessProbe[]) {
  return async (_req: Request, res: Response): Promise<void> => {
    const result = await checkReadiness(probes);
    res
      .set("Cache-Control", "no-store")
      .status(result.status === "ready" ? 200 : 503)
      .json(result);
  };
}
