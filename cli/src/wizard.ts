import { CancelError, UserError } from "./errors.ts";
import {
  isSupported,
  type ProjectOptions,
  validateChoice,
  validateProjectName,
} from "./options.ts";
import { type Architecture, FIXED_FEATURES, STEPS, type Step, stepById } from "./registry.ts";
import type { Prompter, Ui } from "./ui.ts";

/** Lo que el usuario indicó en la terminal. `undefined` = no lo indicó. */
export interface Flags {
  name?: string | undefined;
  choices: Partial<Record<string, string>>;
  docker?: boolean | undefined;
  git?: boolean | undefined;
  install?: boolean | undefined;
  database?: boolean | undefined;
  /** Sin preguntas: lo que no se indicó toma su valor por defecto. */
  yes: boolean;
}

export interface WizardEnvironment {
  prompter: Prompter;
  ui: Ui;
  /** Solo se consulta si hace falta decidir sobre la base de datos. */
  isDockerAvailable: () => Promise<boolean>;
}

async function askChoice(step: Step, env: WizardEnvironment): Promise<string> {
  for (;;) {
    const value = await env.prompter.select({
      message: step.question,
      initial: step.default,
      options: step.choices.map((choice) => ({
        value: choice.value,
        label: choice.supported ? choice.label : `${choice.label} (coming soon)`,
        ...(choice.hint === undefined ? {} : { hint: choice.hint }),
      })),
    });
    if (isSupported(step, value)) return value;
    env.ui.warn(
      `${step.question}: "${value}" is not supported yet. Pick one of the other options.`,
    );
  }
}

async function decideChoice(step: Step, flags: Flags, env: WizardEnvironment): Promise<string> {
  const given = flags.choices[step.id] ?? flags.choices[step.flag];
  if (given !== undefined) {
    validateChoice(step, given);
    return given;
  }
  return flags.yes ? step.default : askChoice(step, env);
}

async function decideBoolean(
  given: boolean | undefined,
  flags: Flags,
  env: WizardEnvironment,
  question: { message: string; initial: boolean },
): Promise<boolean> {
  if (given !== undefined) return given;
  return flags.yes ? question.initial : env.prompter.confirm(question);
}

/**
 * Reúne todas las opciones del proyecto: lo que vino en la terminal se respeta y se valida; lo demás
 * se pregunta, o toma su valor por defecto con `--yes`.
 */
export async function collectOptions(
  flags: Flags,
  env: WizardEnvironment,
): Promise<ProjectOptions> {
  let name = flags.name;
  if (name === undefined) {
    if (flags.yes) throw new UserError("The project name is required: start-stack create <name>.");
    name = await env.prompter.text({
      message: "Project name",
      placeholder: "my-api",
      validate: (value) => validateProjectName(value.trim()),
    });
  }
  name = name.trim();
  const invalid = validateProjectName(name);
  if (invalid) throw new UserError(`Invalid project name "${name}". ${invalid}`);

  const chosen: Record<string, string> = {};
  for (const step of STEPS) {
    chosen[step.id] = await decideChoice(stepById(step.id), flags, env);
  }
  if (!flags.yes) for (const feature of FIXED_FEATURES) env.ui.info(feature);

  const docker = await decideBoolean(flags.docker, flags, env, {
    message: "Include a Dockerfile and a container for the API?",
    initial: true,
  });
  const git = await decideBoolean(flags.git, flags, env, {
    message: "Initialise a git repository?",
    initial: true,
  });
  const install = await decideBoolean(flags.install, flags, env, {
    message: "Install dependencies now?",
    initial: true,
  });

  // Preparar la base de datos exige las dependencias y Docker: si falta alguna, ni se pregunta.
  let database = false;
  if (install && (await env.isDockerAvailable())) {
    database = await decideBoolean(flags.database, flags, env, {
      message: "Start the database and create the super administrator now?",
      initial: true,
    });
  } else if (flags.database === true) {
    throw new UserError(
      "--database needs the dependencies installed and Docker running (drop --no-install, start Docker).",
    );
  }

  return {
    name,
    type: chosen.type as ProjectOptions["type"],
    architecture: chosen.architecture as Architecture,
    language: chosen.language as ProjectOptions["language"],
    auth: chosen.auth as ProjectOptions["auth"],
    frontend: chosen.frontend as ProjectOptions["frontend"],
    packageManager: chosen.packageManager as ProjectOptions["packageManager"],
    docker,
    git,
    install,
    database,
  };
}

export { CancelError };
