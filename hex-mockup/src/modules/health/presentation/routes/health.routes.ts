import { Router } from "express";
import { liveness } from "../controllers/health.controller.ts";

export const healthRouter = Router();
healthRouter.get("/health", liveness);
