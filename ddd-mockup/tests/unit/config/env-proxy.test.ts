import { describe, expect, it } from "vitest";
import { EnvError, loadEnv } from "../../../src/config/env.ts";

const valid = {
  DATABASE_URL: "postgresql://ddd:ddd@127.0.0.1:55433/ddd_mockup",
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

describe("TRUST_PROXY", () => {
  it("es 0 por defecto y acepta un número de saltos", () => {
    expect(loadEnv(valid).TRUST_PROXY).toBe(0);
    expect(loadEnv({ ...valid, TRUST_PROXY: "1" }).TRUST_PROXY).toBe(1);
    expect(loadEnv({ ...valid, TRUST_PROXY: "10" }).TRUST_PROXY).toBe(10);
  });

  it.each(["-1", "11", "1.5", "abc"])("rechaza TRUST_PROXY=%s", (value) => {
    expect(variablesOf({ ...valid, TRUST_PROXY: value })).toEqual(["TRUST_PROXY"]);
  });
});
