import { describe, expect, it } from "vitest";
import { checkReadiness } from "../../../../src/modules/health/application/use-cases/check-readiness.use-case.ts";
import type { ReadinessProbe } from "../../../../src/modules/health/application/ports/readiness-probe.ts";

const up = (name: string): ReadinessProbe => ({ name, check: async () => {} });
const down = (name: string): ReadinessProbe => ({
  name,
  check: async () => {
    throw new Error("secret connection string");
  },
});
const hanging = (name: string): ReadinessProbe => ({ name, check: () => new Promise(() => {}) });

describe("checkReadiness", () => {
  it("está listo cuando todas las dependencias responden", async () => {
    expect(await checkReadiness([up("database")])).toEqual({
      status: "ready",
      checks: [{ name: "database", status: "up" }],
    });
  });

  it("está listo si no hay dependencias que comprobar", async () => {
    expect(await checkReadiness([])).toEqual({ status: "ready", checks: [] });
  });

  it("no está listo si una dependencia falla, sin exponer el detalle del error", async () => {
    const result = await checkReadiness([up("cache"), down("database")]);
    expect(result.status).toBe("not_ready");
    expect(result.checks).toEqual([
      { name: "cache", status: "up" },
      { name: "database", status: "down" },
    ]);
    expect(JSON.stringify(result)).not.toContain("secret");
  });

  it("trata como caída una dependencia que no responde a tiempo", async () => {
    const result = await checkReadiness([hanging("database")], { timeoutMs: 50 });
    expect(result.status).toBe("not_ready");
    expect(result.checks).toEqual([{ name: "database", status: "down" }]);
  });
});
