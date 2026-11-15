import { Router } from "express";
import pino from "pino";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../../src/frameworks/express/app.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

interface LogLine {
  level: number;
  req?: { id?: string };
}

function appWithLogCapture() {
  const lines: string[] = [];
  const logger = pino(
    { level: "info" },
    {
      write: (line: string) => {
        lines.push(line);
      },
    },
  );
  const boom = Router();
  boom.get("/__test/boom", () => {
    throw new Error("password=hex");
  });
  const parsed = () => lines.map((line) => JSON.parse(line) as LogLine);
  return { app: createApp({ logger, routers: [boom] }), lines, parsed };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

describe("X-Request-Id", () => {
  const { app } = appWithLogCapture();

  it("genera un id cuando no llega ninguno", async () => {
    const res = await request(app).get("/health");
    expect(res.headers["x-request-id"]).toMatch(UUID);
  });

  it("respeta un id válido", async () => {
    const res = await request(app).get("/health").set("X-Request-Id", "abc-123_ok");
    expect(res.headers["x-request-id"]).toBe("abc-123_ok");
  });

  it("reemplaza un id con formato inválido", async () => {
    const res = await request(app).get("/health").set("X-Request-Id", "id con espacios!");
    expect(res.headers["x-request-id"]).toMatch(UUID);
  });
});

describe("logging", () => {
  it("registra la petición con su id y sin datos sensibles", async () => {
    const { app, lines, parsed } = appWithLogCapture();
    await request(app)
      .get("/no-existe")
      .set("X-Request-Id", "req-1")
      .set("Authorization", "Bearer secret-token");
    await settle();
    expect(parsed().some((line) => line.req?.id === "req-1")).toBe(true);
    expect(lines.join("")).not.toContain("secret-token");
  });

  it("no registra las peticiones de /health", async () => {
    const { app, lines } = appWithLogCapture();
    await request(app).get("/health");
    await request(app).get("/health/ready");
    await settle();
    expect(lines).toHaveLength(0);
  });

  it("registra los errores 500 con el id de la petición", async () => {
    const { app, parsed } = appWithLogCapture();
    await request(app).get("/__test/boom").set("X-Request-Id", "req-boom");
    await settle();
    expect(parsed().some((line) => line.level === 50 && line.req?.id === "req-boom")).toBe(true);
  });
});
