import cors from "cors";
import express, { type Router } from "express";
import helmet from "helmet";
import pino, { type Logger } from "pino";
import type { ReadinessProbe } from "./platform/health/application/ports/readiness-probe.ts";
import { createHealthRouter } from "./platform/health/presentation/routes/health.routes.ts";
import { errorHandler, notFoundHandler } from "./shared/http/error-handler.ts";
import { httpLogger } from "./shared/http/http-logger.ts";

export interface AppDependencies {
  readinessProbes?: readonly ReadinessProbe[];
  routers?: readonly Router[];
  logger?: Logger;
  /** Orígenes del front que pueden llamar a la API desde un navegador. Vacío = CORS desactivado. */
  corsOrigins?: readonly string[];
  /** Número de proxies de confianza delante de la API (0 = ninguno). Define qué IP ve req.ip. */
  trustProxy?: number;
}

export function createApp(deps: AppDependencies = {}) {
  const app = express();
  app.disable("x-powered-by");
  app.disable("etag");
  if (deps.trustProxy) app.set("trust proxy", deps.trustProxy);
  app.use(httpLogger(deps.logger ?? pino({ level: "silent" })));
  app.use(
    helmet({
      // Es una API JSON: no sirve páginas, así que se prohíbe cargar o incrustar cualquier cosa.
      contentSecurityPolicy: {
        useDefaults: false,
        directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] },
      },
      frameguard: { action: "deny" },
    }),
  );
  // Por defecto nada se cachea; una ruta que lo necesite puede cambiar la cabecera.
  app.use((_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  });
  if (deps.corsOrigins && deps.corsOrigins.length > 0) {
    app.use(
      cors({
        origin: [...deps.corsOrigins],
        credentials: true,
        methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allowedHeaders: [
          "Authorization",
          "Content-Type",
          "Accept-Language",
          "X-CSRF-Protection",
          "X-Request-Id",
        ],
        exposedHeaders: ["X-Request-Id"],
        maxAge: 600,
      }),
    );
  }
  app.use(createHealthRouter(deps.readinessProbes ?? []));
  app.use(express.json({ limit: "16kb" }));
  for (const router of deps.routers ?? []) app.use(router);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
