import { Router } from "express";
import type { ReadinessProbe } from "../../application/ports/readiness-probe.ts";
import { liveness, readiness } from "../controllers/health.controller.ts";

export function createHealthRouter(probes: readonly ReadinessProbe[] = []): Router {
  const router = Router();
  router.get("/health", liveness);
  router.get("/health/ready", readiness(probes));
  return router;
}
