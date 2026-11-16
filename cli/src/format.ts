import * as prettier from "prettier";
import type { Plan } from "./add/apply.ts";

const FORMATTED = /\.(ts|json|md|ya?ml)$/;

/**
 * Da a los archivos generados el formato del proyecto, en memoria y con la configuración del propio
 * proyecto, para que `npm run verify` (que comprueba el formato) pase sin ejecutar nada externo.
 */
export async function formatPlan(plan: Plan, readConfig: () => string | undefined): Promise<Plan> {
  const raw = readConfig();
  const config = raw === undefined ? {} : (JSON.parse(raw) as prettier.Options);
  const format = async (path: string, content: string): Promise<string> =>
    FORMATTED.test(path) ? prettier.format(content, { ...config, filepath: path }) : content;

  const created = new Map<string, string>();
  for (const [path, content] of plan.created) created.set(path, await format(path, content));
  const updated = new Map<string, string>();
  for (const [path, content] of plan.updated) updated.set(path, await format(path, content));
  return { created, updated };
}
