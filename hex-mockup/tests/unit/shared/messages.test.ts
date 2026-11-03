import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { DEFAULT_ERROR_CODES } from "../../../src/shared/errors/app-error.ts";
import { MESSAGES } from "../../../src/shared/i18n/messages.ts";

const SRC = fileURLToPath(new URL("../../../src", import.meta.url));

function codesUsedInSource(): string[] {
  const codes = new Set<string>();
  const pattern = /(?:\bcode:\s*|\binvalid\()"([A-Z][A-Z_]*)"/g;
  for (const file of readdirSync(SRC, { recursive: true, encoding: "utf8" })) {
    if (!file.endsWith(".ts") || file.startsWith("generated")) continue;
    const text = readFileSync(join(SRC, file), "utf8");
    for (const match of text.matchAll(pattern)) {
      if (match[1]) codes.add(match[1]);
    }
  }
  return [...codes].sort();
}

describe("catálogo de mensajes", () => {
  it("español e inglés tienen exactamente las mismas claves", () => {
    expect(Object.keys(MESSAGES.es).sort()).toEqual(Object.keys(MESSAGES.en).sort());
  });

  it("no tiene mensajes vacíos", () => {
    for (const catalog of Object.values(MESSAGES)) {
      for (const message of Object.values(catalog)) expect(message.trim()).not.toBe("");
    }
  });

  it("cubre los códigos por defecto de cada tipo de error y INTERNAL_ERROR", () => {
    const codes = [...Object.values(DEFAULT_ERROR_CODES), "INTERNAL_ERROR"];
    for (const code of codes) {
      expect(MESSAGES.es[code], `es: ${code}`).toBeDefined();
      expect(MESSAGES.en[code], `en: ${code}`).toBeDefined();
    }
  });

  it("cubre todos los códigos que usa el código fuente", () => {
    const codes = codesUsedInSource();
    expect(codes.length).toBeGreaterThan(10);
    for (const code of codes) {
      expect(MESSAGES.es[code], `es: ${code}`).toBeDefined();
      expect(MESSAGES.en[code], `en: ${code}`).toBeDefined();
    }
  });
});
