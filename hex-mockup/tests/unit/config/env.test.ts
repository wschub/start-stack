import { describe, expect, it } from "vitest";
import { EnvError, loadEnv } from "../../../src/config/env.ts";

const valid = { DATABASE_URL: "postgresql://hex:hex@127.0.0.1:55432/hex_mockup" };

describe("loadEnv", () => {
  it("aplica valores por defecto", () => {
    expect(loadEnv(valid)).toEqual({
      NODE_ENV: "development",
      PORT: 3000,
      DATABASE_URL: valid.DATABASE_URL,
      LOG_LEVEL: "info",
    });
  });

  it("convierte PORT a número", () => {
    expect(loadEnv({ ...valid, PORT: "8080" }).PORT).toBe(8080);
  });

  it("falla y nombra la variable cuando falta DATABASE_URL", () => {
    expect(() => loadEnv({})).toThrow(EnvError);
    expect(() => loadEnv({})).toThrow(/DATABASE_URL/);
  });

  it.each(["0", "70000", "abc"])("rechaza PORT=%s", (port) => {
    expect(() => loadEnv({ ...valid, PORT: port })).toThrow(/PORT/);
  });

  it("rechaza una DATABASE_URL que no es de Postgres", () => {
    expect(() => loadEnv({ DATABASE_URL: "mysql://u:p@h/db" })).toThrow(/DATABASE_URL/);
  });

  it("no incluye los valores en el mensaje de error", () => {
    const error = (() => {
      try {
        loadEnv({ DATABASE_URL: "not-a-url-secret123" });
      } catch (e) {
        return e;
      }
    })();
    expect(error).toBeInstanceOf(EnvError);
    expect((error as EnvError).message).not.toContain("secret123");
  });
});
