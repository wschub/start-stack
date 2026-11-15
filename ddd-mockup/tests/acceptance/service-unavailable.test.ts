import { Router } from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../../src/app.ts";

const router = Router();
router.get("/__test/db-down", () => {
  const error = new Error("Can't reach database server at 127.0.0.1:55433");
  error.name = "PrismaClientKnownRequestError";
  Object.assign(error, { code: "P1001" });
  throw error;
});
router.get("/__test/boom", () => {
  throw new Error("password=hex");
});
const app = createApp({ routers: [router] });

describe("base de datos no disponible", () => {
  it("responde 503 con Retry-After, sin filtrar los datos de la conexión", async () => {
    const res = await request(app).get("/__test/db-down");
    expect(res.status).toBe(503);
    expect(res.headers["content-type"]).toContain("application/problem+json");
    expect(res.headers["retry-after"]).toBe("5");
    expect(res.body).toMatchObject({ status: 503, code: "SERVICE_UNAVAILABLE" });
    expect(JSON.stringify(res.body)).not.toMatch(/127\.0\.0\.1|55433|database server/);
  });

  it("traduce el mensaje según Accept-Language", async () => {
    const es = await request(app).get("/__test/db-down");
    const en = await request(app).get("/__test/db-down").set("Accept-Language", "en");
    expect(es.body.detail).toBe(
      "El servicio no está disponible temporalmente. Inténtalo de nuevo en unos segundos.",
    );
    expect(en.body.detail).toBe(
      "The service is temporarily unavailable. Please try again in a few seconds.",
    );
  });

  it("un error inesperado cualquiera sigue siendo 500, sin Retry-After", async () => {
    const res = await request(app).get("/__test/boom");
    expect(res.status).toBe(500);
    expect(res.headers["retry-after"]).toBeUndefined();
  });
});
