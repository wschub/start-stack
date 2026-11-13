import { Router } from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../../src/app.ts";

const router = Router();
router.get("/__test/boom", () => {
  throw new Error("password=hex");
});
router.post("/__test/echo", (_req, res) => {
  res.json({ ok: true });
});

const app = createApp({
  routers: [router],
  readinessProbes: [
    {
      name: "database",
      check: async () => {
        throw new Error("down");
      },
    },
  ],
  corsOrigins: ["https://app.example.com"],
});

const responses: [string, () => request.Test][] = [
  ["GET /health", () => request(app).get("/health")],
  ["GET /health/ready con la base caída (503)", () => request(app).get("/health/ready")],
  ["ruta inexistente (404)", () => request(app).get("/no-existe")],
  ["error inesperado (500)", () => request(app).get("/__test/boom")],
  [
    "JSON inválido (400)",
    () => request(app).post("/__test/echo").set("Content-Type", "application/json").send("{ mal"),
  ],
  [
    "preflight de CORS",
    () =>
      request(app)
        .options("/health")
        .set("Origin", "https://app.example.com")
        .set("Access-Control-Request-Method", "GET"),
  ],
];

describe("cabeceras de seguridad de una API JSON", () => {
  it.each(responses)("%s", async (_name, send) => {
    const res = await send();
    expect(res.headers["content-security-policy"]).toBe(
      "default-src 'none';frame-ancestors 'none'",
    );
    expect(res.headers["x-frame-options"]).toBe("DENY");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["referrer-policy"]).toBe("no-referrer");
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(res.headers["strict-transport-security"]).toContain("max-age=");
    expect(res.headers["x-powered-by"]).toBeUndefined();
    expect(res.headers["etag"]).toBeUndefined();
  });
});
