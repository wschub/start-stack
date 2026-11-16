import { existsSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { addModule } from "./add/add.ts";
import { banner } from "./banner.ts";
import { CancelError, UserError } from "./errors.ts";
import { generateJwtSecret, renderProject, writeTree } from "./generate.ts";
import { type PostResult, runPostSteps } from "./post.ts";
import { ARCHITECTURE_INFO, STEPS } from "./registry.ts";
import { isDockerAvailable, type Runner } from "./runner.ts";
import { readTemplate, type Tree } from "./template.ts";
import type { Prompter, Ui } from "./ui.ts";
import { collectOptions, type Flags } from "./wizard.ts";

export interface Dependencies {
  prompter: Prompter;
  ui: Ui;
  runner: Runner;
  /** Carpeta desde la que se ejecuta el comando; el proyecto se crea dentro. */
  cwd: string;
  cliVersion: string;
  findFreePort: () => Promise<number>;
  /** Por defecto lee la plantilla de la maqueta. Las pruebas pasan una pequeña. */
  readTemplate?: typeof readTemplate;
}

export const HELP = `start-stack — scaffold a tested backend from a reference architecture

Usage
  start-stack create <name> [options]
  start-stack add module <name> [options]

Options
  --architecture <hexagonal|ddd|clean>   architecture of the project (default: hexagonal)
  --type, --language, --auth, --frontend, --package-manager
                                         other choices; only the default is supported for now
  --no-docker                            leave out the Dockerfile and the API container
  --no-git                               do not initialise a git repository
  --no-install                           do not install dependencies
  --no-database                          do not start Postgres or create the super administrator
  -y, --yes                              no questions: use the defaults for what is not given
  --dry-run                              list what would be created and write nothing
  -h, --help                             show this help
  -v, --version                          show the version

Options for add module
  --entity <name>                        singular name of the entity (default: the module name)
  --field <name:type>                    a field, repeatable; types: string, int, boolean, datetime
                                         (default: name:string)
  --migrate                              also create the Prisma migration (needs the database up)
  --dry-run                              list what would change and write nothing

Coming later: doctor.`;

function parseFlags(argv: readonly string[]) {
  const choiceFlags = Object.fromEntries(
    STEPS.map((step) => [step.flag, { type: "string" as const }]),
  );
  try {
    return parseArgs({
      args: [...argv],
      allowPositionals: true,
      allowNegative: true,
      options: {
        ...choiceFlags,
        docker: { type: "boolean" },
        git: { type: "boolean" },
        install: { type: "boolean" },
        database: { type: "boolean" },
        entity: { type: "string" },
        field: { type: "string", multiple: true },
        migrate: { type: "boolean" },
        yes: { type: "boolean", short: "y" },
        "dry-run": { type: "boolean" },
        help: { type: "boolean", short: "h" },
        version: { type: "boolean", short: "v" },
      },
    });
  } catch (error) {
    throw new UserError(`${(error as Error).message}\n\n${HELP}`);
  }
}

function targetDirectory(cwd: string, name: string): string {
  const dir = resolve(cwd, name);
  if (existsSync(dir) && readdirSync(dir).length > 0) {
    throw new UserError(`The directory "${name}" already exists and is not empty.`);
  }
  return dir;
}

function nextSteps(name: string, guide: string, result: PostResult): string {
  const lines = [`cd ${name}`];
  if (result.manual.length > 0) lines.push(...result.manual);
  lines.push(
    "npm run dev",
    "",
    "Then open http://localhost:3000/health/ready",
    `First entity: ${guide}`,
  );
  return lines.join("\n");
}

async function create(
  positionals: readonly string[],
  values: ReturnType<typeof parseFlags>["values"],
  deps: Dependencies,
): Promise<void> {
  if (positionals.length > 1) {
    throw new UserError(
      `Unexpected argument "${positionals[1]}". Usage: start-stack create <name>.`,
    );
  }
  const yes = values.yes === true;
  const dryRun = values["dry-run"] === true;
  if (!yes) deps.ui.intro(banner(deps.cliVersion));

  const choices: Partial<Record<string, string>> = {};
  for (const step of STEPS) {
    const value = (values as Record<string, unknown>)[step.flag];
    if (typeof value === "string") choices[step.id] = value;
  }
  const flags: Flags = {
    name: positionals[0],
    choices,
    docker: values.docker,
    git: values.git,
    install: values.install,
    database: values.database,
    yes,
  };
  const options = await collectOptions(flags, {
    prompter: deps.prompter,
    ui: deps.ui,
    isDockerAvailable: () => isDockerAvailable(deps.runner, deps.cwd),
  });

  const dir = targetDirectory(deps.cwd, options.name);
  const info = ARCHITECTURE_INFO[options.architecture];
  const template: Tree = (deps.readTemplate ?? readTemplate)(options.architecture);
  const tree = renderProject(template, {
    name: options.name,
    architecture: options.architecture,
    docker: options.docker,
    dbPort: await deps.findFreePort(),
    cliVersion: deps.cliVersion,
    jwtSecret: generateJwtSecret(),
  });

  if (dryRun) {
    deps.ui.info(`Dry run: ${tree.size} files would be created in ${options.name}/`);
    deps.ui.note([...tree.keys()].sort().join("\n"), "Files");
    deps.ui.outro("Nothing was written.");
    return;
  }

  await deps.ui.task(`Creating ${options.name}/ (${options.architecture})`, async () => {
    writeTree(dir, tree);
  });

  const result = await runPostSteps({
    options,
    dir,
    runner: deps.runner,
    ui: deps.ui,
    prompter: deps.prompter,
    yes,
  });

  deps.ui.note(nextSteps(options.name, info.guide, result), "Next steps");
  deps.ui.outro(`Done. Start with ${join(options.name, "README.md")}`);
}

/** Punto de entrada del CLI. Devuelve el código de salida del proceso. */
export async function main(argv: readonly string[], deps: Dependencies): Promise<number> {
  try {
    const { values, positionals } = parseFlags(argv);
    if (values.version) {
      deps.ui.info(deps.cliVersion);
      return 0;
    }
    if (values.help || positionals.length === 0) {
      deps.ui.info(HELP);
      return values.help || argv.length === 0 ? 0 : 1;
    }
    const [command, ...rest] = positionals;
    if (command === "create") {
      await create(rest, values, deps);
      return 0;
    }
    if (command === "add") {
      const [kind, ...args] = rest;
      if (kind !== "module") {
        throw new UserError(
          `Unknown "add" target "${kind ?? ""}". Usage: start-stack add module <name>.`,
        );
      }
      if (args.length > 1) {
        throw new UserError(
          `Unexpected argument "${args[1]}". Usage: start-stack add module <name>.`,
        );
      }
      await addModule(
        {
          name: args[0],
          entity: values.entity,
          fields: values.field ?? [],
          dryRun: values["dry-run"] === true,
          migrate: values.migrate === true,
          yes: values.yes === true,
        },
        { prompter: deps.prompter, ui: deps.ui, runner: deps.runner, cwd: deps.cwd },
      );
      return 0;
    }
    if (command === "doctor") {
      throw new UserError(`"doctor" is not available yet.`);
    }
    throw new UserError(`Unknown command "${command ?? ""}".\n\n${HELP}`);
  } catch (error) {
    if (error instanceof CancelError) {
      deps.ui.warn("Cancelled. Nothing else was done.");
      return 130;
    }
    if (error instanceof UserError) {
      deps.ui.error(error.message);
      return 1;
    }
    throw error;
  }
}
