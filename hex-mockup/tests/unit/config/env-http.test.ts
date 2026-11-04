import { describe, expect, it } from "vitest";
import { EnvError, loadEnv } from "../../../src/config/env.ts";

const valid = {
  DATABASE_URL: "postgresql://hex:hex@127.0.0.1:55432/hex_mockup",
  JWT_ACCESS_SECRET: "0123456789abcdef0123456789abcdef-test",
};

function variablesOf(source: NodeJS.ProcessEnv): readonly string[] {
  try {
    loadEnv(source);
  } catch (error) {
    if (error instanceof EnvError) return error.variables;
    throw error;
  }
  throw new Error("loadEnv no lanzó ningún error");
}

describe("PUBLIC_REGISTRATION", () => {
  it("es true por defecto y acepta true o false", () => {
    expect(loadEnv(valid).PUBLIC_REGISTRATION).toBe(true);
    expect(loadEnv({ ...valid, PUBLIC_REGISTRATION: "false" }).PUBLIC_REGISTRATION).toBe(false);
    expect(loadEnv({ ...valid, PUBLIC_REGISTRATION: "true" }).PUBLIC_REGISTRATION).toBe(true);
  });

  it.each(["yes", "1", "FALSE", ""])("rechaza PUBLIC_REGISTRATION=%j", (value) => {
    expect(variablesOf({ ...valid, PUBLIC_REGISTRATION: value })).toEqual(["PUBLIC_REGISTRATION"]);
  });
});

describe("CORS_ORIGINS", () => {
  it("es una lista vacía por defecto", () => {
    expect(loadEnv(valid).CORS_ORIGINS).toEqual([]);
    expect(loadEnv({ ...valid, CORS_ORIGINS: "" }).CORS_ORIGINS).toEqual([]);
  });

  it("separa por comas y recorta espacios", () => {
    const env = loadEnv({
      ...valid,
      CORS_ORIGINS: "https://app.example.com, http://localhost:5173",
    });
    expect(env.CORS_ORIGINS).toEqual(["https://app.example.com", "http://localhost:5173"]);
  });

  it.each([
    "*",
    "app.example.com",
    "https://app.example.com/",
    "https://app.example.com/ruta",
    "ftp://app.example.com",
    "https://app.example.com:443",
  ])("rechaza el origen %s", (origin) => {
    expect(variablesOf({ ...valid, CORS_ORIGINS: origin })).toEqual(["CORS_ORIGINS"]);
  });
});

describe("COOKIE_SAME_SITE", () => {
  it("es strict por defecto y acepta strict, lax y none en producción", () => {
    expect(loadEnv(valid).COOKIE_SAME_SITE).toBe("strict");
    expect(loadEnv({ ...valid, COOKIE_SAME_SITE: "lax" }).COOKIE_SAME_SITE).toBe("lax");
    expect(
      loadEnv({ ...valid, NODE_ENV: "production", COOKIE_SAME_SITE: "none" }).COOKIE_SAME_SITE,
    ).toBe("none");
  });

  it("rechaza none fuera de producción, porque exige cookies Secure", () => {
    expect(variablesOf({ ...valid, COOKIE_SAME_SITE: "none" })).toEqual(["COOKIE_SAME_SITE"]);
  });

  it("rechaza valores desconocidos", () => {
    expect(variablesOf({ ...valid, COOKIE_SAME_SITE: "bogus" })).toEqual(["COOKIE_SAME_SITE"]);
  });
});

describe("JWT_ISSUER y JWT_AUDIENCE", () => {
  it("tienen valores por defecto y se pueden cambiar", () => {
    const defaults = loadEnv(valid);
    expect(defaults.JWT_ISSUER).toBe("hex-mockup");
    expect(defaults.JWT_AUDIENCE).toBe("hex-mockup-api");
    const custom = loadEnv({ ...valid, JWT_ISSUER: "mi-api", JWT_AUDIENCE: "mi-front" });
    expect([custom.JWT_ISSUER, custom.JWT_AUDIENCE]).toEqual(["mi-api", "mi-front"]);
  });
});
