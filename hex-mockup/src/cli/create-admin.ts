import { createInterface } from "node:readline/promises";
import { Writable } from "node:stream";
import { parseArgs } from "node:util";
import { composeApp } from "../composition.ts";
import { EnvError, loadEnv } from "../config/env.ts";
import { AppError } from "../shared/errors/app-error.ts";
import { translate } from "../shared/i18n/messages.ts";

/**
 * Crea el primer superadministrador (o concede el rol SUPER_ADMIN a una cuenta existente).
 *
 *   npm run admin:create                                   pregunta los datos
 *   npm run admin:create -- --email ana@example.com --first-name Ana --last-name Gómez
 *
 * La contraseña se pregunta sin mostrarla. Para ejecutarlo sin terminal interactiva (CI, Docker)
 * pásala en la variable de entorno ADMIN_PASSWORD; nunca como argumento, porque los argumentos
 * quedan en el historial de la consola y en la lista de procesos.
 */

const USAGE = `Usage: npm run admin:create -- [--email <email>] [--first-name <name>] [--last-name <name>]
The password is prompted for, or read from the ADMIN_PASSWORD environment variable.`;

async function ask(question: string, options: { hidden?: boolean } = {}): Promise<string> {
  if (!process.stdin.isTTY) {
    throw new Error(
      `Missing value for "${question.trim()}" and there is no interactive terminal.\n${USAGE}`,
    );
  }
  let muted = false;
  const output = new Writable({
    write(chunk, encoding, callback) {
      if (!muted) process.stdout.write(chunk, encoding);
      callback();
    },
  });
  const readline = createInterface({ input: process.stdin, output, terminal: true });
  try {
    const answer = readline.question(question);
    muted = options.hidden ?? false;
    return (await answer).trim();
  } finally {
    readline.close();
    if (options.hidden) process.stdout.write("\n");
  }
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      email: { type: "string" },
      "first-name": { type: "string" },
      "last-name": { type: "string" },
      help: { type: "boolean", short: "h" },
    },
  });
  if (values.help) {
    console.log(USAGE);
    return;
  }

  const env = loadEnv({ ...process.env, LOG_LEVEL: "silent" });
  const email = values.email ?? (await ask("Email: "));
  const firstName = values["first-name"] ?? (await ask("First name: "));
  const lastName = values["last-name"] ?? (await ask("Last name: "));
  const password =
    process.env.ADMIN_PASSWORD ??
    (await ask("Password (only used if the account does not exist yet): ", { hidden: true }));

  const { createSuperAdmin, shutdown } = composeApp(env);
  try {
    const { user, created } = await createSuperAdmin.execute({
      email,
      password,
      firstName,
      lastName,
    });
    console.log(
      created
        ? `Super administrator created: ${user.email}`
        : `${user.email} already existed: the SUPER_ADMIN role was granted and the password was not changed.`,
    );
  } finally {
    await shutdown();
  }
}

try {
  await main();
} catch (error) {
  if (error instanceof AppError) {
    console.error(`Error: ${translate("en", error.code, "INTERNAL_ERROR")} (${error.code})`);
  } else if (error instanceof EnvError || error instanceof Error) {
    console.error(`Error: ${error.message}`);
  } else {
    console.error("Error: unexpected failure");
  }
  process.exitCode = 1;
}
