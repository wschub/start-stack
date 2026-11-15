import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../../src/frameworks/express/app.ts";

describe("GET /health", () => {
  const app = createApp();

  it("responde 200 con status ok, uptime y timestamp", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
    expect(typeof res.body.uptime).toBe("number");
    expect(new Date(res.body.timestamp).toISOString()).toBe(res.body.timestamp);
  });

  it("no revela la tecnología del servidor", async () => {
    const res = await request(app).get("/health");
    expect(res.headers["x-powered-by"]).toBeUndefined();
  });

  it("envía cabeceras de seguridad y no cachea la respuesta", async () => {
    const res = await request(app).get("/health");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["cache-control"]).toBe("no-store");
  });
});
