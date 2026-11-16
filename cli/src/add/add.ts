import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { UserError } from "../errors.ts";
import type { Architecture } from "../registry.ts";
import { ARCHITECTURES } from "../registry.ts";
import type { Runner } from "../runner.ts";
import type { Prompter, Ui } from "../ui.ts";
import { planChanges } from "./apply.ts";
import type { Rendered } from "./common.ts";
import { renderClean } from "./render-clean.ts";
import { renderDdd } from "./render-ddd.ts";
import { renderHexagonal } from "./render-hexagonal.ts";
import { buildSpec, type ModuleSpec, snake } from "./spec.ts";

export interface AddDeps {
  prompter: Prompter;
  ui: Ui;
  runner: Runner;
  cwd: string;
}

export interface AddFlags {
  name: string | undefined;
  entity: string | undefined;
  fields: readonly string[];
  dryRun: boolean;
  migrate: boolean;
  yes: boolean;
}

const RENDERERS: Record<Architecture, (spec: ModuleSpec) => Rendered> = {
  hexagonal: renderHexagonal,
  ddd: renderDdd,
  clean: renderClean,
};

/** Dónde anota el manifiesto lo que se añade: en DDD son contextos, en las demás, módulos. */
const MANIFEST_LIST: Record<Architecture, "modules" | "contexts"> = {
  hexagonal: "modules",
  ddd: "contexts",
  clean: "modules",
};

interface Manifest {
  apps?: Record<string, unknown>[];
}

function readManifest(cwd: string): { manifest: Manifest; architecture: Architecture } {
  const path = join(cwd, ".scaffold.json");
  if (!existsSync(path)) {
    throw new UserError(
      "There is no .scaffold.json here. Run this command from the root of a project created with start-stack.",
    );
  }
  let manifest: Manifest;
  try {
    manifest = JSON.parse(readFileSync(path, "utf8")) as Manifest;
  } catch {
    throw new UserError(".scaffold.json is not valid JSON.");
  }
  const app = manifest.apps?.[0];
  const architecture = ARCHITECTURES.find((candidate) => candidate === app?.["architecture"]);
  if (!architecture) {
    throw new UserError(
      `The architecture in .scaffold.json is not supported (expected one of: ${ARCHITECTURES.join(", ")}).`,
    );
  }
  return { manifest, architecture };
}

function readIfExists(cwd: string, path: string): string | undefined {
  const full = join(cwd, path);
  return existsSync(full) ? readFileSync(full, "utf8") : undefined;
}

async function runStep(
  deps: AddDeps,
  title: string,
  command: string,
  args: string[],
): Promise<boolean> {
  const failure = { output: "" };
  try {
    await deps.ui.task(title, async () => {
      const result = await deps.runner.run(command, args, { cwd: deps.cwd });
      if (result.code !== 0) {
        failure.output = result.output;
        throw new Error(`${command} exited with code ${result.code}`);
      }
    });
    return true;
  } catch {
    const detail = failure.output.trim().split("\n").slice(-15).join("\n");
    deps.ui.error(`${title} failed.${detail ? `\n${detail}` : ""}`);
    return false;
  }
}

/** `start-stack add module <nombre>`: crea un módulo (o contexto, o funcionalidad) completo y lo conecta. */
export async function addModule(flags: AddFlags, deps: AddDeps): Promise<void> {
  const { manifest, architecture } = readManifest(deps.cwd);

  let name = flags.name;
  if (name === undefined) {
    if (flags.yes) throw new UserError("Usage: start-stack add module <name>.");
    name = await deps.prompter.text({
      message: "Module name (lowercase, hyphens allowed)",
      placeholder: "products",
    });
  }
  const spec = buildSpec({ module: name, entity: flags.entity, fields: flags.fields });
  const rendered = RENDERERS[architecture](spec);
  const plan = planChanges(rendered, (path) => readIfExists(deps.cwd, path));

  const touched = [...plan.created.keys(), ...plan.updated.keys()].sort();
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

  await deps.ui.task(`Adding ${spec.module} (${architecture})`, async () => {
    for (const [path, content] of [...plan.created, ...plan.updated]) {
      const full = join(deps.cwd, path);
      mkdirSync(dirname(full), { recursive: true });
      writeFileSync(full, content);
    }
    const listName = MANIFEST_LIST[architecture];
    const app = manifest.apps?.[0];
    if (app) {
      const current = Array.isArray(app[listName]) ? (app[listName] as string[]) : [];
      app[listName] = [...current, spec.module];
      writeFileSync(join(deps.cwd, ".scaffold.json"), `${JSON.stringify(manifest, null, 2)}\n`);
    }
  });

  const pending: string[] = [];
  const migration = `add_${snake(spec.module)}`;
  await runStep(deps, "Formatting the new code", "npx", [
    "prettier",
    "--write",
    ".scaffold.json",
    ...touched,
  ]);
  if (!(await runStep(deps, "Formatting the Prisma schema", "npx", ["prisma", "format"]))) {
    pending.push("npx prisma format");
  }
  if (flags.migrate) {
    if (
      !(await runStep(deps, "Creating the migration", "npx", [
        "prisma",
        "migrate",
        "dev",
        "--name",
        migration,
      ]))
    ) {
      pending.push(`npx prisma migrate dev --name ${migration}`);
    }
  } else {
    pending.push(`npx prisma migrate dev --name ${migration}`);
  }
  if (!(await runStep(deps, "Generating the Prisma client", "npm", ["run", "db:generate"]))) {
    pending.push("npm run db:generate");
  }

  deps.ui.note(
    [
      ...pending,
      "npm run verify",
      "",
      `Permissions "${spec.module}:read" and "${spec.module}:manage" now exist: assign them to a role.`,
    ].join("\n"),
    "Next steps",
  );
  deps.ui.outro(`Added ${spec.module}. Review the generated code, then commit it.`);
}
