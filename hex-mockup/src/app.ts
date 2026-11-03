import express from "express";
import helmet from "helmet";
import type { ReadinessProbe } from "./modules/health/application/ports/readiness-probe.ts";
import { createHealthRouter } from "./modules/health/presentation/routes/health.routes.ts";

export interface AppDependencies {
  readinessProbes?: readonly ReadinessProbe[];
}

export function createApp(deps: AppDependencies = {}) {
  const app = express();
  app.disable("x-powered-by");
  app.use(helmet());
  app.use(createHealthRouter(deps.readinessProbes ?? []));
  return app;
}
