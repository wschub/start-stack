import type { ProjectOptions } from "./options.ts";
import type { Runner } from "./runner.ts";
import type { Prompter, Ui } from "./ui.ts";

export interface PostContext {
  options: ProjectOptions;
  /** Carpeta del proyecto recién generado. */
  dir: string;
  runner: Runner;
  ui: Ui;
  prompter: Prompter;
  /** Sin preguntas: no se puede pedir el superadministrador. */
  yes: boolean;
}

export interface PostResult {
  /** Comandos que el usuario debe ejecutar él mismo porque un paso se saltó o falló. */
  manual: string[];
  gitInitialised: boolean;
  installed: boolean;
  databaseReady: boolean;
  adminCreated: boolean;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const ADMIN_PASSWORD_MIN = 12;
export const ADMIN_PASSWORD_MAX = 128;

/** Un paso externo con indicador. Devuelve false (y muestra la salida) si el comando falla. */
async function step(
  ctx: PostContext,
  title: string,
  command: string,
  args: string[],
  env?: Record<string, string>,
): Promise<boolean> {
  const failure = { output: "" };
  try {
    await ctx.ui.task(title, async () => {
      const result = await ctx.runner.run(command, args, {
        cwd: ctx.dir,
        ...(env ? { env } : {}),
      });
      if (result.code !== 0) {
        failure.output = result.output;
        throw new Error(`${command} exited with code ${result.code}`);
      }
    });
    return true;
  } catch {
    const detail = failure.output.trim().split("\n").slice(-15).join("\n");
    ctx.ui.error(`${title} failed.${detail ? `\n${detail}` : ""}`);
    return false;
  }
}

async function initGit(ctx: PostContext): Promise<boolean> {
  if (!(await step(ctx, "Initialising git", "git", ["init", "-b", "main"]))) return false;
  if (!(await step(ctx, "Staging files", "git", ["add", "-A"]))) return false;
  // Antes de instalar: los hooks de git aún no existen y el primer commit no ejecuta las pruebas.
  return step(ctx, "Creating the first commit", "git", [
    "commit",
    "-m",
    "chore: initial commit from start-stack",
  ]);
}

async function createAdmin(ctx: PostContext): Promise<boolean> {
  const { prompter } = ctx;
  const email = await prompter.text({
    message: "Super administrator email",
    placeholder: "admin@example.com",
    validate: (value) => (EMAIL.test(value.trim()) ? undefined : "Enter a valid email."),
  });
  const firstName = await prompter.text({
    message: "First name",
    validate: (value) => (value.trim() === "" ? "Required." : undefined),
  });
  const lastName = await prompter.text({
    message: "Last name",
    validate: (value) => (value.trim() === "" ? "Required." : undefined),
  });
  const password = await prompter.password({
    message: `Password (${ADMIN_PASSWORD_MIN}-${ADMIN_PASSWORD_MAX} characters)`,
    validate: (value) =>
      value.length >= ADMIN_PASSWORD_MIN && value.length <= ADMIN_PASSWORD_MAX
        ? undefined
        : `Use between ${ADMIN_PASSWORD_MIN} and ${ADMIN_PASSWORD_MAX} characters.`,
  });

  // La contraseña viaja en una variable de entorno, nunca como argumento: los argumentos quedan
  // en la lista de procesos.
  return step(
    ctx,
    "Creating the super administrator",
    "npm",
    [
      "run",
      "admin:create",
      "--",
      "--email",
      email.trim(),
      "--first-name",
      firstName.trim(),
      "--last-name",
      lastName.trim(),
    ],
    { ADMIN_PASSWORD: password },
  );
}

/** Git, dependencias, base de datos y superadministrador. Un paso que falla no impide los demás. */
export async function runPostSteps(ctx: PostContext): Promise<PostResult> {
  const { options } = ctx;
  const result: PostResult = {
    manual: [],
    gitInitialised: false,
    installed: false,
    databaseReady: false,
    adminCreated: false,
  };

  if (options.git) {
    result.gitInitialised = await initGit(ctx);
    if (!result.gitInitialised) result.manual.push("git init -b main && git add -A && git commit");
  }

  if (options.install) {
    result.installed =
      (await step(ctx, "Installing dependencies", "npm", ["ci"])) &&
      (await step(ctx, "Generating the Prisma client", "npm", ["run", "db:generate"]));
    if (!result.installed) result.manual.push("npm ci", "npm run db:generate");
  } else {
    result.manual.push("npm ci", "npm run db:generate");
  }

  if (options.database && result.installed) {
    result.databaseReady =
      (await step(ctx, "Starting Postgres", "docker", [
        "compose",
        "up",
        "-d",
        "--wait",
        "postgres",
      ])) && (await step(ctx, "Applying the migrations", "npm", ["run", "db:migrate"]));

    if (!result.databaseReady) {
      result.manual.push("docker compose up -d --wait postgres", "npm run db:migrate");
    } else if (ctx.yes) {
      result.manual.push("npm run admin:create");
    } else {
      result.adminCreated = await createAdmin(ctx);
      if (!result.adminCreated) result.manual.push("npm run admin:create");
    }
  } else {
    result.manual.push("docker compose up -d --wait postgres", "npm run db:migrate");
    result.manual.push("npm run admin:create");
  }

  return result;
}
