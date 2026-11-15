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

describe("arquitectura DDD", () => {
  const sources = readSources();

  it("analiza el código real de los contextos, de platform y de shared", () => {
    const paths = Object.keys(sources);

    expect(paths).toContain("src/composition.ts");
    expect(paths.filter((path) => path.startsWith("src/contexts/")).length).toBeGreaterThan(20);
    expect(paths.filter((path) => path.startsWith("src/platform/")).length).toBeGreaterThan(3);
    expect(paths.filter((path) => path.startsWith("src/shared/")).length).toBeGreaterThan(5);
    expect(paths.some((path) => path.startsWith("src/generated/"))).toBe(false);
  });

  it("ningún archivo de src/ incumple las reglas de dependencia", () => {
    const violations = checkImports(sources).map(
      ({ file, imported, rule }) => `${rule}: ${file} → ${imported}`,
    );

    expect(violations).toEqual([]);
  });

  it("cada contexto y cada capacidad de platform solo tiene las cuatro capas", () => {
    const layers = new Set(["domain", "application", "infrastructure", "presentation"]);
    const misplaced = Object.keys(sources).filter((path) => {
      const [, root, , layer] = path.split("/");
      return (root === "contexts" || root === "platform") && !layers.has(layer ?? "");
    });

    expect(misplaced).toEqual([]);
  });

  it("el dominio de cada contexto se organiza con los bloques tácticos de DDD", () => {
    const blocks = new Set([
      "aggregates",
      "entities",
      "value-objects",
      "events",
      "repositories",
      "services",
    ]);
    const misplaced = Object.keys(sources).filter((path) => {
      const [, root, , layer, block, file] = path.split("/");
      return root === "contexts" && layer === "domain" && (!file || !blocks.has(block ?? ""));
    });

    expect(misplaced).toEqual([]);
  });

  it("la aplicación separa los comandos de las consultas, y cada archivo lleva su sufijo", () => {
    const misnamed = Object.keys(sources).filter((path) => {
      const [, root, , layer, folder, file] = path.split("/");
      if (root !== "contexts" || layer !== "application" || !file) return false;
      if (folder === "commands") return !file.endsWith(".command.ts");
      if (folder === "queries") return !file.endsWith(".query.ts");
      return file.endsWith(".command.ts") || file.endsWith(".query.ts");
    });

    expect(misnamed).toEqual([]);
  });

  it("las consultas no guardan agregados ni publican eventos", () => {
    const writes = /\.(add|update|remove|replaceForUser|setUserRoles|markUsed|publish)\(/;
    const offenders = Object.entries(sources)
      .filter(([path]) => path.endsWith(".query.ts"))
      .filter(([, content]) => writes.test(content))
      .map(([path]) => path);

    expect(offenders).toEqual([]);
  });
});
