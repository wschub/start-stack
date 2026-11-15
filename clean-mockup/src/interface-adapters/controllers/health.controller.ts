import type { LivenessResult } from "../../use-cases/health/check-liveness.use-case.ts";
import type { ReadinessResult } from "../../use-cases/health/check-readiness.use-case.ts";
import type { Controller } from "../http/http.ts";

export interface HealthControllerDeps {
  checkLiveness: () => LivenessResult;
  checkReadiness: () => Promise<ReadinessResult>;
}

const NO_STORE = { "Cache-Control": "no-store" };

export function createHealthController(deps: HealthControllerDeps) {
  const liveness: Controller = async () => ({
    status: 200,
    body: deps.checkLiveness(),
    headers: NO_STORE,
  });

  const readiness: Controller = async () => {
    const result = await deps.checkReadiness();
    return { status: result.status === "ready" ? 200 : 503, body: result, headers: NO_STORE };
  };

  return { liveness, readiness };
}
