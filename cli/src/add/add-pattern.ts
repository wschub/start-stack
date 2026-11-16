import { readdirSync } from "node:fs";
import { join } from "node:path";
import { UserError } from "../errors.ts";
import { migrationsIn } from "../patterns/tree.ts";
import { patternById, validatePatternSet } from "../patterns/registry.ts";
import {
  type AddDeps,
  manifestWith,
  readIfExists,
  readManifest,
  runStep,
  writePlan,
} from "./add.ts";
import { planChanges } from "./apply.ts";

export interface AddPatternFlags {
  id: string | undefined;
  dryRun: boolean;
  /** Aplica también la migración (necesita la base de datos arriba). */
  migrate: boolean;
}

function existingMigrations(cwd: string): string[] {
  try {
    return readdirSync(join(cwd, "prisma/migrations"), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
  } catch {
    return [];
  }
}

/** `start-stack add pattern <id>`: aplica un patrón a un proyecto existente. */
export async function addPattern(flags: AddPatternFlags, deps: AddDeps): Promise<void> {
  const { manifest, architecture } = readManifest(deps.cwd);
  if (flags.id === undefined) throw new UserError("Usage: start-stack add pattern <name>.");
  const pattern = patternById(flags.id);

  const applied = Array.isArray(manifest.patterns) ? (manifest.patterns as string[]) : [];
  if (applied.includes(pattern.id)) {
    throw new UserError(`The pattern "${pattern.id}" is already in .scaffold.json.`);
  }
  validatePatternSet([...applied, pattern.id]);

  const rendered = pattern.render({
    architecture,
    migrations: migrationsIn(
      existingMigrations(deps.cwd).map((dir) => `prisma/migrations/${dir}/migration.sql`),
    ),
    now: new Date(),
  });
  const plan = planChanges(rendered, (path) => readIfExists(deps.cwd, path));
  plan.updated.set(
    ".scaffold.json",
    manifestWith(manifest, { app: false, key: "patterns" }, pattern.id),
  );

  if (flags.dryRun) {
    deps.ui.info(
      `Dry run: ${plan.created.size} files would be created and ${plan.updated.size} updated.`,
    );
    deps.ui.note(
      [
        ...[...plan.created.keys()].sort().map((path) => `+ ${path}`),
        ...[...plan.updated.keys()].sort().map((path) => `~ ${path}`),
      ].join("\n"),
      "Files",
    );
    deps.ui.outro("Nothing was written.");
    return;
  }

  await deps.ui.task(`Adding the ${pattern.id} pattern (${architecture})`, async () => {
    await writePlan(deps.cwd, plan);
  });

  const pending: string[] = [];
  if (!(await runStep(deps, "Formatting the Prisma schema", "npx", ["prisma", "format"]))) {
    pending.push("npx prisma format");
  }
  if (!(await runStep(deps, "Generating the Prisma client", "npm", ["run", "db:generate"]))) {
    pending.push("npm run db:generate");
  }
  // La migración ya viene escrita: solo hay que aplicarla.
  if (flags.migrate) {
    if (!(await runStep(deps, "Applying the migration", "npm", ["run", "db:migrate"]))) {
      pending.push("npm run db:migrate");
    }
  } else {
    pending.push("npm run db:migrate");
  }

  deps.ui.note([...pending, "npm run verify"].join("\n"), "Next steps");
  deps.ui.outro(`Added ${pattern.id}. ${pattern.fit}`);
}
