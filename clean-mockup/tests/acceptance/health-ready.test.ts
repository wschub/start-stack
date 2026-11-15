import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../../src/frameworks/express/app.ts";

describe("GET /health/ready", () => {
  it("responde 200 cuando las dependencias están disponibles", async () => {
    const app = createApp({ readinessProbes: [{ name: "database", check: async () => {} }] });
    const res = await request(app).get("/health/ready");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ready", checks: [{ name: "database", status: "up" }] });
  });

  it("responde 503 y no filtra detalles cuando una dependencia falla", async () => {
    const app = createApp({
      readinessProbes: [
        {
          name: "database",
          check: async () => {
            throw new Error("password=hex");
          },
        },
      ],
    });
    const res = await request(app).get("/health/ready");
    expect(res.status).toBe(503);
    expect(res.body.status).toBe("not_ready");
    expect(JSON.stringify(res.body)).not.toContain("password");
    expect(res.headers["cache-control"]).toBe("no-store");
  });
});
