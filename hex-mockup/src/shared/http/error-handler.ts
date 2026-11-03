import type { NextFunction, Request, Response } from "express";
import { AppError } from "../errors/app-error.ts";
import { negotiateLocale } from "../i18n/locale.ts";
import { normalizeError } from "./normalize-error.ts";
import { toProblem } from "./problem.ts";

export function notFoundHandler(_req: Request, _res: Response, next: NextFunction): void {
  next(new AppError("not_found"));
}

export function errorHandler(
  error: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const locale = negotiateLocale(req.get("accept-language"));
  const { status, body } = toProblem(normalizeError(error), locale);
  if (status >= 500) req.log.error({ err: error }, "unhandled error");
  res.status(status).set("Cache-Control", "no-store").type("application/problem+json").json(body);
}
