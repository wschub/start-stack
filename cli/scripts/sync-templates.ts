/**
 * Copia las plantillas dentro del paquete antes de publicarlo: los archivos versionados de cada
 * maqueta de referencia, en `templates/<arquitectura>`. npm elimina los `.gitignore` al publicar,
 * así que se guardan como `_gitignore` y el generador los devuelve a su nombre.
 */
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { ARCHITECTURES } from "../src/registry.ts";
import { CLI_ROOT, readTemplate } from "../src/template.ts";

const out = join(CLI_ROOT, "templates");
rmSync(out, { recursive: true, force: true });

for (const architecture of ARCHITECTURES) {
  const tree = readTemplate(architecture);
  for (const [path, content] of tree) {
    const stored = path.replace(/(^|\/)\.gitignore$/, "$1_gitignore");
    const target = join(out, architecture, stored);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content);
  }
  console.log(`${architecture}: ${tree.size} files`);
}
