import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { AppError } from "../../../../src/entities/errors/app-error.ts";
import { errorHandler } from "../../../../src/frameworks/express/error-handler.ts";
import { httpLogger } from "../../../../src/frameworks/express/http-logger.ts";
import {
  authenticatedUser,
  requireAuth,
} from "../../../../src/frameworks/express/middlewares/require-auth.ts";
import { createPermissionGuard } from "../../../../src/frameworks/express/middlewares/require-permission.ts";
import type { CheckPermissionInput } from "../../../../src/use-cases/auth/check-permission.use-case.ts";
import type { PublicUser } from "../../../../src/use-cases/users/public-user.ts";
import pino from "pino";
import { ANA } from "../../../helpers/http-request.ts";
import { StubUseCase } from "../../../helpers/use-case-fakes.ts";

function appWith(...handlers: express.RequestHandler[]) {
  const app = express();
  app.use(httpLogger(pino({ level: "silent" })));
  app.get("/", ...handlers, (_req, res) => {
    res.json({ user: authenticatedUser(res).publicId });
  });
  app.use(errorHandler);
  return app;
}

describe("requireAuth", () => {
  it("identifica al usuario con el token Bearer y lo deja disponible para la ruta", async () => {
    const identifyUser = StubUseCase.returning<string, PublicUser>(ANA);

    const res = await request(appWith(requireAuth({ identifyUser })))
      .get("/")
      .set("Authorization", "bearer   un-token");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ user: ANA.publicId });
    expect(identifyUser.calls).toEqual(["un-token"]);
  });

  it.each([
    ["sin cabecera", undefined],
    ["con otro esquema", "Basic abc"],
    ["con el token vacío", "Bearer "],
  ])("%s responde 401 sin llamar al caso de uso", async (_case, header) => {
    const identifyUser = StubUseCase.returning<string, PublicUser>(ANA);
    const pending = request(appWith(requireAuth({ identifyUser }))).get("/");

    const res = await (header ? pending.set("Authorization", header) : pending);

    expect(res.status).toBe(401);
    expect(res.body.code).toBe("UNAUTHENTICATED");
    expect(identifyUser.calls).toEqual([]);
  });

  it("responde con el error del caso de uso", async () => {
    const identifyUser = StubUseCase.failing<string, PublicUser>(
      new AppError("forbidden", { code: "ACCOUNT_INACTIVE" }),
    );

    const res = await request(appWith(requireAuth({ identifyUser })))
      .get("/")
      .set("Authorization", "Bearer un-token");

    expect(res.status).toBe(403);
    expect(res.body.code).toBe("ACCOUNT_INACTIVE");
  });

  it("authenticatedUser falla en una ruta que no pasó por requireAuth", async () => {
    const res = await request(appWith()).get("/");

    expect(res.status).toBe(401);
  });
});

describe("createPermissionGuard", () => {
  const checker = (stub: StubUseCase<CheckPermissionInput, void>, registered = true) => ({
    execute: (input: CheckPermissionInput) => stub.execute(input),
    assertRegistered: () => {
      if (!registered) throw new Error("not registered");
    },
  });
  const authenticate = requireAuth({
    identifyUser: StubUseCase.returning<string, PublicUser>(ANA),
  });

  it("comprueba el permiso del usuario identificado antes de seguir", async () => {
    const stub = StubUseCase.returning<CheckPermissionInput, void>(undefined);
    const guard = createPermissionGuard({ checkPermission: checker(stub) });

    const res = await request(appWith(authenticate, guard("users:read")))
      .get("/")
      .set("Authorization", "Bearer t");

    expect(res.status).toBe(200);
    expect(stub.calls).toEqual([{ userPublicId: ANA.publicId, permission: "users:read" }]);
  });

  it("responde 403 si el caso de uso lo deniega", async () => {
    const stub = StubUseCase.failing<CheckPermissionInput, void>(
      new AppError("forbidden", { code: "PERMISSION_DENIED" }),
    );
    const guard = createPermissionGuard({ checkPermission: checker(stub) });

    const res = await request(appWith(authenticate, guard("users:read")))
      .get("/")
      .set("Authorization", "Bearer t");

    expect(res.status).toBe(403);
    expect(res.body.code).toBe("PERMISSION_DENIED");
  });

  it("sin autenticación previa responde 401 y no comprueba nada", async () => {
    const stub = StubUseCase.returning<CheckPermissionInput, void>(undefined);
    const guard = createPermissionGuard({ checkPermission: checker(stub) });

    const res = await request(appWith(guard("users:read"))).get("/");

    expect(res.status).toBe(401);
    expect(stub.calls).toEqual([]);
  });

  it("montar una ruta con un permiso sin registrar falla en ese momento", () => {
    const stub = StubUseCase.returning<CheckPermissionInput, void>(undefined);
    const guard = createPermissionGuard({ checkPermission: checker(stub, false) });

    expect(() => guard("products:read")).toThrow(/not registered/);
  });
});
