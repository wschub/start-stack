import cookieParser from "cookie-parser";
import express, { type RequestHandler } from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { AppError } from "../../../../src/entities/errors/app-error.ts";
import { adapt } from "../../../../src/frameworks/express/adapt.ts";
import { errorHandler } from "../../../../src/frameworks/express/error-handler.ts";
import { httpLogger } from "../../../../src/frameworks/express/http-logger.ts";
import type { Controller, HttpRequest } from "../../../../src/interface-adapters/http/http.ts";
import pino from "pino";
import { ANA } from "../../../helpers/http-request.ts";

const COOKIE = { httpOnly: true, secure: false, sameSite: "strict", path: "/auth" } as const;

function appWith(controller: Controller, before: RequestHandler[] = []) {
  const app = express();
  app.use(httpLogger(pino({ level: "silent" })));
  app.use(express.json());
  app.use(cookieParser());
  app.all("/things/:id", ...before, adapt(controller));
  app.use(errorHandler);
  return app;
}

describe("adapt (Express → controlador)", () => {
  it("entrega al controlador la petición como datos planos", async () => {
    let seen: HttpRequest | undefined;
    const app = appWith(async (httpRequest) => {
      seen = httpRequest;
      return { status: 200, body: {} };
    });

    await request(app)
      .post("/things/42?page=2&tag=a&tag=b")
      .set("Accept-Language", "en")
      .set("Cookie", "refresh_token=abc; otra=1")
      .send({ name: "Ana" });

    expect(seen).toMatchObject({
      body: { name: "Ana" },
      params: { id: "42" },
      cookies: { refresh_token: "abc", otra: "1" },
    });
    expect(seen?.query).toMatchObject({ page: "2", tag: ["a", "b"] });
    expect(seen?.headers["accept-language"]).toBe("en");
    expect(seen?.user).toBeUndefined();
  });

  it("pasa al controlador el usuario que dejó la autenticación", async () => {
    let seen: HttpRequest | undefined;
    const authenticate: RequestHandler = (_req, res, next) => {
      res.locals.user = ANA;
      next();
    };
    const app = appWith(
      async (httpRequest) => {
        seen = httpRequest;
        return { status: 200, body: {} };
      },
      [authenticate],
    );

    await request(app).get("/things/1");

    expect(seen?.user).toEqual(ANA);
  });

  it("sin cookie-parser las cookies llegan vacías, no indefinidas", async () => {
    let seen: HttpRequest | undefined;
    const app = express();
    app.get(
      "/",
      adapt(async (httpRequest) => {
        seen = httpRequest;
        return { status: 204 };
      }),
    );

    await request(app).get("/").set("Cookie", "refresh_token=abc");

    expect(seen?.cookies).toEqual({});
  });

  it("escribe el estado, el cuerpo JSON y las cabeceras de la respuesta", async () => {
    const app = appWith(async () => ({
      status: 201,
      body: { id: 7 },
      headers: { "Cache-Control": "no-store" },
    }));

    const res = await request(app).post("/things/1");

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ id: 7 });
    expect(res.headers["content-type"]).toMatch(/application\/json/);
    expect(res.headers["cache-control"]).toBe("no-store");
  });

  it("una respuesta sin cuerpo se envía vacía", async () => {
    const res = await request(appWith(async () => ({ status: 204 }))).delete("/things/1");

    expect(res.status).toBe(204);
    expect(res.text).toBe("");
  });

  it("crea y descarta cookies con sus opciones", async () => {
    const expires = new Date("2030-01-01T00:00:00Z");
    const app = appWith(async () => ({
      status: 200,
      body: {},
      cookies: [{ ...COOKIE, name: "refresh_token", value: "nuevo", expires }],
      clearCookies: [{ ...COOKIE, name: "vieja" }],
    }));

    const res = await request(app).get("/things/1");
    const cookies = (res.headers["set-cookie"] as unknown as string[]).join("\n");

    expect(cookies).toMatch(
      /refresh_token=nuevo; Path=\/auth; Expires=Tue, 01 Jan 2030 00:00:00 GMT; HttpOnly; SameSite=Strict/,
    );
    expect(cookies).toMatch(/vieja=; Path=\/auth; Expires=Thu, 01 Jan 1970/);
  });

  it("un error lanzado por el controlador llega al manejador de errores", async () => {
    const app = appWith(async () => {
      throw new AppError("not_found", { code: "ROLE_NOT_FOUND" });
    });

    const res = await request(app).get("/things/1");

    expect(res.status).toBe(404);
    expect(res.body.code).toBe("ROLE_NOT_FOUND");
    expect(res.headers["content-type"]).toMatch(/application\/problem\+json/);
  });

  it("un fallo devuelto por el controlador descarta sus cookies y responde con el error", async () => {
    const app = appWith(async () => ({
      error: new AppError("unauthenticated", { code: "INVALID_REFRESH_TOKEN" }),
      clearCookies: [{ ...COOKIE, name: "refresh_token" }],
    }));

    const res = await request(app).post("/things/1");

    expect(res.status).toBe(401);
    expect(res.body.code).toBe("INVALID_REFRESH_TOKEN");
    expect((res.headers["set-cookie"] as unknown as string[]).join("\n")).toMatch(
      /refresh_token=; Path=\/auth; Expires=Thu, 01 Jan 1970/,
    );
  });
});
