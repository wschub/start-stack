import { Router } from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createApp } from "../../src/app.ts";
import { parseBody } from "../../src/shared/http/validate.ts";

const schema = z.object({ email: z.string().email(), age: z.number().int().min(18) });
const router = Router();
router.post("/__test/echo", (req, res) => {
  res.json(parseBody(schema, req.body));
});
const app = createApp({ routers: [router] });

describe("lectura del cuerpo JSON", () => {
  it("acepta un JSON válido", async () => {
    const res = await request(app).post("/__test/echo").send({ email: "ana@example.com", age: 30 });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ email: "ana@example.com", age: 30 });
  });

  it("responde 400 INVALID_JSON ante un JSON mal formado", async () => {
    const res = await request(app)
      .post("/__test/echo")
      .set("Content-Type", "application/json")
      .send("{ no es json");
    expect(res.status).toBe(400);
    expect(res.headers["content-type"]).toContain("application/problem+json");
    expect(res.body).toMatchObject({ status: 400, code: "INVALID_JSON" });
  });

  it("responde 413 PAYLOAD_TOO_LARGE con un cuerpo enorme", async () => {
    const res = await request(app)
      .post("/__test/echo")
      .send({ email: "ana@example.com", age: 30, extra: "x".repeat(20_000) });
    expect(res.status).toBe(413);
    expect(res.body).toMatchObject({ status: 413, code: "PAYLOAD_TOO_LARGE" });
  });

  it("responde 400 con la lista de campos inválidos, sin repetir los valores", async () => {
    const res = await request(app)
      .post("/__test/echo")
      .send({ email: "no-es-email-secreto", age: 5 });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
    const fields = (res.body.errors as { field: string }[]).map((e) => e.field);
    expect(fields).toEqual(expect.arrayContaining(["email", "age"]));
    expect(JSON.stringify(res.body)).not.toContain("secreto");
  });

  it("trata un cuerpo ausente como vacío", async () => {
    const res = await request(app).post("/__test/echo");
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
  });

  it("traduce el detalle según Accept-Language", async () => {
    const es = await request(app).post("/__test/echo").set("Accept-Language", "es");
    const en = await request(app).post("/__test/echo").set("Accept-Language", "en");
    expect(es.body.detail).toBe("La solicitud no es válida.");
    expect(en.body.detail).toBe("The request is not valid.");
  });
});
