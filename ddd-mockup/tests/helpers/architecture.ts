import { posix } from "node:path";

/**
 * Función de aptitud de la arquitectura DDD: revisa los imports de src/ y devuelve los que
 * incumplen las reglas de dependencia (R1–R12 de docs/ARCHITECTURE.md).
 *
 * Dentro de cada contexto las capas dependen hacia el dominio:
 *
 *   presentation ──► application ──► domain ◄── infrastructure
 *
 * Y cada contexto guarda su modelo para sí: de otro contexto solo se usa la capa de aplicación.
 *
 * Es una función pura: recibe un mapa "ruta → contenido" y no toca el disco.
 */

export type Rule =
  "R1" | "R2" | "R3" | "R4" | "R5" | "R6" | "R7" | "R8" | "R9" | "R10" | "R11" | "R12";

export interface Violation {
  /** Archivo que contiene el import, por ejemplo "src/contexts/identity/domain/aggregates/user.ts". */
  file: string;
  /** Especificador tal como está escrito en el import. */
  imported: string;
  rule: Rule;
}

type Layer = "domain" | "application" | "infrastructure" | "presentation";

/** "contexts": contextos delimitados del negocio. "platform": capacidades técnicas (health…). */
type Root = "contexts" | "platform";

type Location =
  | {
      kind: "layer";
      root: Root;
      /** Contexto o capacidad, con su raíz: "contexts/identity", "platform/health". */
      unit: string;
      layer: Layer;
      /** Carpeta dentro de la capa: "aggregates", "value-objects", "commands"… */
      folder: string | undefined;
    }
  | { kind: "shared" }
  | { kind: "generated" }
  | { kind: "composition" }
  | { kind: "other" };

const LAYERS: readonly string[] = ["domain", "application", "infrastructure", "presentation"];

/** Librerías de web, base de datos, log y criptografía vetadas en dominio y aplicación (R7). */
const FORBIDDEN_IN_CORE: readonly string[] = [
  "express",
  "cors",
  "helmet",
  "cookie-parser",
  "express-rate-limit",
  "pg",
  "pino",
  "jose",
  "@node-rs/argon2",
  "zod",
];
const FORBIDDEN_PREFIXES_IN_CORE: readonly string[] = ["@prisma/", "pino-"];

const IMPORT_PATTERN = /\b(?:from\s*|import\s*\(\s*|import\s*)(["'])([^"'\n]+)\1/g;

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

function importsOf(source: string): string[] {
  const specifiers: string[] = [];
  for (const match of stripComments(source).matchAll(IMPORT_PATTERN)) {
    if (match[2]) specifiers.push(match[2]);
  }
  return specifiers;
}

function locate(path: string): Location {
  if (path === "src/composition.ts") return { kind: "composition" };
  if (path.startsWith("src/generated/")) return { kind: "generated" };
  if (path.startsWith("src/shared/")) return { kind: "shared" };

  const [, root, name, layer, ...rest] = path.split("/");
  if ((root === "contexts" || root === "platform") && name && layer && LAYERS.includes(layer)) {
    return {
      kind: "layer",
      root,
      unit: `${root}/${name}`,
      layer: layer as Layer,
      // Con un solo segmento restante el archivo está suelto en la capa, sin carpeta.
      folder: rest.length > 1 ? rest[0] : undefined,
    };
  }
  return { kind: "other" };
}

/** "@prisma/client/runtime" → "@prisma/client"; "zod/v4" → "zod". */
function packageName(specifier: string): string {
  const [first = "", second] = specifier.split("/");
  return first.startsWith("@") && second ? `${first}/${second}` : first;
}

function isForbiddenInCore(specifier: string): boolean {
  const name = packageName(specifier);
  return (
    FORBIDDEN_IN_CORE.includes(name) ||
    FORBIDDEN_PREFIXES_IN_CORE.some((prefix) => name.startsWith(prefix))
  );
}

function checkExternal(source: Location, specifier: string): Rule | undefined {
  if (specifier.startsWith("node:")) return undefined;
  if (source.kind !== "layer") return undefined;
  if (source.layer !== "domain" && source.layer !== "application") return undefined;

  if (isForbiddenInCore(specifier)) return "R7";
  return source.layer === "domain" ? "R1" : undefined;
}

function checkInternal(source: Location, target: Location): Rule | undefined {
  if (target.kind === "generated") {
    const allowed =
      source.kind === "composition" ||
      (source.kind === "layer" && source.layer === "infrastructure");
    return allowed ? undefined : "R6";
  }

  if (source.kind === "shared") {
    return target.kind === "layer" ? "R5" : undefined;
  }
  if (source.kind !== "layer") return undefined;

  if (source.layer === "domain") {
    const allowed =
      target.kind === "shared" || (target.kind === "layer" && target.layer === "domain");
    if (!allowed) return "R1";
  }

  if (source.layer === "application") {
    const allowed =
      target.kind === "shared" ||
      (target.kind === "layer" && (target.layer === "domain" || target.layer === "application"));
    if (!allowed) return "R2";
  }

  if (target.kind !== "layer") return undefined;

  if (source.layer === "presentation" && target.layer === "infrastructure") return "R3";
  if (source.layer === "infrastructure" && target.layer === "presentation") return "R4";

  if (target.unit !== source.unit) {
    if (source.root === "platform" && target.root === "contexts") return "R11";
    if (target.layer !== "application") return "R10";
  }

  if (isDomainLeaf(source) && !isDomainLeaf(target)) return "R12";

  return undefined;
}

/** Los objetos de valor y los eventos son las hojas del dominio: no conocen a quien los usa. */
function isDomainLeaf(location: Location): boolean {
  return (
    location.kind === "layer" &&
    location.layer === "domain" &&
    (location.folder === "value-objects" || location.folder === "events")
  );
}

/** R8: el núcleo (dominio y aplicación) no conoce HTTP, aunque viva en shared. */
function importsHttpFromCore(source: Location, targetPath: string): boolean {
  if (source.kind !== "layer" || !targetPath.startsWith("src/shared/http/")) return false;
  return source.layer === "domain" || source.layer === "application";
}

/** R9: la configuración solo se lee en los puntos de entrada; el resto la recibe por parámetros. */
function readsConfigOutsideEntryPoints(file: string, targetPath: string): boolean {
  if (!targetPath.startsWith("src/config/")) return false;
  const allowed =
    file === "src/main.ts" ||
    file === "src/composition.ts" ||
    file.startsWith("src/cli/") ||
    file.startsWith("src/config/");
  return !allowed;
}

function checkRelative(file: string, source: Location, imported: string): Rule | undefined {
  const targetPath = posix.join(posix.dirname(file), imported);
  const layerRule = checkInternal(source, locate(targetPath));
  if (layerRule) return layerRule;
  if (importsHttpFromCore(source, targetPath)) return "R8";
  if (readsConfigOutsideEntryPoints(file, targetPath)) return "R9";
  return undefined;
}

export function checkImports(files: Readonly<Record<string, string>>): Violation[] {
  const violations: Violation[] = [];

  for (const [file, content] of Object.entries(files)) {
    if (!file.startsWith("src/")) continue;
    const source = locate(file);

    for (const imported of importsOf(content)) {
      const rule = imported.startsWith(".")
        ? checkRelative(file, source, imported)
        : checkExternal(source, imported);
      if (rule) violations.push({ file, imported, rule });
    }
  }

  return violations;
}
