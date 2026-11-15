import { describe, expect, it } from "vitest";
import { currentUser } from "../../../../src/interface-adapters/http/current-user.ts";
import { accepted, created, noContent, ok } from "../../../../src/interface-adapters/http/http.ts";
import {
  expiredRefreshCookie,
  readRefreshCookie,
  refreshCookie,
} from "../../../../src/interface-adapters/http/refresh-cookie.ts";
import { ANA, httpRequest } from "../../../helpers/http-request.ts";

describe("respuestas", () => {
  it("cada atajo fija su estado HTTP", () => {
    expect(ok({ a: 1 })).toEqual({ status: 200, body: { a: 1 } });
    expect(created({ a: 1 })).toEqual({ status: 201, body: { a: 1 } });
    expect(accepted()).toEqual({ status: 202 });
    expect(noContent()).toEqual({ status: 204 });
  });
});

describe("currentUser", () => {
  it("devuelve a quien hace la petición", () => {
    expect(currentUser(httpRequest({ user: ANA }))).toBe(ANA);
  });

  it("falla si la ruta no pasó por la autenticación", () => {
    expect(() => currentUser(httpRequest())).toThrow(
      expect.objectContaining({ kind: "unauthenticated" }),
    );
  });
});

describe("cookie del refresh token", () => {
  const expires = new Date("2026-11-22T10:00:00Z");

  it("siempre es HttpOnly y está limitada a /auth", () => {
    expect(refreshCookie({ secure: true, sameSite: "none" }, "valor", expires)).toEqual({
      name: "refresh_token",
      value: "valor",
      expires,
      httpOnly: true,
      secure: true,
      sameSite: "none",
      path: "/auth",
    });
  });

  it("para descartarla se usan las mismas opciones con las que se creó", () => {
    const config = { secure: false, sameSite: "strict" } as const;
    const created = refreshCookie(config, "v", expires);
    const removal = expiredRefreshCookie(config);

    expect(created).toMatchObject(removal);
    expect(removal).not.toHaveProperty("value");
    expect(removal).not.toHaveProperty("expires");
  });

  it("se lee de las cookies de la petición; vacía cuenta como ausente", () => {
    expect(readRefreshCookie(httpRequest({ cookies: { refresh_token: "abc" } }))).toBe("abc");
    expect(readRefreshCookie(httpRequest({ cookies: { refresh_token: "" } }))).toBeUndefined();
    expect(readRefreshCookie(httpRequest({ cookies: { otra: "abc" } }))).toBeUndefined();
  });
});
