import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { checkImports } from "../../helpers/architecture.ts";

const SRC = fileURLToPath(new URL("../../../src", import.meta.url));

/** Todo el código de src/ (sin el cliente generado), con rutas del tipo "src/contexts/…". */
function readSources(): Record<string, string> {
  const files: Record<string, string> = {};
  for (const file of readdirSync(SRC, { recursive: true, encoding: "utf8" })) {
    const path = file.replaceAll("\\", "/");
    if (!path.endsWith(".ts") || path.startsWith("generated/")) continue;
    files[`src/${path}`] = readFileSync(join(SRC, file), "utf8");
  }
  return files;
}

describe("arquitectura hexagonal", () => {
  const sources = readSources();

  it("analiza el código real de los módulos y de shared", () => {
    const paths = Object.keys(sources);

    expect(paths).toContain("src/composition.ts");
    expect(paths.filter((path) => path.startsWith("src/contexts/")).length).toBeGreaterThan(20);
    expect(paths.filter((path) => path.startsWith("src/shared/")).length).toBeGreaterThan(5);
    expect(paths.some((path) => path.startsWith("src/generated/"))).toBe(false);
  });

  it("ningún archivo de src/ incumple las reglas de dependencia entre capas", () => {
    const violations = checkImports(sources).map(
      ({ file, imported, rule }) => `${rule}: ${file} → ${imported}`,
    );

    expect(violations).toEqual([]);
  });
});
