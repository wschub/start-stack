import { describe, expect, it } from "vitest";
import { createHealthController } from "../../../../src/interface-adapters/controllers/health.controller.ts";
import type { ReadinessResult } from "../../../../src/use-cases/health/check-readiness.use-case.ts";
import { httpRequest } from "../../../helpers/http-request.ts";

const LIVE = { status: "ok", uptime: 12, timestamp: "2026-11-15T10:00:00.000Z" } as const;
const controllerWith = (readiness: ReadinessResult) =>
  createHealthController({ checkLiveness: () => LIVE, checkReadiness: async () => readiness });

describe("controlador de salud", () => {
  it("liveness responde 200 y pide que no se guarde en caché", async () => {
    const response = await controllerWith({ status: "ready", checks: [] }).liveness(httpRequest());

    expect(response).toEqual({
      status: 200,
      body: LIVE,
      headers: { "Cache-Control": "no-store" },
    });
  });

  it("readiness responde 200 cuando todo está disponible", async () => {
    const ready: ReadinessResult = {
      status: "ready",
      checks: [{ name: "database", status: "up" }],
    };

    expect(await controllerWith(ready).readiness(httpRequest())).toEqual({
      status: 200,
      body: ready,
      headers: { "Cache-Control": "no-store" },
    });
  });

  it("readiness responde 503 con el detalle cuando algo falla", async () => {
    const notReady: ReadinessResult = {
      status: "not_ready",
      checks: [{ name: "database", status: "down" }],
    };

    expect(await controllerWith(notReady).readiness(httpRequest())).toMatchObject({
      status: 503,
      body: notReady,
    });
  });
});
