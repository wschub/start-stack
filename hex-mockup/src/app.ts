import express, { type Router } from "express";
import helmet from "helmet";
import pino, { type Logger } from "pino";
import type { ReadinessProbe } from "./modules/health/application/ports/readiness-probe.ts";
import { createHealthRouter } from "./modules/health/presentation/routes/health.routes.ts";
import { errorHandler, notFoundHandler } from "./shared/http/error-handler.ts";
import { httpLogger } from "./shared/http/http-logger.ts";

export interface AppDependencies {
  readinessProbes?: readonly ReadinessProbe[];
  routers?: readonly Router[];
  logger?: Logger;
}

export function createApp(deps: AppDependencies = {}) {
  const app = express();
  app.disable("x-powered-by");
  app.use(httpLogger(deps.logger ?? pino({ level: "silent" })));
  app.use(helmet());
  app.use(createHealthRouter(deps.readinessProbes ?? []));
  for (const router of deps.routers ?? []) app.use(router);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
