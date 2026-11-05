import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../../src/app.ts";

const ALLOWED = "https://app.example.com";

describe("CORS", () => {
  const app = createApp({ corsOrigins: [ALLOWED] });

  const preflight = (origin: string) =>
    request(app)
      .options("/auth/refresh")
      .set("Origin", origin)
      .set("Access-Control-Request-Method", "POST")
      .set("Access-Control-Request-Headers", "content-type,x-csrf-protection");

  it("responde al preflight de un origen permitido con credenciales y cabeceras", async () => {
    const res = await preflight(ALLOWED);
    expect(res.status).toBe(204);
    expect(res.headers["access-control-allow-origin"]).toBe(ALLOWED);
    expect(res.headers["access-control-allow-credentials"]).toBe("true");
    expect(String(res.headers["access-control-allow-headers"]).toLowerCase()).toContain(
      "x-csrf-protection",
    );
    expect(String(res.headers["vary"])).toContain("Origin");
  });

  it.each([
    "https://evil.example.com",
    "https://app.example.com.evil.com",
    "http://app.example.com",
    "null",
  ])("no concede CORS al origen %s", async (origin) => {
    const res = await preflight(origin);
    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
    expect(String(res.headers["vary"])).toContain("Origin");
  });

  it("añade las cabeceras CORS a las respuestas reales y expone X-Request-Id", async () => {
    const res = await request(app).get("/health").set("Origin", ALLOWED);
    expect(res.headers["access-control-allow-origin"]).toBe(ALLOWED);
    expect(String(res.headers["access-control-expose-headers"])).toContain("X-Request-Id");
  });

  it("sin orígenes configurados no envía cabeceras CORS", async () => {
    const res = await request(createApp()).get("/health").set("Origin", ALLOWED);
    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });
});
