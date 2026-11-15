import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { checkImports, isMain } from "../../helpers/architecture.ts";

const SRC = fileURLToPath(new URL("../../../src", import.meta.url));
const FOLDERS = ["entities", "use-cases", "interface-adapters", "frameworks"];

/** Todo el código de src/ (sin el cliente generado), con rutas del tipo "src/use-cases/…". */
function readSources(): Record<string, string> {
  const files: Record<string, string> = {};
  for (const file of readdirSync(SRC, { recursive: true, encoding: "utf8" })) {
    const path = file.replaceAll("\\", "/");
    if (!path.endsWith(".ts") || path.startsWith("generated/")) continue;
    files[`src/${path}`] = readFileSync(join(SRC, file), "utf8");
  }
  return files;
}

describe("Clean Architecture", () => {
  const sources = readSources();
  const paths = Object.keys(sources);

  it("analiza el código real de todas las capas", () => {
    for (const folder of FOLDERS) {
      expect(paths.filter((path) => path.startsWith(`src/${folder}/`)).length).toBeGreaterThan(3);
    }
    expect(paths.filter(isMain).length).toBeGreaterThan(3);
    expect(paths).toContain("src/composition.ts");
    expect(paths.some((path) => path.startsWith("src/generated/"))).toBe(false);
  });

  it("ningún archivo de src/ incumple la regla de dependencia", () => {
    const violations = checkImports(sources).map(
      ({ file, imported, rule }) => `${rule}: ${file} → ${imported}`,
    );

    expect(violations).toEqual([]);
  });

  it("todo el código vive en una de las cinco capas", () => {
    const outside = paths.filter(
      (path) => !isMain(path) && !FOLDERS.includes(path.split("/")[1] ?? ""),
    );

    expect(outside).toEqual([]);
  });

  it("los casos de uso se agrupan por funcionalidad y llevan el sufijo .use-case.ts", () => {
    const misplaced = paths.filter((path) => {
      const [, layer, feature, file] = path.split("/");
      if (layer !== "use-cases") return false;
      // Suelto en la capa solo puede estar el puerto de entrada común.
      if (file === undefined) return feature !== "use-case.ts";
      return false;
    });
    const misnamed = paths.filter(
      (path) =>
        path.endsWith(".use-case.ts") &&
        !/^src\/use-cases\/[a-z-]+\/[a-z-]+\.use-case\.ts$/.test(path),
    );

    expect(misplaced).toEqual([]);
    expect(misnamed).toEqual([]);
  });

  it("cada clase de caso de uso declara su puerto de entrada", () => {
    const withoutPort = Object.entries(sources)
      .filter(([path]) => path.endsWith(".use-case.ts"))
      .filter(([, content]) => /export class \w+/.test(content))
      .filter(([, content]) => !/export class \w+ implements (UseCase<|\w+)/.test(content))
      .map(([path]) => path);

    expect(withoutPort).toEqual([]);
  });

  it("los controladores y presentadores no conocen Express", () => {
    const offenders = Object.entries(sources)
      .filter(([path]) => path.startsWith("src/interface-adapters/"))
      .filter(([, content]) => /\b(RequestHandler|req\.|res\.)/.test(content))
      .map(([path]) => path);

    expect(offenders).toEqual([]);
  });
});
