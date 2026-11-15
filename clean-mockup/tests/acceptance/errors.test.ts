import { Router } from "express";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../../src/frameworks/express/app.ts";
import { AppError } from "../../src/entities/errors/app-error.ts";

const testRouter = Router();
testRouter.get("/__test/validation", () => {
  throw new AppError("validation");
});
testRouter.get("/__test/unauthenticated", () => {
  throw new AppError("unauthenticated");
});
testRouter.get("/__test/forbidden", () => {
  throw new AppError("forbidden");
});
testRouter.get("/__test/conflict", () => {
  throw new AppError("conflict", { code: "EMAIL_ALREADY_EXISTS" });
});
testRouter.get("/__test/boom", () => {
  throw new Error("password=hex");
});
testRouter.get("/__test/boom-async", async () => {
  throw new Error("password=hex");
});

const app = createApp({ routers: [testRouter] });

afterEach(() => {
  vi.restoreAllMocks();
});

describe("errores HTTP uniformes", () => {
  it.each([
    ["validation", 400, "VALIDATION_ERROR"],
    ["unauthenticated", 401, "UNAUTHENTICATED"],
    ["forbidden", 403, "FORBIDDEN"],
    ["conflict", 409, "EMAIL_ALREADY_EXISTS"],
  ] as const)("/__test/%s responde %i con el código estable %s", async (path, status, code) => {
    const res = await request(app).get(`/__test/${path}`);
    expect(res.status).toBe(status);
    expect(res.headers["content-type"]).toContain("application/problem+json");
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(res.body).toMatchObject({ type: "about:blank", status, code });
  });

  it("responde 404 con el mismo formato para rutas inexistentes", async () => {
    const res = await request(app).get("/no-existe");
    expect(res.status).toBe(404);
    expect(res.headers["content-type"]).toContain("application/problem+json");
    expect(res.body).toMatchObject({ status: 404, code: "NOT_FOUND" });
  });

  it("traduce el mensaje según Accept-Language", async () => {
    const es = await request(app).get("/no-existe").set("Accept-Language", "es-CO,es;q=0.9");
    const en = await request(app).get("/no-existe").set("Accept-Language", "en-US,en;q=0.9");
    expect(es.body.detail).toBe("No se encontró el recurso solicitado.");
    expect(en.body.detail).toBe("The requested resource was not found.");
  });

  it.each(["boom", "boom-async"])("/__test/%s responde 500 sin filtrar detalles", async (path) => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await request(app).get(`/__test/${path}`);
    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({ status: 500, code: "INTERNAL_ERROR" });
    expect(JSON.stringify(res.body)).not.toContain("password");
  });
});
