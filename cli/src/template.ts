import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { UserError } from "./errors.ts";
import { type Architecture, ARCHITECTURE_INFO } from "./registry.ts";

/** Árbol de archivos en memoria: ruta relativa con "/" → contenido. */
export type Tree = Map<string, Buffer>;

/** Raíz del paquete del CLI. Vale tanto desde `src/` como desde `dist/`. */
export const CLI_ROOT = fileURLToPath(new URL("..", import.meta.url));

function walk(dir: string, root: string, tree: Tree): void {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) walk(path, root, tree);
    else tree.set(relative(root, path).split(sep).join("/"), readFileSync(path));
  }
}

/**
 * Lee la plantilla de una arquitectura. Dentro del paquete publicado está en `templates/<arquitectura>`;
 * en el repositorio no hay copia: se leen los archivos versionados de la maqueta de referencia.
 */
export function readTemplate(architecture: Architecture): Tree {
  const packaged = join(CLI_ROOT, "templates", architecture);
  const tree: Tree = new Map();

  if (existsSync(packaged)) {
    walk(packaged, packaged, tree);
    return tree;
  }

  const mockup = join(CLI_ROOT, "..", ARCHITECTURE_INFO[architecture].mockup);
  if (!existsSync(mockup)) {
    throw new UserError(`The ${architecture} template is not available in this installation.`);
  }
  const listed = execFileSync("git", ["ls-files", "-z"], {
    cwd: mockup,
    maxBuffer: 64 * 1024 * 1024,
  });
  for (const file of listed.toString("utf8").split("\0")) {
    if (file === "") continue;
    const path = join(mockup, file);
    if (existsSync(path)) tree.set(file, readFileSync(path));
  }
  return tree;
}
