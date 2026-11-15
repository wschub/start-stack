import { describe, expect, it } from "vitest";
import { EnvError, loadEnv } from "../../../src/config/env.ts";

const SECRET = "0123456789abcdef0123456789abcdef-test";
const valid = {
  DATABASE_URL: "postgresql://ddd:ddd@127.0.0.1:55433/ddd_mockup",
  JWT_ACCESS_SECRET: SECRET,
};

function errorOf(source: NodeJS.ProcessEnv): EnvError {
  try {
    loadEnv(source);
  } catch (error) {
    if (error instanceof EnvError) return error;
    throw error;
  }
  throw new Error("loadEnv no lanzó ningún error");
}

describe("loadEnv", () => {
  it("aplica valores por defecto", () => {
    expect(loadEnv(valid)).toEqual({
      NODE_ENV: "development",
      PORT: 3000,
      DATABASE_URL: valid.DATABASE_URL,
      LOG_LEVEL: "info",
      JWT_ACCESS_SECRET: SECRET,
      ACCESS_TOKEN_EXPIRATION_TIME: 3600,
      REFRESH_TOKEN_EXPIRATION_TIME: 604_800,
      JWT_ISSUER: "ddd-mockup",
      JWT_AUDIENCE: "ddd-mockup-api",
      PASSWORD_RESET_EXPIRATION_TIME: 1800,
      PASSWORD_RESET_URL: "http://localhost:5173/reset-password",
      PUBLIC_REGISTRATION: true,
      COOKIE_SAME_SITE: "strict",
      CORS_ORIGINS: [],
      TRUST_PROXY: 0,
    });
  });

  it("convierte PORT a número", () => {
    expect(loadEnv({ ...valid, PORT: "8080" }).PORT).toBe(8080);
  });

  it("interpreta las duraciones de los tokens y las devuelve en segundos", () => {
    const env = loadEnv({
      ...valid,
      ACCESS_TOKEN_EXPIRATION_TIME: "30m",
      REFRESH_TOKEN_EXPIRATION_TIME: "1D",
    });
    expect(env.ACCESS_TOKEN_EXPIRATION_TIME).toBe(1800);
    expect(env.REFRESH_TOKEN_EXPIRATION_TIME).toBe(86_400);
  });

  it("nombra DATABASE_URL cuando falta", () => {
    expect(errorOf({ JWT_ACCESS_SECRET: SECRET }).variables).toContain("DATABASE_URL");
  });

  it("nombra JWT_ACCESS_SECRET cuando falta", () => {
    expect(errorOf({ DATABASE_URL: valid.DATABASE_URL }).variables).toContain("JWT_ACCESS_SECRET");
  });

  it.each(["0", "70000", "abc"])("rechaza PORT=%s", (port) => {
    expect(errorOf({ ...valid, PORT: port }).variables).toContain("PORT");
  });

  it("rechaza una DATABASE_URL que no es de Postgres", () => {
    expect(errorOf({ ...valid, DATABASE_URL: "mysql://u:p@h/db" }).variables).toContain(
      "DATABASE_URL",
    );
  });

  it.each(["abc", "0m", "1.5h", "60", "1w"])("rechaza ACCESS_TOKEN_EXPIRATION_TIME=%s", (value) => {
    expect(errorOf({ ...valid, ACCESS_TOKEN_EXPIRATION_TIME: value }).variables).toContain(
      "ACCESS_TOKEN_EXPIRATION_TIME",
    );
  });

  it("rechaza un token de acceso de más de 24 horas", () => {
    expect(errorOf({ ...valid, ACCESS_TOKEN_EXPIRATION_TIME: "25h" }).variables).toContain(
      "ACCESS_TOKEN_EXPIRATION_TIME",
    );
  });

  it("rechaza un refresh token de más de 90 días", () => {
    expect(errorOf({ ...valid, REFRESH_TOKEN_EXPIRATION_TIME: "91d" }).variables).toContain(
      "REFRESH_TOKEN_EXPIRATION_TIME",
    );
  });

  it("exige que el refresh dure más que el token de acceso", () => {
    const error = errorOf({
      ...valid,
      ACCESS_TOKEN_EXPIRATION_TIME: "12h",
      REFRESH_TOKEN_EXPIRATION_TIME: "1h",
    });
    expect(error.variables).toEqual(["REFRESH_TOKEN_EXPIRATION_TIME"]);
  });

  it.each(["corto", "change-me-with-at-least-32-random-characters"])(
    "rechaza un JWT_ACCESS_SECRET débil o de ejemplo: %s",
    (secret) => {
      expect(errorOf({ ...valid, JWT_ACCESS_SECRET: secret }).variables).toContain(
        "JWT_ACCESS_SECRET",
      );
    },
  );

  it("no incluye los valores en el mensaje de error", () => {
    const error = errorOf({
      DATABASE_URL: "not-a-url-secret123",
      JWT_ACCESS_SECRET: "corto-secreto456",
    });
    expect(error.variables).toEqual(expect.arrayContaining(["DATABASE_URL", "JWT_ACCESS_SECRET"]));
    expect(error.message).not.toContain("secret123");
    expect(error.message).not.toContain("secreto456");
  });
});
