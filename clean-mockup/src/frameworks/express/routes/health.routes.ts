import { Router } from "express";
import { createHealthController } from "../../../interface-adapters/controllers/health.controller.ts";
import { checkLiveness } from "../../../use-cases/health/check-liveness.use-case.ts";
import { checkReadiness } from "../../../use-cases/health/check-readiness.use-case.ts";
import type { ReadinessProbe } from "../../../use-cases/health/ports/readiness-probe.ts";
import { adapt } from "../adapt.ts";

export function createHealthRouter(probes: readonly ReadinessProbe[] = []): Router {
  const router = Router();
  const controller = createHealthController({
    checkLiveness: () => checkLiveness(),
    checkReadiness: () => checkReadiness(probes),
  });
  router.get("/health", adapt(controller.liveness));
  router.get("/health/ready", adapt(controller.readiness));
  return router;
}
