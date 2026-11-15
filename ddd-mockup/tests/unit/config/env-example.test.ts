import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ENV_VARIABLES, EnvError, loadEnv } from "../../../src/config/env.ts";

const ENV_EXAMPLE = fileURLToPath(new URL("../../../.env.example", import.meta.url));

/** Lee un archivo .env sencillo: líneas CLAVE=valor, comentarios con # y comillas opcionales. */
function parseEnvFile(text: string): Record<string, string> {
  const values: Record<string, string> = {};
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (line === "" || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator === -1) throw new Error(`Línea sin "=" en .env.example: ${line}`);
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    values[key] = value.replace(/^(["'])(.*)\1$/, "$2");
  }
  return values;
}

describe(".env.example", () => {
  const example = parseEnvFile(readFileSync(ENV_EXAMPLE, "utf8"));

  it("el esquema expone la lista de variables que valida", () => {
    expect(ENV_VARIABLES).toContain("DATABASE_URL");
    expect(ENV_VARIABLES).toContain("JWT_ACCESS_SECRET");
    expect(ENV_VARIABLES.length).toBeGreaterThanOrEqual(13);
  });

  it("documenta todas las variables del esquema", () => {
    const missing = ENV_VARIABLES.filter((name) => !(name in example));

    expect(missing).toEqual([]);
  });

  it("no tiene variables que el esquema no conozca", () => {
    const unknown = Object.keys(example).filter((name) => !ENV_VARIABLES.includes(name));

    expect(unknown).toEqual([]);
  });

  it("sus valores de ejemplo son válidos una vez que se cambia el secreto", () => {
    const source = { ...example, JWT_ACCESS_SECRET: "0123456789abcdef0123456789abcdef-test" };

    expect(() => loadEnv(source)).not.toThrow();
  });

  it("su secreto de ejemplo no sirve para arrancar: obliga a generar uno propio", () => {
    let error: unknown;
    try {
      loadEnv(example);
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(EnvError);
    expect((error as EnvError).variables).toEqual(["JWT_ACCESS_SECRET"]);
  });
});
