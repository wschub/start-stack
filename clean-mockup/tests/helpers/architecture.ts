import { posix } from "node:path";

/**
 * Función de aptitud de Clean Architecture: revisa los imports de src/ y devuelve los que
 * incumplen la regla de dependencia (R1–R9 de docs/ARCHITECTURE.md). El código solo puede
 * depender de lo que tiene más adentro:
 *
 *   main ──► frameworks ──► interface-adapters ──► use-cases ──► entities
 *
 * Es una función pura: recibe un mapa "ruta → contenido" y no toca el disco.
 */

export type Rule = "R1" | "R2" | "R3" | "R4" | "R5" | "R6" | "R7" | "R8" | "R9";

export interface Violation {
  /** Archivo que contiene el import, por ejemplo "src/use-cases/auth/log-in.use-case.ts". */
  file: string;
  /** Especificador tal como está escrito en el import. */
  imported: string;
  rule: Rule;
}

/** De dentro hacia fuera. Cada capa puede importar de sí misma y de las anteriores. */
const LAYERS = ["entities", "use-cases", "interface-adapters", "frameworks", "main"] as const;
type Layer = (typeof LAYERS)[number];

/** Regla que incumple cada capa cuando importa de una capa más externa. */
const INWARD_RULE: Record<Layer, Rule | undefined> = {
  entities: "R1",
  "use-cases": "R2",
  "interface-adapters": "R3",
  frameworks: "R4",
  main: undefined,
};

/** Librerías que la capa de adaptadores sí puede usar: solo validación de la entrada. */
const ALLOWED_IN_ADAPTERS: readonly string[] = ["zod"];

type Location =
  | {
      kind: "layer";
      layer: Layer;
      /** Primera carpeta dentro de la capa ("auth", "express"…); undefined si el archivo está suelto. */
      folder: string | undefined;
    }
  | { kind: "generated" }
  | { kind: "other" };

interface Import {
  specifier: string;
  /** `import type { … }` o `export type { … }`: desaparece al compilar. */
  typeOnly: boolean;
}

const IMPORT_PATTERN =
  /\b(?:(import|export)\s+(type\s+)?[^"';]*?from\s*|import\s*\(\s*|import\s*)(["'])([^"'\n]+)\3/g;

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

function importsOf(source: string): Import[] {
  const imports: Import[] = [];
  for (const match of stripComments(source).matchAll(IMPORT_PATTERN)) {
    if (match[4]) imports.push({ specifier: match[4], typeOnly: match[2] !== undefined });
  }
  return imports;
}

function locate(path: string): Location {
  if (path.startsWith("src/generated/")) return { kind: "generated" };

  const [, layer, ...rest] = path.split("/");
  const known = LAYERS.find((candidate) => candidate === layer);
  if (!known) return { kind: "other" };
  return { kind: "layer", layer: known, folder: rest.length > 1 ? rest[0] : undefined };
}

/** "@prisma/client/runtime" → "@prisma/client"; "zod/v4" → "zod". */
function packageName(specifier: string): string {
  const [first = "", second] = specifier.split("/");
  return first.startsWith("@") && second ? `${first}/${second}` : first;
}

function checkExternal(source: Location, specifier: string): Rule | undefined {
  if (specifier.startsWith("node:") || source.kind !== "layer") return undefined;

  if (source.layer === "entities" || source.layer === "use-cases") return "R5";
  if (source.layer === "interface-adapters") {
    return ALLOWED_IN_ADAPTERS.includes(packageName(specifier)) ? undefined : "R6";
  }
  return undefined;
}

function checkInternal(source: Location, target: Location, typeOnly: boolean): Rule | undefined {
  if (source.kind !== "layer") return undefined;

  if (target.kind === "generated") {
    const allowed =
      source.layer === "main" || (source.layer === "frameworks" && source.folder === "database");
    return allowed ? undefined : "R7";
  }
  if (target.kind !== "layer") return undefined;

  if (LAYERS.indexOf(target.layer) > LAYERS.indexOf(source.layer)) {
    return INWARD_RULE[source.layer];
  }

  if (
    source.layer === "frameworks" &&
    target.layer === "frameworks" &&
    source.folder !== undefined &&
    target.folder !== source.folder
  ) {
    return "R8";
  }

  if (source.layer === "interface-adapters" && target.layer === "use-cases" && !typeOnly) {
    return "R9";
  }

  return undefined;
}

export function checkImports(files: Readonly<Record<string, string>>): Violation[] {
  const violations: Violation[] = [];

  for (const [file, content] of Object.entries(files)) {
    if (!file.startsWith("src/")) continue;
    const source = locate(file);

    for (const { specifier, typeOnly } of importsOf(content)) {
      const rule = specifier.startsWith(".")
        ? checkInternal(source, locate(posix.join(posix.dirname(file), specifier)), typeOnly)
        : checkExternal(source, specifier);
      if (rule) violations.push({ file, imported: specifier, rule });
    }
  }

  return violations;
}
