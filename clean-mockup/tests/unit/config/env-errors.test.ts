import { describe, expect, it } from "vitest";
import { EnvError, loadEnv } from "../../../src/config/env.ts";

const valid = {
  DATABASE_URL: "postgresql://clean:clean@127.0.0.1:55434/clean_mockup",
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

describe("atribución de errores en las duraciones", () => {
  it("solo señala ACCESS_TOKEN_EXPIRATION_TIME cuando es el único inválido", () => {
    expect(variablesOf({ ...valid, ACCESS_TOKEN_EXPIRATION_TIME: "abc" })).toEqual([
      "ACCESS_TOKEN_EXPIRATION_TIME",
    ]);
  });

  it("solo señala REFRESH_TOKEN_EXPIRATION_TIME cuando es el único inválido", () => {
    expect(variablesOf({ ...valid, REFRESH_TOKEN_EXPIRATION_TIME: "abc" })).toEqual([
      "REFRESH_TOKEN_EXPIRATION_TIME",
    ]);
  });

  it("señala ambas cuando las dos son inválidas", () => {
    const variables = variablesOf({
      ...valid,
      ACCESS_TOKEN_EXPIRATION_TIME: "abc",
      REFRESH_TOKEN_EXPIRATION_TIME: "xyz",
    });
    expect([...variables].sort()).toEqual([
      "ACCESS_TOKEN_EXPIRATION_TIME",
      "REFRESH_TOKEN_EXPIRATION_TIME",
    ]);
  });
});
