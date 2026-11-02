import type { Request, Response } from "express";
import { checkLiveness } from "../../application/use-cases/check-liveness.use-case.ts";

export function liveness(_req: Request, res: Response): void {
  res.set("Cache-Control", "no-store").json(checkLiveness());
}
