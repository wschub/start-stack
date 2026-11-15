import type { Request, RequestHandler } from "express";
import { rateLimit } from "express-rate-limit";
import { AppError } from "../../entities/errors/app-error.ts";

export interface RateLimitRule {
  windowMs: number;
  max: number;
}

export interface RateLimiterOptions {
  /** Cuenta solo las peticiones que terminan con un error (status 400 o más). */
  onlyFailures?: boolean;
  /** Clave propia en vez de la IP. Si devuelve undefined, la petición no se cuenta. */
  key?: (req: Request) => string | undefined;
}

/**
 * Límite de peticiones en memoria. Al superarlo responde 429 con Retry-After.
 * El contador vive en el proceso: con varias instancias haría falta un almacén compartido.
 */
export function createRateLimiter(
  rule: RateLimitRule,
  options: RateLimiterOptions = {},
): RequestHandler {
  const { key } = options;
  return rateLimit({
    windowMs: rule.windowMs,
    limit: rule.max,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    skipSuccessfulRequests: options.onlyFailures ?? false,
    ...(key
      ? {
          keyGenerator: (req: Request) => key(req) ?? "",
          skip: (req: Request) => key(req) === undefined,
        }
      : {}),
    handler: (_req, _res, next) => {
      next(new AppError("too_many_requests"));
    },
  });
}
