import express from "express";
import helmet from "helmet";
import { healthRouter } from "./modules/health/presentation/routes/health.routes.ts";

export function createApp() {
  const app = express();
  app.disable("x-powered-by");
  app.use(helmet());
  app.use(healthRouter);
  return app;
}
