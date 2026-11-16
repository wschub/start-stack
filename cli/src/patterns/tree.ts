import { planChanges } from "../add/apply.ts";
import { formatPlan } from "../format.ts";
import type { Architecture } from "../registry.ts";
import type { Tree } from "../template.ts";
import type { PatternId } from "./pattern.ts";
import { inApplicationOrder, PATTERNS } from "./registry.ts";

const MIGRATION_DIR = /^prisma\/migrations\/([^/]+)\/migration\.sql$/;

/** Carpetas de `prisma/migrations` que hay en un árbol de archivos. */
export function migrationsIn(paths: Iterable<string>): string[] {
  return [...paths].flatMap((path) => MIGRATION_DIR.exec(path)?.[1] ?? []);
}

/**
 * Aplica los patrones sobre la plantilla, en memoria, antes de renombrarla: archivos nuevos, inserciones
 * sobre los marcadores y el nombre de cada patrón en el manifiesto. Es lo que hace `create` con los
 * patrones que se eligieron; `add pattern` hace lo mismo sobre un proyecto que ya está en disco.
 */
export async function applyPatternsToTree(
  tree: Tree,
  ids: readonly PatternId[],
  architecture: Architecture,
  now: Date,
): Promise<void> {
  const text = (path: string): string | undefined => tree.get(path)?.toString("utf8");

  for (const id of inApplicationOrder(ids)) {
    const rendered = PATTERNS[id].render({
      architecture,
      migrations: migrationsIn(tree.keys()),
      now,
    });
    const plan = planChanges(rendered, text);

    const manifest = JSON.parse(text(".scaffold.json") ?? "{}") as { patterns?: string[] };
    manifest.patterns = [...(manifest.patterns ?? []), id];
    plan.updated.set(".scaffold.json", `${JSON.stringify(manifest, null, 2)}\n`);

    const formatted = await formatPlan(plan, () => text(".prettierrc.json"));
    for (const [path, content] of [...formatted.created, ...formatted.updated]) {
      tree.set(path, Buffer.from(content));
    }
  }
}
